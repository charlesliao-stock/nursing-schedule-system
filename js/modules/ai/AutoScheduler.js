import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 v4.2 (MCV Heuristics + Dynamic Weights)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v4.2 Optimized)");

        try {
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // 1. 包班預填
            if (context.processConfig.enableBatchPrefill) {
                this.prefillBatchShifts(context);
            }

            console.log("🔹 開始每日步進排班...");
            
            // 2. 每日排班
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
        const scoringConfig = rules.scoringConfig || {}; 
        const processConfig = rules.processConfig || { 
            enableBatchPrefill: true, 
            enablePruning: true, 
            enableForcePush: true,
            backtrackDepth: 20000 
        };

        // 轉換權重配置
        const weights = {
            BASE: 100,
            // 效率: 缺人時加分極高
            NEED_HIGH: (scoringConfig.efficiency?.subs?.coverage?.weight || 50),
            // 滿意度: 符合 Wish 或 P1 加分
            PREFERENCE: (scoringConfig.satisfaction?.subs?.wish?.weight || 20),
            // 連續性: 同種班連上加分 (避免花班)
            CONTINUITY: 20, 
            // 公平性: 如果該員累積班數 > 平均，扣分
            FAIRNESS_PENALTY: (scoringConfig.fairness?.subs?.balance?.weight || 30),
            // 健康: 違反軟規則(如N接D)的扣分 (負值)
            PENALTY_FATIGUE: -1 * (scoringConfig.health?.subs?.interval?.weight || 80), 
        };

        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = rules.maxConsecutiveWork || 7;
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
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        try {
            Object.entries(submissions).forEach(([uid, sub]) => {
                if (assignments[uid]) {
                    if (sub && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            wishes[uid][parseInt(d)] = wish;
                            assignments[uid][parseInt(d)] = wish; // 鎖定預班
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
            Object.entries(historyData).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    const days = Object.keys(history).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) lastMonthShifts[uid] = history[days[0]];
                }
            });
        } catch(e) {}

        validStaffList.forEach(s => {
            assignments[s.uid][0] = lastMonthShifts[s.uid] || 'OFF';
        });

        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { D: rawReq.D || {}, E: rawReq.E || {}, N: rawReq.N || {} };
        const shiftDefs = unitSettings.settings?.shifts || [];

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
            weights: weights,
            processConfig: processConfig,
            logs: [],
            maxBacktrack: processConfig.backtrackDepth || 20000,
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
    //  3. 每日步進 (DFS)
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        // 3.1 預處理：修剪過剩包班
        if (context.processConfig.enablePruning) {
            this.adjustBatchOverstaffing(day, context);
        }

        // 3.2 找出待排班人員並排序 (Heuristic Sort)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.sortStaffByPriority(pendingStaff, day, context);

        // 3.3 進入遞迴解題
        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        // 3.4 檢查與推進
        const check = this.checkDailyManpower(day, context);
        
        // 釋放 UI 執行緒
        if (day % 2 === 0) await new Promise(r => setTimeout(r, 0));

        if (success && check.isValid) {
            return await this.solveDay(day + 1, context);
        } else {
            // Force Push: 若無法滿足人力，但允許推進
            if (context.processConfig.enableForcePush !== false) {
                // 如果回溯過深還是解不出，就強制往後排，避免完全失敗
                context.logs.push(`[Day ${day}] Warn: Manpower shortage. Forced proceed.`);
                return await this.solveDay(day + 1, context);
            } else {
                return false;
            }
        }
    }

    /**
     * MCV (Most Constrained Variable) 啟發式排序
     * 將「最難排」的人排在前面，減少回溯。
     */
    static sortStaffByPriority(staffArray, day, context) {
        staffArray.sort((a, b) => {
            // 1. 如果某人昨天是 N，今天受限最大 (只能 N 或 OFF)，優先排
            const prevA = context.assignments[a.uid][day-1];
            const prevB = context.assignments[b.uid][day-1];
            const aIsN = prevA === 'N';
            const bIsN = prevB === 'N';
            if (aIsN && !bIsN) return -1;
            if (!aIsN && bIsN) return 1;

            // 2. 已連續上班天數多的人優先處理 (避免爆掉 maxConsecutive)
            const consA = this.calculateConsecutiveWork(a.uid, day, context);
            const consB = this.calculateConsecutiveWork(b.uid, day, context);
            if (consA !== consB) return consB - consA; // 大的先排

            return 0; // 隨機或保持原序
        });
    }

    // ============================================================
    //  4. AI 核心：計分與遞迴
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        // 安全閥：防止無限迴圈
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        // 候選班別
        const possibleShifts = ['D', 'E', 'N', 'OFF'];
        
        // 計算當前各種班別已排人數 (用來算 Score)
        const currentCounts = { D: 0, E: 0, N: 0 };
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF') currentCounts[sh] = (currentCounts[sh] || 0) + 1;
        });

        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        // 4.1 計算每個班別的分數
        const candidates = [];
        for (const shift of possibleShifts) {
            // 硬規則檢查 (Hard Check)
            const { valid, reason } = this.checkHardConstraints(staff, shift, prevShift, context, day);
            if (!valid) continue; 

            // 軟規則計分 (Soft Score)
            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            candidates.push({ shift, score, details });
        }

        // LCV (Least Constraining Value): 分數高的先試
        candidates.sort((a, b) => b.score - a.score);

        // 4.2 嘗試填入
        for (const cand of candidates) {
            const shift = cand.shift;
            
            // 剪枝優化：如果該班別已經滿了，且分數不高 (不是 P1 願望)，就跳過
            // 但如果是 'OFF' 則不剪枝
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 120) {
                // 如果已經滿員，除非是該員極度適合 (Score > 120, 例如 P1)，否則跳過
                continue; 
            }

            // 嘗試賦值
            context.assignments[staff.uid][day] = shift;
            
            // 再次確認 Unit Rule (例如連續天數、種類限制)
            const ruleCheck = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints,
                context.lastMonthShifts[staff.uid] // 傳入上月班別
            );

            if (!ruleCheck.errors[day]) {
                // 遞迴下一個人
                if (await this.solveRecursive(day, staffList, index + 1, context)) {
                    return true;
                }
            }
            // 回溯 (Backtrack)
            delete context.assignments[staff.uid][day];
        }

        return false;
    }

    // ============================================================
    //  5. 規則與計分細節
    // ============================================================
    
    static checkHardConstraints(staff, shift, prevShift, context, day) {
        const rules = context.rules.constraints || {};

        // A. 11小時規則
        if (rules.minInterval11h !== false) { 
            if (prevShift === 'E' && shift === 'D') return { valid: false, reason: "E接D" };
            if (prevShift === 'D' && shift === 'N') return { valid: false, reason: "D接N" };
        }
        
        // B. 孕婦保護
        if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) {
            if (rules.pregnantProtection !== false) return { valid: false, reason: "Pregnant" };
        }

        // C. N 接續規則 (Rule: N 前需 OFF 或 N)
        if (rules.firstNRequiresOFF !== false) {
             if (shift === 'N' && prevShift !== 'OFF' && prevShift !== 'N' && prevShift !== 'M_OFF') {
                 return { valid: false, reason: "N must follow OFF" };
             }
        }

        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];
        const W = context.weights; 

        // 1. 基礎分
        const base = (shift === 'OFF') ? 50 : W.BASE;
        score += base;

        // 2. 人力需求 (Efficiency)
        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            if (current < req) {
                score += W.NEED_HIGH; 
                details.push("Need++");
            } else if (current >= req) {
                // 已滿員，大幅扣分
                score -= 50; 
                details.push("Full--");
            }
        }

        // 3. 偏好 (Satisfaction)
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { score += W.PREFERENCE; details.push("P1"); }
        
        // 4. 連續性 (Continuity) - 避免花班
        if (prevShift === shift && shift !== 'OFF') { score += W.CONTINUITY; details.push("Cont."); }
        
        // 5. 公平性 (Fairness) - 平衡班數
        // 簡單實作：如果目前是月初，影響小；月底影響大。
        // 這裡暫時檢查該員是否已經排太多該種班
        if (shift !== 'OFF' && W.FAIRNESS_PENALTY > 0) {
            // (未來可優化：讀取目前為止的統計)
        }

        // 6. 疲勞罰分 (Health)
        const rules = context.rules.constraints || {};
        if (prevShift === 'N' && shift === 'D') { 
            if (rules.nToDStrategy === 'penalty_low') score += (W.PENALTY_FATIGUE / 2);
            else score += W.PENALTY_FATIGUE; 
            details.push("Fatigue"); 
        }

        // 7. 休息積累 (Rest Check)
        const consecutive = this.calculateConsecutiveWork(staff.uid, day, context);
        if (shift === 'OFF') {
            // 上越多天，OFF 的分數越高
            if (consecutive >= 5) score += 50;
            if (consecutive >= 6) score += 100;
        } else {
            // 連上太多天，排班分數扣減
            if (consecutive >= 5) score -= 30;
        }

        return { score, details: details.join(',') };
    }

    static adjustBatchOverstaffing(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        ['N', 'E', 'D'].forEach(shift => {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (req === 0) return; 

            // 找出所有自動包班的人
            const assignedStaff = context.staffList.filter(s => {
                const assigned = context.assignments[s.uid][day];
                const tags = context.assignments[s.uid].autoTags || {};
                return assigned === shift && tags[day] === 'batch_auto';
            });

            // 計算目前該班總人數
            let totalCount = 0;
            context.staffList.forEach(s => { if (context.assignments[s.uid][day] === shift) totalCount++; });

            // 若超過需求，把包班的人踢掉 (改為 OFF)
            if (totalCount > req) {
                const cutCount = totalCount - req;
                // 優先踢掉「連續工作天數長」的人
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
        // 往回查，包含 Day 0
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
}
