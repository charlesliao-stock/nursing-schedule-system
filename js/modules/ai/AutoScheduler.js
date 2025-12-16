import { RuleEngine } from "./RuleEngine.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "../../services/firebase/FirebaseService.js";

// AI 權重設定
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,      // 人力極缺 (加分)
    NEED_LOW: 10,       // 人力微缺
    PREFERENCE: 20,     // 員工願望/偏好 (Priority 1)
    PREFERENCE_2: 15,   // Priority 2
    PREFERENCE_3: 10,   // Priority 3
    CONTINUITY: 10,     // 連續上班 (適度獎勵)
    PENALTY_FATIGUE: -80, // 疲勞罰分 (如 N->D)
    RECOVERY: 20        // OFF 的恢復分
};

// 最大執行時間 (30秒)，避免瀏覽器卡死
const MAX_RUNTIME = 30000; 

export class AutoScheduler {

    /**
     * 執行自動排班
     * @param {Object} currentSchedule 當月排班資料物件
     * @param {Array} staffList 人員清單
     * @param {Object} unitSettings 單位規則設定
     * @param {Object} preScheduleData 上個月與預班資料
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動...");

        try {
            const db = firebaseService.getDb();
            let systemSettings = { weekStartDay: 1, firstShift: 'D' };
            try {
                // 嘗試讀取系統全域設定，若無則用預設
                const snap = await getDoc(doc(db, "system", "config"));
                if (snap.exists()) systemSettings = snap.data();
            } catch(e) { console.warn("無法讀取系統設定，使用預設值", e); }

            // 1. 準備運算環境 (Context)
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData, systemSettings);
            
            // 2. 預填「包班」需求 (如果有)
            this.prefillBatchShifts(context);

            console.log("🔹 開始每日步進排班...");
            
            // 3. 遞迴求解
            const success = await this.solveDay(1, context);

            if (success) {
                console.log(`✅ 排班成功！耗時: ${(Date.now() - context.startTime)/1000}s`);
                context.logs.push("運算成功：已完成所有人員排班");
            } else {
                console.warn(`⚠️ 排班中止 (可能超時或無解)，最後停留在 Day ${context.maxReachedDay}`);
                context.logs.push("警告：運算超時或部分規則無解，僅產生部分結果");
            }
            return { assignments: context.assignments, logs: context.logs };

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Critical Error: ${e.message}`] };
        }
    }

    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData, systemSettings) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {}; // 預班願望
        const historyData = preScheduleData.assignments || {}; // 上個月歷史 (修正欄位名稱)

        // 過濾並標準化人員清單
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 6;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

        // 初始化資料結構
        const assignments = {};
        const wishes = {}; 
        const preferences = {}; 
        const lastMonthShifts = {}; 
        const lastMonthConsecutive = {}; 

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            preferences[s.uid] = { p1: null, p2: null, p3: null, batch: null, monthlyMix: '2' }; 
            lastMonthShifts[s.uid] = 'OFF'; 
            lastMonthConsecutive[s.uid] = 0;
        });

        // 載入預班與歷史資料
        try {
            // A. 載入預班 (Wishes)
            Object.entries(submissions || {}).forEach(([uid, sub]) => {
                if (assignments[uid]) {
                    if (sub && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            wishes[uid][parseInt(d)] = wish;
                            // 強制將預班填入 assignments (鎖定)
                            assignments[uid][parseInt(d)] = (wish === 'M_OFF' ? 'OFF' : wish); 
                        });
                    }
                    if (sub && sub.preferences) {
                        preferences[uid] = {
                            p1: sub.preferences.priority1 || null,
                            p2: sub.preferences.priority2 || null,
                            p3: sub.preferences.priority3 || null, 
                            batch: sub.preferences.batch || null,
                            monthlyMix: sub.preferences.monthlyMix || '2'
                        };
                    }
                }
            });

            // B. 載入上個月歷史 (計算連續上班用)
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    // 找出上個月最後一天
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) {
                        const lastDay = days[0];
                        lastMonthShifts[uid] = history[lastDay];
                        
                        // 回推連續上班天數
                        let cons = 0;
                        for (let d of days) {
                            const shift = history[d];
                            if (shift && shift !== 'OFF' && shift !== 'M_OFF') cons++; else break; 
                        }
                        lastMonthConsecutive[uid] = cons;
                    }
                }
            });
        } catch(e) { console.warn("History parse error", e); }

        // 設定第 0 天 (上個月最後一天)
        validStaffList.forEach(s => {
            assignments[s.uid][0] = lastMonthShifts[s.uid] || 'OFF';
        });

        const staffReq = unitSettings.staffRequirements || {};
        const shiftDefs = settings.shifts || [{code:'D'}, {code:'E'}, {code:'N'}];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments, // 這裡已經包含預班鎖定的格子
            wishes: wishes,
            preferences: preferences,
            lastMonthShifts: lastMonthShifts,
            lastMonthConsecutive: lastMonthConsecutive, 
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
            systemSettings: systemSettings,
            logs: [],
            maxBacktrack: 30000, 
            backtrackCount: 0,
            maxReachedDay: 0,
            startTime: Date.now()
        };
    }

    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            const prefBatch = context.preferences[staff.uid]?.batch;
            const constraintBatch = staff.constraints?.batchPref;
            const batchType = constraintBatch || prefBatch;
            const canBatch = staff.constraints?.canBatch;

            // 如果員工可以包班且有偏好
            if ((canBatch || prefBatch) && batchType) {
                context.preferences[staff.uid].realBatch = batchType;
                const maxCons = staff.constraints.maxConsecutive || context.rules.maxConsecutiveWork || 6;
                let currentConsecutive = context.lastMonthConsecutive[staff.uid] || 0;

                for (let day = 1; day <= context.daysInMonth; day++) {
                    // 如果該格已被預班填佔，跳過並重置計數
                    if (context.assignments[staff.uid][day]) {
                        const existingShift = context.assignments[staff.uid][day];
                        if (existingShift === 'OFF' || existingShift === 'M_OFF') currentConsecutive = 0;
                        else currentConsecutive++;
                        continue; 
                    }

                    if (currentConsecutive >= maxCons) {
                        // 強制休假
                        context.assignments[staff.uid][day] = 'OFF';
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'forced_rest';
                        currentConsecutive = 0; 
                    } else {
                        // 填入包班班別
                        context.assignments[staff.uid][day] = batchType;
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'batch_auto';
                        currentConsecutive++; 
                    }
                }
            }
        });
    }

    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        if (Date.now() - context.startTime > MAX_RUNTIME) return false;

        this.adjustBatchOverstaffing(day, context);

        // 找出今天還沒排班的人 (已預班或包班的人會被過濾掉)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff); // 隨機排序以增加變異性

        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            // 每3天釋放一下 Event Loop 避免介面凍結
            if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            // 即使人力不足也強制繼續，避免完全卡死
            // context.logs.push(`[Day ${day}] 人力不足，強制推進`);
            await this.solveDay(day + 1, context);
            return true;
        }
    }

    static async solveRecursive(day, staffList, index, context) {
        if (Date.now() - context.startTime > MAX_RUNTIME) return false;
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        let possibleShifts = context.shiftDefs.map(s => s.code);
        if (!possibleShifts.includes('OFF')) possibleShifts.push('OFF');
        
        // 統計目前已排的人力
        const currentCounts = {};
        possibleShifts.forEach(k => currentCounts[k] = 0);
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF' && currentCounts[sh] !== undefined) {
                currentCounts[sh]++;
            }
        });
        const w = new Date(context.year, context.month - 1, day).getDay();

        // 產生候選班別並評分
        const candidates = [];
        for (const shift of possibleShifts) {
            const { valid } = this.checkHardConstraints(staff, shift, prevShift, context);
            if (!valid) continue; 

            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            candidates.push({ shift, score, details });
        }

        // 高分優先嘗試
        candidates.sort((a, b) => b.score - a.score);

        for (const cand of candidates) {
            const shift = cand.shift;
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            // 剪枝：如果人力已滿且分數不高，跳過 (加速運算)
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 120) continue; 

            context.assignments[staff.uid][day] = shift;
            
            // 使用 RuleEngine 進行嚴格檢查
            const ruleCheck = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints,
                context.assignments[staff.uid][0],        
                context.lastMonthConsecutive[staff.uid],  
                day,
                context.year, 
                context.month,
                context.systemSettings
            );

            if (!ruleCheck.errors[day]) {
                if (await this.solveRecursive(day, staffList, index + 1, context)) return true;
            }

            // 回溯
            delete context.assignments[staff.uid][day];
        }

        return false;
    }

    static checkHardConstraints(staff, shift, prevShift, context) {
        // 1. 間隔檢查 (簡易版)
        if (context.rules.constraints?.minInterval11h) {
            if ((prevShift === 'E' || prevShift.includes('E')) && (shift === 'D' || shift.includes('D'))) return { valid: false, reason: "間隔不足" };
        }
        // 2. 母性保護
        const isProtected = staff.constraints.isPregnant || staff.constraints.isPostpartum;
        if (isProtected && (shift.includes('N') || shift.includes('E'))) return { valid: false, reason: "母性保護" };
        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];
        const base = (shift === 'OFF') ? 50 : WEIGHTS.BASE;
        score += base;

        // A. 人力需求
        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            if (current < req) { score += WEIGHTS.NEED_HIGH; details.push("缺人++"); }
            else if (current >= req) { score -= 50; details.push("滿員--"); }
        }

        // B. 個人偏好
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { score += WEIGHTS.PREFERENCE; details.push("志願1"); }
        else if (prefs.p2 === shift) { score += WEIGHTS.PREFERENCE_2; details.push("志願2"); }
        
        // C. 連續性與疲勞
        if (prevShift === shift && shift !== 'OFF') { score += WEIGHTS.CONTINUITY; details.push("連班"); }
        if (prevShift.includes('N') && shift.includes('D')) { score += WEIGHTS.PENALTY_FATIGUE; details.push("N接D"); }
        
        // D. 適度休息
        const consecutive = this.calculateConsecutiveWork(staff.uid, day, context);
        if (shift === 'OFF' && consecutive > 5) { score += (consecutive * 15); details.push(`累${consecutive}需休`); }
        
        return { score, details: details.join(',') };
    }

    static adjustBatchOverstaffing(day, context) {
        // 如果包班的人太多導致爆量，隨機踢掉一些人去休假
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const shiftsToCheck = context.shiftDefs.map(s => s.code);
        
        shiftsToCheck.forEach(shift => {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (req === 0) return; 
            
            let totalCount = 0;
            context.staffList.forEach(s => { if (context.assignments[s.uid][day] === shift) totalCount++; });
            
            if (totalCount > req) {
                const assignedStaff = context.staffList.filter(s => {
                    const assigned = context.assignments[s.uid][day];
                    const tags = context.assignments[s.uid].autoTags || {};
                    return assigned === shift && tags[day] === 'batch_auto';
                });
                const cutCount = totalCount - req;
                // 優先讓連續上班多的人休假
                assignedStaff.sort((a, b) => {
                    const daysA = this.calculateConsecutiveWork(a.uid, day, context);
                    const daysB = this.calculateConsecutiveWork(b.uid, day, context);
                    return daysB - daysA; 
                });
                for (let i = 0; i < cutCount && i < assignedStaff.length; i++) {
                    context.assignments[assignedStaff[i].uid][day] = 'OFF';
                }
            }
        });
    }

    static calculateConsecutiveWork(uid, currentDay, context) {
        let count = 0;
        let initialCons = context.lastMonthConsecutive[uid] || 0;
        for (let d = currentDay - 1; d >= 1; d--) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++; else return count; 
        }
        const firstDayShift = context.assignments[uid][1];
        if (firstDayShift && firstDayShift !== 'OFF' && firstDayShift !== 'M_OFF') return count + initialCons;
        return count;
    }

    static checkDailyManpower(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const counts = {};
        const shiftsToCheck = context.shiftDefs.map(s => s.code);
        shiftsToCheck.forEach(s => counts[s] = 0);
        Object.values(context.assignments).forEach(sch => {
            const s = sch[day];
            if (counts[s] !== undefined) counts[s]++;
        });
        const missing = [];
        shiftsToCheck.forEach(s => {
            const req = (context.staffReq[s] && context.staffReq[s][w]) || 0;
            if (counts[s] < req) missing.push(`${s}:${counts[s]}/${req}`);
        });
        return { isValid: missing.length === 0, missing: missing.join(', ') };
    }

    static shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
