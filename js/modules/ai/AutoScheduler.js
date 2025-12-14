import { RuleEngine } from "./RuleEngine.js";

// AI 權重設定
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,      // 人力極缺
    NEED_LOW: 10,       // 人力微缺
    PREFERENCE: 20,     // 員工願望/偏好
    CONTINUITY: 10,     // 連續上班
    PENALTY_FATIGUE: -80, // 疲勞罰分 (如 N->D)
    RECOVERY: 20        // OFF 的恢復分
};

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v4.1 Final: 效能優化 + 跨月邏輯 + 動態班別)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v4.1 Final)");

        try {
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
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
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
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
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 7;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

        const assignments = {};
        const wishes = {}; 
        const preferences = {}; 
        const lastMonthShifts = {}; 
        const lastMonthConsecutive = {}; // ✅ 新增：記錄上個月底連續天數

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            preferences[s.uid] = { p1: null, p2: null, batch: null }; 
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
                            batch: sub.preferences.batch || null
                        };
                    }
                }
            });

            // 處理歷史資料 (historyData: { uid: { 25:'D', ... } })
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    // 取得所有日期並由大到小排序 (29, 28, 27...)
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    
                    if (days.length > 0) {
                        // 1. 取得上個月最後一天班別
                        lastMonthShifts[uid] = history[days[0]];

                        // 2. 計算連續上班天數 (倒推計算)
                        let cons = 0;
                        for (let d of days) {
                            const shift = history[d];
                            if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                                cons++;
                            } else {
                                break; // 遇到休假中斷
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
            // 將 index 0 設為上個月最後一天，供 RuleEngine 使用
            assignments[s.uid][0] = lastMonthShifts[s.uid] || 'OFF';
        });

        const rawReq = unitSettings.staffRequirements || {};
        // 這裡僅保留結構，具體班別需求 key 會動態對應
        const staffReq = rawReq; 
        const shiftDefs = settings.shifts || [];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments,
            wishes: wishes,
            preferences: preferences,
            lastMonthShifts: lastMonthShifts,
            lastMonthConsecutive: lastMonthConsecutive, // ✅ 傳入 Context
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
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

            if ((staff.constraints?.canBatch || prefBatch) && batchType) {
                context.preferences[staff.uid].realBatch = batchType;
                for (let day = 1; day <= context.daysInMonth; day++) {
                    // 只填沒有 Wish 的空格
                    if (!context.assignments[staff.uid][day]) {
                        context.assignments[staff.uid][day] = batchType;
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'batch_auto';
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

        // 3.1 預處理：修剪過剩的包班
        this.adjustBatchOverstaffing(day, context);

        // 3.2 找出待排班人員
        // 過濾掉當天已經有班 (包含 Wish 或 包班預填) 的人
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        // 3.3 進入遞迴解題
        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        // 3.4 檢查與推進
        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            // 防止 UI 凍結
            if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            // 嘗試容錯推進 (Force Push)
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
        // Base Case: 當天所有人都排完了
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        // 4.1 ✅ 修正：動態取得班別代碼 (Dynamic Shift Codes)
        // 從 context.shiftDefs (來自 unitSettings) 提取 code
        let possibleShifts = [];
        if (context.shiftDefs && context.shiftDefs.length > 0) {
            possibleShifts = context.shiftDefs.map(s => s.code);
        } else {
            possibleShifts = ['D', 'E', 'N']; // Fallback
        }
        
        // 確保 OFF 永遠是選項，且在最後嘗試
        if (!possibleShifts.includes('OFF')) possibleShifts.push('OFF');
        
        // 4.2 取得當前已排的人力計數 (用於計算 Need 分數)
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
            // A. 硬限制快速檢查
            const { valid } = this.checkHardConstraints(staff, shift, prevShift, context);
            if (!valid) continue; 

            // B. 評分
            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            candidates.push({ shift, score, details });
        }

        // 4.3 排序：分數高者優先嘗試
        candidates.sort((a, b) => b.score - a.score);

        // 4.4 嘗試指派
        for (const cand of candidates) {
            const shift = cand.shift;
            
            // 剪枝 (Pruning): 如果該班已滿且非高分連續班，則跳過
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 120) {
                continue; 
            }

            // 執行指派
            context.assignments[staff.uid][day] = shift;
            
            // ✅ 關鍵修正：呼叫 RuleEngine 時傳入上月狀態，並限制檢查範圍 (checkUpToDay)
            const ruleCheck = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints,
                context.assignments[staff.uid][0],        // 上月最後一天
                context.lastMonthConsecutive[staff.uid],  // 上月連續天數
                day                                       // ⚡️ 只檢查到今天，避免當機
            );

            if (!ruleCheck.errors[day]) {
                if (await this.solveRecursive(day, staffList, index + 1, context)) {
                    return true;
                }
            }

            // 回溯
            delete context.assignments[staff.uid][day];
        }

        return false;
    }

    // ============================================================
    //  5. 輔助邏輯：硬限制與評分
    // ============================================================
    
    static checkHardConstraints(staff, shift, prevShift, context) {
        // 1. 間隔限制 (E 不接 D) - 這裡可根據動態班別擴充邏輯，目前保留 D/E 檢查
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E' && shift === 'D') return { valid: false, reason: "Interval < 11h" };
        }
        
        // 2. 孕婦保護
        if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) {
            return { valid: false, reason: "Pregnant protection" };
        }

        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];

        // 1. 基礎分
        const base = (shift === 'OFF') ? 50 : WEIGHTS.BASE;
        score += base;

        // 2. 需求權重
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

        // 3. 偏好與連續性
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { score += WEIGHTS.PREFERENCE; details.push("P1"); }
        if (prevShift === shift && shift !== 'OFF') { score += WEIGHTS.CONTINUITY; details.push("Cont."); }
        if (prevShift === 'N' && shift === 'D') { score += WEIGHTS.PENALTY_FATIGUE; details.push("Fatigue"); }

        // 4. 需要休息 (連續上班太多天，OFF 分數變高)
        const consecutive = this.calculateConsecutiveWork(staff.uid, day, context);
        if (shift === 'OFF' && consecutive > 5) {
            score += (consecutive * 15); // 增加休息權重
            details.push(`RestNeed(${consecutive})`);
        }

        return { score, details: details.join(',') };
    }

    static adjustBatchOverstaffing(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        // 取得所有設定的班別代碼 (不含 OFF)
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
        // 包含上個月天數
        let initialCons = context.lastMonthConsecutive[uid] || 0;
        
        // 往回追溯
        for (let d = currentDay - 1; d >= 1; d--) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++;
            else return count; // 中斷直接回傳
        }
        
        // 如果追溯到第 1 天都是連續上班，則加上上個月底的天數
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
        
        // ✅ 修正：動態檢查所有班別
        const shiftsToCheck = (context.shiftDefs && context.shiftDefs.length > 0) 
            ? context.shiftDefs.map(s => s.code) 
            : ['D', 'E', 'N'];
            
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
