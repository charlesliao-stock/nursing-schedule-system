import { RuleEngine } from "./RuleEngine.js";

// ============================================================
//  0. AI 權重與設定 (移植自 Python 邏輯)
// ============================================================
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,      // 人力極缺時的加分
    NEED_LOW: 10,       // 人力微缺
    PREFERENCE: 20,     // 員工願望 (Wish) 或偏好
    CONTINUITY: 10,     // 連續上同班別 (避免花班)
    PENALTY_FATIGUE: -80, // 疲勞罰分 (如 N接D)
    RECOVERY: 20        // OFF 的恢復加分
};

const SHIFT_TIMES = {
    'D': { start: 8, end: 16 },
    'E': { start: 16, end: 24 },
    'N': { start: 0, end: 8 },  // 跨日需特殊處理
    'OFF': { start: 0, end: 0 }
};

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v4.0 AI 積分回溯版)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v4.0 積分權重 + 回溯機制)");

        try {
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // 1. 預填包班 (Pre-fill)
            this.prefillBatchShifts(context);

            console.log("🔹 開始每日步進排班...");
            
            // 2. 每日排班
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
                // 3. 全局修剪 (Optional: 如果需要像 Python Step 7 一樣的事後修剪，可在此加入)
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
    //  1. 上下文準備 (保持原樣，僅增加 log 初始化)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        // 人員清洗
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                // 預設參數
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 7;
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

        // 載入 Wish & Pref & History (略為簡化，假設資料結構與之前相同)
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
            maxBacktrack: 20000, // 增加回溯上限以適應複雜運算
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

        // 3.1 預處理：修剪過剩的包班 (維持您的邏輯)
        this.adjustBatchOverstaffing(day, context);

        // 3.2 找出待排班人員 (Pending)
        // 這裡不再隨機 shuffle，而是依「目前工時積分」或「公平性」排序會更好
        // 暫時維持 shuffle，但在 solveRecursive 內部會進行「班別的評分」
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
            // 即使缺人也嘗試排下一天 (Soft constraints 策略)
            await this.solveDay(day + 1, context);
            return true;
        }
    }

    // ============================================================
    //  4. AI 核心：計分與遞迴 (Replacing solveStaffForDay)
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        // Base Case: 當天所有人都排完了
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

        // 4.1 產生候選班別
        // 這裡列出所有可能的班，包含 OFF
        let possibleShifts = ['D', 'E', 'N', 'OFF'];
        
        // 如果有 Wish，則候選名單只有 Wish
        const wish = context.wishes[staff.uid][day];
        if (wish) possibleShifts = [wish];

        // 4.2 計算每個候選班別的分數
        const candidates = [];
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        // 取得當前已排的人力計數 (用於計算 Need 分數)
        const currentCounts = { D: 0, E: 0, N: 0 };
        context.staffList.forEach(s => {
            const sh = context.assignments[s.uid][day];
            if (sh && sh !== 'OFF') currentCounts[sh] = (currentCounts[sh] || 0) + 1;
        });

        for (const shift of possibleShifts) {
            // A. 硬限制檢查 (Hard Constraints)
            const { valid, reason } = this.checkHardConstraints(staff, shift, prevShift, context, day);
            if (!valid) {
                // context.logs.push(`  x ${staff.name} -> ${shift}: ${reason}`); // 除錯用
                continue; // 直接剔除
            }

            // B. 評分 (Scoring)
            const { score, details } = this.calculateScore(staff, shift, prevShift, context, day, currentCounts, w);
            
            candidates.push({
                shift: shift,
                score: score,
                details: details
            });
        }

        // 4.3 排序：分數高者優先嘗試 (Heuristic Search)
        candidates.sort((a, b) => b.score - a.score);

        // 4.4 嘗試指派
        for (const cand of candidates) {
            const shift = cand.shift;
            
            // 剪枝 (Pruning): 如果該班已滿，且還有其他選擇 (如 OFF)，且這不是 Wish，則跳過
            // 但為了避免死胡同，如果分數很高，還是試試看
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (shift !== 'OFF' && !wish && currentCounts[shift] >= req) {
                // 只有當分數極高 (例如連續性需求) 時才考慮超排，否則跳過
                if (cand.score < 120) continue; 
            }

            // 執行指派
            context.assignments[staff.uid][day] = shift;
            
            // 驗證整體規則 (RuleEngine)
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
                    return true; // 成功找到路徑
                }
            }

            // 回溯 (Backtrack)
            // context.logs.push(`  << Backtrack: ${staff.name} revert ${shift}`);
            delete context.assignments[staff.uid][day];
        }

        return false; // 無解
    }

    // ============================================================
    //  5. 輔助邏輯：硬限制與評分
    // ============================================================
    
    /**
     * 硬限制檢查 (違反則完全不可選)
     */
    static checkHardConstraints(staff, shift, prevShift, context, day) {
        // 1. 基本的 N 接 D 限制 (視規則而定，假設為硬限制或極高罰分)
        // 這裡示範硬限制：昨晚 E 不能接今早 D (間隔 < 11hr)
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E' && shift === 'D') {
                return { valid: false, reason: "Interval < 11h (E->D)" };
            }
            if (prevShift === 'D' && shift === 'N') { // 假設 D(16下) 接 N(00上) = 8hr
                return { valid: false, reason: "Interval < 11h (D->N)" };
            }
        }
        
        // 2. N 前限制 (如果 Day1 是 N，Day0 必須是 OFF 或 N)
        // 這是護理界常見規則，視您的需求開啟
        // if (shift === 'N' && prevShift !== 'OFF' && prevShift !== 'N') {
        //    return { valid: false, reason: "N must strictly follow N or OFF" };
        // }

        // 3. 孕婦保護
        if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) {
            return { valid: false, reason: "Pregnant protection" };
        }

        return { valid: true, reason: "" };
    }

    /**
     * 計算分數 (Step 4 核心)
     */
    static calculateScore(staff, shift, prevShift, context, day, currentCounts, w) {
        let score = 0;
        const details = [];

        // 1. 基礎分
        const base = (shift === 'OFF') ? 50 : WEIGHTS.BASE;
        score += base;
        // details.push(`Base(${base})`);

        // 2. 需求權重 (Need)
        if (shift !== 'OFF') {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            const current = currentCounts[shift] || 0;
            
            if (current < req) {
                score += WEIGHTS.NEED_HIGH;
                details.push("Need++");
            } else if (current >= req) {
                score -= 50; // 已滿，降分
                details.push("Full--");
            }
        }

        // 3. 個人偏好 (Pref)
        const prefs = context.preferences[staff.uid];
        if (prefs.p1 === shift) {
            score += WEIGHTS.PREFERENCE;
            details.push("P1");
        }
        if (prefs.p2 === shift) {
            score += 10;
            details.push("P2");
        }

        // 4. 連續性與疲勞 (Continuity & Fatigue)
        if (prevShift === shift && shift !== 'OFF') {
            score += WEIGHTS.CONTINUITY;
            details.push("Cont.");
        }

        // N 接 D (軟限制，雖不違法但很累) - 假設 User 允許 N(08:30下) 接 D(08:00上) 但不建議
        if (prevShift === 'N' && shift === 'D') {
            score += WEIGHTS.PENALTY_FATIGUE;
            details.push("N->D fatigue");
        }

        // 累積上班天數過多，OFF 分數加成
        const consecutive = this.calculateConsecutiveWork(staff.uid, day, context);
        if (shift === 'OFF' && consecutive > 5) {
            score += (consecutive * 10);
            details.push(`RestNeed(${consecutive})`);
        }

        return { score, details: details.join(',') };
    }

    // ============================================================
    //  6. 其他工具函數
    // ============================================================
    static adjustBatchOverstaffing(day, context) {
        // (維持您原有的邏輯，這是很好的 Pruning 機制)
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
                    const staffToCut = assignedStaff[i];
                    context.assignments[staffToCut.uid][day] = 'OFF';
                    context.logs.push(`[Day ${day}] Cut Batch: ${staffToCut.uid} (${shift}->OFF)`);
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
