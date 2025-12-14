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
     * 啟動排班引擎 (v4.0 積分權重 + 回溯機制 + 包班調節)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v4.0 Full Version)");

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

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            preferences[s.uid] = { p1: null, p2: null, batch: null }; 
            lastMonthShifts[s.uid] = 'OFF'; 
        });

        // 讀取預班/偏好/歷史
        try {
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
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) lastMonthShifts[uid] = history[days[0]];
                }
            });
        } catch(e) {}

        validStaffList.forEach(s => {
            assignments[s.uid][0] = lastMonthShifts[s.uid] || 'OFF';
        });

        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { D: rawReq.D || {}, E: rawReq.E || {}, N: rawReq.N || {} };
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
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
            logs: [],
            maxBacktrack: 20000, // 增加回溯上限
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

        // 4.1 產生候選班別 (Wish 已在 Loop 前被 filter 掉，這裡只處理 pending)
        let possibleShifts = ['D', 'E', 'N', 'OFF'];
        
        // 4.2 取得當前已排的人力計數 (用於計算 Need 分數)
        const currentCounts = { D: 0, E: 0, N: 0 };
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF') currentCounts[sh] = (currentCounts[sh] || 0) + 1;
        });
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        const candidates = [];
        for (const shift of possibleShifts) {
            // A. 硬限制檢查
            const { valid, reason } = this.checkHardConstraints(staff, shift, prevShift, context, day);
            if (!valid) continue; 

            // B. 評分
            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            candidates.push({ shift, score, details });
        }

        // 4.3 排序：分數高者優先嘗試
        candidates.sort((a, b) => b.score - a.score);

        // 4.4 嘗試指派
        let foundValidShift = false;
        for (const cand of candidates) {
            const shift = cand.shift;
            
            // 剪枝 (Pruning): 如果該班已滿且非高分連續班，則跳過 (提升效能)
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 120) {
                continue; 
            }

            // 執行指派
            context.assignments[staff.uid][day] = shift;
            foundValidShift = true;
            
            // 驗證整體規則
            const ruleCheck = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints
            );

            if (!ruleCheck.errors[day]) {
                // 遞迴下一位
                if (await this.solveRecursive(day, staffList, index + 1, context)) {
                    return true;
                }
            }

            // 回溯 (Backtrack)
            delete context.assignments[staff.uid][day];
        }

        // 如果連 OFF 都不能排 (例如連續上班天數爆了且無法 OFF)，這裡會回傳 false，觸發上一層的回溯
        return false;
    }

    // ============================================================
    //  5. 輔助邏輯：硬限制與評分
    // ============================================================
    
    static checkHardConstraints(staff, shift, prevShift, context, day) {
        // 1. 間隔限制
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E' && shift === 'D') return { valid: false, reason: "Interval < 11h" };
            if (prevShift === 'D' && shift === 'N') return { valid: false, reason: "Interval < 11h" };
        }
        
        // 2. 孕婦保護
        if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) {
            return { valid: false, reason: "Pregnant protection" };
        }

        // 3. 連續夜班限制 (Soft -> Hard 視規則強度)
        if (shift === 'N') {
             // 簡易檢查，詳細由 RuleEngine 把關
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
            score += (consecutive * 10);
            details.push(`RestNeed(${consecutive})`);
        }

        return { score, details: details.join(',') };
    }

    static adjustBatchOverstaffing(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        ['N', 'E', 'D'].forEach(shift => {
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
        for (let d = currentDay - 1; d >= 0; d--) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++;
            else break;
        }
        return count;
    }

    static checkDailyManpower(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const counts = { D: 0, E: 0, N: 0 };
        Object.values(context.assignments).forEach(sch => {
            const s = sch[day];
            if (counts[s] !== undefined) counts[s]++;
        });
        const missing = [];
        ['D', 'E', 'N'].forEach(s => {
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
