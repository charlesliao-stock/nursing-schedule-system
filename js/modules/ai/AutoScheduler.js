import { RuleEngine } from "./RuleEngine.js";

// AI 權重設定
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,
    NEED_LOW: 10,
    PREFERENCE: 20,
    PREFERENCE_P1: 40,  // 新增: 第一優先更高權重
    CONTINUITY: 10,
    PENALTY_FATIGUE: -80,
    PENALTY_E_TO_D: -20,  // 新增: 小夜接白班懲罰
    RECOVERY: 20,
    BALANCE: 20,  // 新增: 工作平衡獎勵
    MUST_REST: 100  // 新增: 強制休息
};

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v5.0 優化版本)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v5.0 優化版本)");

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
            
            return { 
                assignments: context.assignments, 
                logs: context.logs,
                adjustmentLogs: context.adjustmentLogs || []
            };

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  1. 上下文準備 (加入快取機制)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
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
            adjustmentLogs: [],
            maxBacktrack: 20000,
            backtrackCount: 0,
            maxReachedDay: 0,
            // 新增: 快取機制
            cache: {
                shiftCounts: new Map(),
                consecutiveDays: new Map(),
                validationResults: new Map()
            },
            // 新增: 進度回調
            onProgress: currentSchedule.onProgress || null,
            shouldStop: currentSchedule.shouldStop || null
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
    //  3. 每日步進 (Loop) - 加入進度回報與中斷機制
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) {
            context.maxReachedDay = day;
            
            // 新增: 進度回報
            if (context.onProgress) {
                context.onProgress({
                    currentDay: day,
                    totalDays: context.daysInMonth,
                    progress: Math.round((day / context.daysInMonth) * 100)
                });
            }
            
            // 新增: 檢查是否需要中斷
            if (context.shouldStop && context.shouldStop()) {
                throw new Error('使用者中斷排班');
            }
        }
        
        if (day > context.daysInMonth) return true;

        // 3.1 預處理：修剪過剩的包班
        this.adjustBatchOverstaffing(day, context);

        // 3.2 找出待排班人員
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        // 3.3 進入遞迴解題
        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        // 3.4 檢查與推進
        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            // 每 2 天才 yield 避免過度頻繁
            if (day % 2 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            context.logs.push(`[Day ${day}] Warn: Manpower shortage. ${check.missing}`);
            console.warn(`⚠️ [Day ${day}] 人力缺口: ${check.missing}`);
            await this.solveDay(day + 1, context);
            return true;
        }
    }

    // ============================================================
    //  4. AI 核心：計分與遞迴 (優化版)
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) {
            console.warn(`⚠️ 回溯次數達上限`);
            return false;
        }

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        // 4.1 智能過濾候選班別
        let possibleShifts = this.smartFilterShifts(staff, day, context);
        
        // 4.2 取得當前已排的人力計數 (使用快取)
        const currentCounts = this.getCurrentShiftCountsCached(day, context);
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

        // 4.3 排序：分數高者優先嘗試 (加入隨機性避免局部最優)
        candidates.sort((a, b) => {
            const scoreDiff = b.score - a.score;
            // 如果分數接近，加入少量隨機性
            if (Math.abs(scoreDiff) < 10) {
                return Math.random() - 0.5;
            }
            return scoreDiff;
        });

        // 4.4 限制嘗試數量，提升效能
        const maxTries = Math.min(candidates.length, 5);
        
        for (let i = 0; i < maxTries; i++) {
            const cand = candidates[i];
            const shift = cand.shift;
            
            // 剪枝優化
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && currentCounts[shift] >= req && cand.score < 100) {
                continue; 
            }

            // 執行指派
            context.assignments[staff.uid][day] = shift;
            
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

        return false;
    }

    // ============================================================
    //  5. 輔助邏輯：硬限制與評分 (優化版)
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

        // 3. 連續工作天數檢查
        const consecutive = this.calculateConsecutiveWorkCached(staff.uid, day, context);
        if (shift !== 'OFF' && consecutive >= (staff.constraints?.maxConsecutive || 7)) {
            return { valid: false, reason: "Max consecutive work days" };
        }

        return { valid: true, reason: "" };
    }

    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];

        // 1. 基礎分
        const base = (shift === 'OFF') ? 50 : WEIGHTS.BASE;
        score += base;

        // 2. 需求權重 (改進: 考慮急迫性)
        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            const shortage = req - current;
            
            if (shortage > 0) {
                // 缺口越大，分數越高
                score += WEIGHTS.NEED_HIGH + (shortage * 10);
                details.push(`Need++[${shortage}]`);
            } else if (shortage === 0) {
                score += 0; // 剛好滿足
            } else {
                score -= 50; // 已超額
                details.push("Full--");
            }
        }

        // 3. 偏好權重 (改進: 加入第二優先)
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) { 
            score += WEIGHTS.PREFERENCE_P1; 
            details.push("P1★"); 
        } else if (prefs.p2 === shift) { 
            score += WEIGHTS.PREFERENCE; 
            details.push("P2"); 
        }

        // 4. 連續性獎勵 (但要避免過度連續)
        const consecutive = this.calculateConsecutiveWorkCached(staff.uid, day, context);
        if (prevShift === shift && shift !== 'OFF') {
            if (consecutive < 3) {
                score += WEIGHTS.CONTINUITY * 2; // 初期連續好
                details.push("Cont+");
            } else if (consecutive < 5) {
                score += WEIGHTS.CONTINUITY; // 中期連續普通
                details.push("Cont");
            } else {
                score -= 10; // 已經連太多天
                details.push("Cont-");
            }
        }

        // 5. 疲勞懲罰 (改進: 更精細的判斷)
        if (prevShift === 'N' && shift === 'D') {
            score += WEIGHTS.PENALTY_FATIGUE;
            details.push("Fatigue!!");
        } else if (prevShift === 'E' && shift === 'D') {
            score += WEIGHTS.PENALTY_E_TO_D; // 小夜接白班也需要休息
            details.push("E→D");
        }

        // 6. 休息需求 (改進: 考慮班別強度)
        if (shift === 'OFF') {
            if (consecutive > 6) {
                score += WEIGHTS.MUST_REST; // 強烈需要休息
                details.push(`MUST_REST[${consecutive}]`);
            } else if (consecutive > 4) {
                score += 50;
                details.push(`NeedRest[${consecutive}]`);
            } else if (prevShift === 'N') {
                score += 30; // 夜班後優先休息
                details.push("N→OFF");
            }
        }

        // 7. 工作負擔平衡 (新增)
        const totalWorked = this.countTotalWorkedDays(staff.uid, day, context);
        const avgWorked = this.getAverageWorkedDays(context, day);
        if (shift !== 'OFF' && totalWorked < avgWorked - 1) {
            score += WEIGHTS.BALANCE; // 鼓勵工作較少的人
            details.push("Balance+");
        } else if (shift !== 'OFF' && totalWorked > avgWorked + 1) {
            score -= WEIGHTS.BALANCE; // 減少已工作較多的人
            details.push("Balance-");
        }

        return { score, details: details.join(',') };
    }

    // ============================================================
    //  6. 智能過濾與快取機制
    // ============================================================
    
    static smartFilterShifts(staff, day, context) {
        let shifts = ['D', 'E', 'N', 'OFF'];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';
        
        // 快速過濾明顯違規的選項
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E') shifts = shifts.filter(s => s !== 'D');
            if (prevShift === 'D') shifts = shifts.filter(s => s !== 'N');
        }
        
        if (staff.constraints?.isPregnant) {
            shifts = shifts.filter(s => s === 'D' || s === 'OFF');
        }
        
        // 檢查連續工作天數
        const consecutive = this.calculateConsecutiveWorkCached(staff.uid, day, context);
        if (consecutive >= (staff.constraints?.maxConsecutive || 7)) {
            shifts = ['OFF']; // 強制休息
        }
        
        return shifts;
    }

    static getCurrentShiftCountsCached(day, context) {
        const cacheKey = `day_${day}`;
        if (context.cache.shiftCounts.has(cacheKey)) {
            return context.cache.shiftCounts.get(cacheKey);
        }
        
        const counts = { D: 0, E: 0, N: 0 };
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF') counts[sh] = (counts[sh] || 0) + 1;
        });
        
        context.cache.shiftCounts.set(cacheKey, counts);
        return counts;
    }

    static calculateConsecutiveWorkCached(uid, currentDay, context) {
        const cacheKey = `${uid}_${currentDay}`;
        if (context.cache.consecutiveDays.has(cacheKey)) {
            return context.cache.consecutiveDays.get(cacheKey);
        }
        
        let count = 0;
        for (let d = currentDay - 1; d >= 0; d--) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++;
            else break;
        }
        
        context.cache.consecutiveDays.set(cacheKey, count);
        return count;
    }

    // ============================================================
    //  7. 包班調節改進 (更智能的裁減策略)
    // ============================================================
    
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
            context.staffList.forEach(s => { 
                if (context.assignments[s.uid][day] === shift) totalCount++; 
            });

            if (totalCount > req) {
                const cutCount = totalCount - req;
                
                // 改進: 更智能的裁減策略
                assignedStaff.sort((a, b) => {
                    const scoreA = this.calculateStaffOverworkScore(a.uid, day, context);
                    const scoreB = this.calculateStaffOverworkScore(b.uid, day, context);
                    return scoreB - scoreA; // 分數高的優先裁減(表示較累)
                });

                for (let i = 0; i < cutCount && i < assignedStaff.length; i++) {
                    const uid = assignedStaff[i].uid;
                    context.assignments[uid][day] = 'OFF';
                    
                    // 記錄調整
                    context.adjustmentLogs.push({
                        day, uid, reason: 'batch_overstaffing', shift
                    });
                }
            }
        });
    }

    // 計算員工過勞分數
    static calculateStaffOverworkScore(uid, currentDay, context) {
        let score = 0;
        
        // 1. 連續工作天數
        const consecutive = this.calculateConsecutiveWorkCached(uid, currentDay, context);
        score += consecutive * 10;
        
        // 2. 本月已工作總天數
        const totalWorked = this.countTotalWorkedDays(uid, currentDay, context);
        score += totalWorked * 5;
        
        // 3. 夜班次數
        let nightCount = 0;
        for (let d = 1; d < currentDay; d++) {
            if (context.assignments[uid][d] === 'N') nightCount++;
        }
        score += nightCount * 15;
        
        return score;
    }

    // ============================================================
    //  8. 輔助計算函數
    // ============================================================
    
    static countTotalWorkedDays(uid, currentDay, context) {
        let count = 0;
        for (let d = 1; d < currentDay; d++) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') count++;
        }
        return count;
    }

    static getAverageWorkedDays(context, currentDay) {
        let total = 0, count = 0;
        context.staffList.forEach(staff => {
            for (let d = 1; d < currentDay; d++) {
                const shift = context.assignments[staff.uid][d];
                if (shift && shift !== 'OFF' && shift !== 'M_OFF') total++;
            }
            count++;
        });
        return count > 0 ? total / count : 0;
    }

    static calculateConsecutiveWork(uid, currentDay, context) {
        return this.calculateConsecutiveWorkCached(uid, currentDay, context);
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
