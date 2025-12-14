import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v4.1 動態權重 + 回溯機制 + 包班調節)
     * 現在權重完全由 RuleSettings 控制
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v4.1 Dynamic Weights)");

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
    //  1. 上下文準備 (整合使用者設定)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        // 1. 讀取規則與設定
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const scoringConfig = rules.scoringConfig || {}; // 從 RuleSettings 存進來的設定
        const processConfig = rules.processConfig || { 
            enableBatchPrefill: true, 
            enablePruning: true, 
            backtrackDepth: 20000 
        };

        // 2. 對應權重 (Mapping)
        // 將 RuleSettings 的結構 (fairness/satisfaction...) 轉換為引擎參數
        const weights = {
            BASE: 100,
            // 如果使用者重視 "效率(efficiency)" -> 提高 "缺人加分(NEED)"
            NEED_HIGH: (scoringConfig.efficiency?.subs?.coverage?.weight || 50),
            NEED_LOW: 10,
            // 如果使用者重視 "滿意度(satisfaction)" -> 提高 "偏好加分(PREFERENCE)"
            PREFERENCE: (scoringConfig.satisfaction?.subs?.wish?.weight || 20),
            // 如果使用者重視 "公平性(fairness)" -> 提高 "連續性(CONTINUITY)" (避免花班)
            CONTINUITY: (scoringConfig.fairness?.subs?.balance?.weight || 10),
            // 如果使用者重視 "健康(health)" -> 提高 "疲勞罰分(FATIGUE)" (變成更負的值)
            // 注意：這裡是罰分，所以要轉負數，且基數放大
            PENALTY_FATIGUE: -1 * (scoringConfig.health?.subs?.interval?.weight || 80), 
            RECOVERY: 20
        };

        // 3. 人員清洗
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

        // 4. 讀取預班/偏好/歷史 (submissions & history)
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        try {
            Object.entries(submissions).forEach(([uid, sub]) => {
                if (assignments[uid]) {
                    if (sub && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            wishes[uid][parseInt(d)] = wish;
                            assignments[uid][parseInt(d)] = wish; 
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
            weights: weights, // ✅ 將動態權重放入 Context
            processConfig: processConfig, // ✅ 將流程設定放入 Context
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
    //  3. 每日步進
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        // 3.1 預處理：修剪過剩 (依據 RuleSettings 設定決定是否開啟)
        if (context.processConfig.enablePruning) {
            this.adjustBatchOverstaffing(day, context);
        }

        // 3.2 找出待排班人員
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        // 3.3 進入遞迴解題
        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        // 3.4 檢查與推進
        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            // 檢查是否允許 Force Push (盡力而為)
            const allowForce = context.processConfig.enableForcePush !== false;
            if (allowForce) {
                context.logs.push(`[Day ${day}] Warn: Manpower shortage. Forced proceed.`);
                console.warn(`⚠️ [Day ${day}] 人力缺口: ${check.missing}`);
                await this.solveDay(day + 1, context);
                return true;
            } else {
                return false; // 若不允許缺人，則回報失敗
            }
        }
    }

    // ============================================================
    //  4. AI 核心：計分與遞迴
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        let possibleShifts = ['D', 'E', 'N', 'OFF'];
        
        const currentCounts = { D: 0, E: 0, N: 0 };
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF') currentCounts[sh] = (currentCounts[sh] || 0) + 1;
        });
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        const candidates = [];
        for (const shift of possibleShifts) {
            const { valid, reason } = this.checkHardConstraints(staff, shift, prevShift, context, day);
            if (!valid) continue; 

            // 🔥 這裡改用 context.weights (動態權重)
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
                staff.constraints
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
    
    static checkHardConstraints(staff, shift, prevShift, context, day) {
        // 硬限制也從 context.rules 讀取
        const rules = context.rules.constraints || {};

        if (rules.minInterval11h !== false) { // 預設開啟
            if (prevShift === 'E' && shift === 'D') return { valid: false, reason: "Interval < 11h" };
            if (prevShift === 'D' && shift === 'N') return { valid: false, reason: "Interval < 11h" };
        }
        
        if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) {
            if (rules.pregnantProtection !== false) return { valid: false, reason: "Pregnant protection" };
        }

        // N 前必須 OFF (User Rule)
        if (rules.firstNRequiresOFF !== false) {
             if (shift === 'N' && prevShift !== 'OFF' && prevShift !== 'N') {
                 return { valid: false, reason: "N must follow OFF/N" };
             }
        }

        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];
        
        // 🔥 從 Context 取得動態權重
        const W = context.weights; 

        // 1. 基礎分
        const base = (shift === 'OFF') ? 50 : W.BASE;
        score += base;

        // 2. 需求權重
        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            if (current < req) {
                score += W.NEED_HIGH; // 使用者設定的效率權重
                details.push("Need++");
            } else if (current >= req) {
                score -= 50; 
                details.push("Full--");
            }
        }

        // 3. 偏好與連續性
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { score += W.PREFERENCE; details.push("P1"); }
        if (prevShift === shift && shift !== 'OFF') { score += W.CONTINUITY; details.push("Cont."); }
        
        // 4. 疲勞罰分 (例如 N->D，若規則允許但要扣分)
        const rules = context.rules.constraints || {};
        if (prevShift === 'N' && shift === 'D') { 
            // 如果策略是 penalty_high, 使用 W.PENALTY_FATIGUE (通常是 -80)
            // 如果策略是 penalty_low, 減半
            if (rules.nToDStrategy === 'penalty_low') score += (W.PENALTY_FATIGUE / 2);
            else score += W.PENALTY_FATIGUE; 
            
            details.push("Fatigue"); 
        }

        // 5. 需要休息
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
