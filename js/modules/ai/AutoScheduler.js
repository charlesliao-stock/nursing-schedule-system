import { RuleEngine } from "./RuleEngine.js";
// ✅ 修正路徑：從 js/modules/ai/ 往上兩層 (../../) 才能找到 js/services/
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "../../services/firebase/FirebaseService.js";

// AI 權重設定
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,      // 人力極缺
    NEED_LOW: 10,       // 人力微缺
    PREFERENCE: 20,     // 員工願望/偏好 (Priority 1)
    PREFERENCE_2: 15,   // Priority 2
    PREFERENCE_3: 10,   // Priority 3
    CONTINUITY: 10,     // 連續上班
    PENALTY_FATIGUE: -80, // 疲勞罰分 (如 N->D)
    RECOVERY: 20        // OFF 的恢復分
};

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v4.6 Path Corrected)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (System Config Aware)");

        try {
            // 讀取系統設定
            const db = firebaseService.getDb();
            let systemSettings = { weekStartDay: 1, firstShift: 'D' };
            try {
                const snap = await getDoc(doc(db, "system", "config"));
                if (snap.exists()) systemSettings = snap.data();
            } catch(e) { console.warn("無法讀取系統設定，使用預設值", e); }

            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData, systemSettings);
            
            // 1. 包班預填
            this.prefillBatchShifts(context);

            console.log("🔹 開始每日步進排班...");
            
            // 2. 每日排班 (遞迴+回溯)
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
            } else {
                console.warn(`⚠️ 排班勉強完成，最後停留在 Day ${context.maxReachedDay}`);
            }
            return { assignments: context.assignments, logs: context.logs };

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  1. 上下文準備
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData, systemSettings) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        // 人員清洗與基礎設定
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                // 設定預設值以防參數缺失
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 6;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

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

        // 讀取預班/偏好/歷史
        try {
            // 處理預班與偏好
            Object.entries(submissions || {}).forEach(([uid, sub]) => {
                if (assignments[uid]) {
                    if (sub && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            wishes[uid][parseInt(d)] = wish;
                            assignments[uid][parseInt(d)] = wish; // Wish 視為鎖定
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

            // 處理歷史資料
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    
                    if (days.length > 0) {
                        lastMonthShifts[uid] = history[days[0]];
                        let cons = 0;
                        for (let d of days) {
                            const shift = history[d];
                            if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                                cons++;
                            } else {
                                break; 
                            }
                        }
                        lastMonthConsecutive[uid] = cons;
                    }
                }
            });
        } catch(e) {
            console.warn("History parse error", e);
        }

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
            assignments: assignments,
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
            maxReachedDay: 0
        };
    }

    // ============================================================
    //  2. 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            const prefBatch = context.preferences[staff.uid]?.batch;
            const constraintBatch = staff.constraints?.batchPref;
            const batchType = constraintBatch || prefBatch;
            const canBatch = staff.constraints?.canBatch;

            if ((canBatch || prefBatch) && batchType) {
                context.preferences[staff.uid].realBatch = batchType;
                
                const maxCons = staff.constraints.maxConsecutive || context.rules.maxConsecutiveWork || 6;
                let currentConsecutive = context.lastMonthConsecutive[staff.uid] || 0;

                for (let day = 1; day <= context.daysInMonth; day++) {
                    if (context.assignments[staff.uid][day]) {
                        const existingShift = context.assignments[staff.uid][day];
                        if (existingShift === 'OFF' || existingShift === 'M_OFF') {
                            currentConsecutive = 0; 
                        } else {
                            currentConsecutive++; 
                        }
                        continue; 
                    }

                    if (currentConsecutive >= maxCons) {
                        context.assignments[staff.uid][day] = 'OFF';
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'forced_rest';
                        currentConsecutive = 0; 
                    } else {
                        context.assignments[staff.uid][day] = batchType;
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'batch_auto';
                        currentConsecutive++; 
                    }
                }
            }
        });
    }

    // ============================================================
    //  3. 每日步進 (Loop)
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        this.adjustBatchOverstaffing(day, context);

        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            context.logs.push(`[Day ${day}] Warn: Manpower shortage. Forced proceed.`);
            console.warn(`⚠️ [Day ${day}] 人力缺口: ${check.missing}`);
            await this.solveDay(day + 1, context);
            return true;
        }
    }

    // ============================================================
    //  4. AI 核心：計分與遞迴 (Recursive Solver)
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        let possibleShifts = context.shiftDefs.map(s => s.code);
        if (!possibleShifts.includes('OFF')) possibleShifts.push('OFF');
        
        const currentCounts = {};
        possibleShifts.forEach(k => currentCounts[k] = 0);

        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF' && currentCounts[sh] !== undefined) {
                currentCounts[sh]++;
            }
        });
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        const candidates = [];
        for (const shift of possibleShifts) {
            const { valid } = this.checkHardConstraints(staff, shift, prevShift, context);
            if (!valid) continue; 

            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            candidates.push({ shift, score, details });
        }

        candidates.sort((a, b) => b.score - a.score);

        for (const cand of candidates) {
            const shift = cand.shift;
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 120) {
                continue; 
            }

            context.assignments[staff.uid][day] = shift;
            
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
                if (await this.solveRecursive(day, staffList, index + 1, context)) {
                    return true;
                }
            }

            delete context.assignments[staff.uid][day];
        }

        return false;
    }

    // ============================================================
    //  5. 輔助邏輯
    // ============================================================
    
    static checkHardConstraints(staff, shift, prevShift, context) {
        if (context.rules.constraints?.minInterval11h) {
            if ((prevShift === 'E' || prevShift.includes('E')) && (shift === 'D' || shift.includes('D'))) return { valid: false, reason: "Interval < 11h" };
        }
        
        const isProtected = staff.constraints.isPregnant || staff.constraints.isPostpartum;
        if (isProtected && (shift.includes('N') || shift.includes('E'))) {
            return { valid: false, reason: "Pregnant protection" };
        }

        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];

        const base = (shift === 'OFF') ? 50 : WEIGHTS.BASE;
        score += base;

        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            if (current < req) {
                score += WEIGHTS.NEED_HIGH;
                details.push("Need++");
            } else if (current >= req) {
                score -= 50; 
                details.push("Full--");
            }
        }

        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { score += WEIGHTS.PREFERENCE; details.push("P1"); }
        else if (prefs.p2 === shift) { score += WEIGHTS.PREFERENCE_2; details.push("P2"); }
        else if (prefs.p3 === shift) { score += WEIGHTS.PREFERENCE_3; details.push("P3"); }

        if (prevShift === shift && shift !== 'OFF') { score += WEIGHTS.CONTINUITY; details.push("Cont."); }
        if (prevShift.includes('N') && shift.includes('D')) { score += WEIGHTS.PENALTY_FATIGUE; details.push("Fatigue"); }

        if (context.rules.constraints?.allowMonthlyMixPref && shift !== 'OFF') {
            const desiredMix = prefs.monthlyMix || '2'; 
            
            if (desiredMix === '2') {
                const usedTypes = new Set();
                for(let d=1; d<day; d++) {
                    const s = context.assignments[staff.uid][d];
                    if(s && s !== 'OFF' && s !== 'M_OFF') usedTypes.add(s);
                }
                
                if (usedTypes.size >= 2 && !usedTypes.has(shift)) {
                    score -= 40; 
                    details.push("Mix3(Avoid)");
                }
            }
        }

        const consecutive = this.calculateConsecutiveWork(staff.uid, day, context);
        if (shift === 'OFF' && consecutive > 5) {
            score += (consecutive * 15); 
            details.push(`RestNeed(${consecutive})`);
        }

        return { score, details: details.join(',') };
    }

    static adjustBatchOverstaffing(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const shiftsToCheck = context.shiftDefs.map(s => s.code);

        shiftsToCheck.forEach(shift => {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (req === 0) return; 

            const assignedStaff = context.staffList.filter(s => {
                const assigned = context.assignments[s.uid][day];
                const tags = context.assignments[s.uid].autoTags || {};
                return assigned === shift && tags[day] === 'batch_auto';
            });

            let totalCount = 0;
            context.staffList.forEach(s => { if (context.assignments[s.uid][day] === shift) totalCount++; });

            if (totalCount > req) {
                const cutCount = totalCount - req;
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
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++;
            else return count; 
        }
        
        const firstDayShift = context.assignments[uid][1];
        if (firstDayShift && firstDayShift !== 'OFF' && firstDayShift !== 'M_OFF') {
            return count + initialCons;
        }
        
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
