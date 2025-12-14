import { RuleEngine } from "./RuleEngine.js";

// AI 權重設定
const WEIGHTS = {
    BASE: 100,
    NEED_HIGH: 50,
    NEED_LOW: 10,
    PREFERENCE: 20,
    PREFERENCE_P1: 40,
    CONTINUITY: 10,
    PENALTY_FATIGUE: -200, // 加重疲勞扣分
    PENALTY_E_TO_D: -100,  // 加重 E 接 D 扣分
    RECOVERY: 30,
    BALANCE: 20,
    MUST_REST: 500         // 極高權重強制休息
};

export class AutoScheduler {

    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (Strict Compliance Mode)");

        try {
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // 1. 包班預填
            this.prefillBatchShifts(context);

            console.log("🔹 開始每日步進排班...");
            
            // 2. 每日排班
            await this.solveDay(1, context);

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
    //  1. 上下文準備
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        
        // 確保 maxConsecutiveWork 有預設值，且為硬性限制
        rules.maxConsecutiveWork = rules.maxConsecutiveWork || 6; 

        const assignments = {};
        const lastMonthShifts = {}; 

        staffList.forEach(s => {
            assignments[s.uid] = {};
            lastMonthShifts[s.uid] = 'OFF'; 
        });

        // 讀取預班需求
        try {
            if (preScheduleData.submissions) {
                Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                    if (assignments[uid] && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            assignments[uid][parseInt(d)] = wish;
                        });
                    }
                });
            }
        } catch(e) {}

        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { D: rawReq.D || {}, E: rawReq.E || {}, N: rawReq.N || {} };

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: staffList,
            assignments: assignments,
            rules: rules,
            staffReq: staffReq,
            shiftDefs: settings.shifts || [],
            logs: [],
            maxBacktrack: 30000,
            backtrackCount: 0,
            cache: { consecutiveDays: new Map() },
            onProgress: currentSchedule.onProgress,
            shouldStop: currentSchedule.shouldStop
        };
    }

    // ============================================================
    //  2. 每日步進
    // ============================================================
    static async solveDay(day, context) {
        if (context.shouldStop && context.shouldStop()) return true;
        if (day > context.daysInMonth) return true;

        if (context.onProgress) {
            context.onProgress({
                currentDay: day,
                totalDays: context.daysInMonth,
                progress: Math.round((day / context.daysInMonth) * 100)
            });
        }

        // 2.1 找出待排班人員 (排除已預班)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        
        // 隨機打亂，避免總是同一人優先
        this.shuffleArray(pendingStaff);

        // 2.2 遞迴求解
        const success = await this.solveRecursive(day, pendingStaff, 0, context);

        // 2.3 即使失敗也繼續往下一天排 (盡力而為)
        if (!success) {
            context.logs.push(`Day ${day}: 勉強通過 (人力可能不足)`);
        }
        
        // 讓 UI 有機會渲染
        if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
        return await this.solveDay(day + 1, context);
    }

    // ============================================================
    //  3. 遞迴核心
    // ============================================================
    static async solveRecursive(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false; // 防止死迴圈

        const staff = staffList[index];
        const possibleShifts = this.getPossibleShifts(staff, day, context);
        
        // 根據分數排序，分數高的優先嘗試
        possibleShifts.sort((a, b) => b.score - a.score);

        // 只嘗試前 3 個高分選項，提升速度
        const tryLimit = Math.min(possibleShifts.length, 3);

        for (let i = 0; i < tryLimit; i++) {
            const { shift } = possibleShifts[i];
            
            // 剪枝：如果該班別人力已滿，且不是 OFF，則跳過 (除非真的很缺人)
            if (shift !== 'OFF' && this.isShiftFull(shift, day, context)) {
                // 有機率還是排進去 (20%) 增加彈性，或者如果是唯一選擇
                if (Math.random() > 0.2) continue;
            }

            context.assignments[staff.uid][day] = shift;
            
            if (await this.solveRecursive(day, staffList, index + 1, context)) {
                return true;
            }

            // 回溯
            delete context.assignments[staff.uid][day];
        }

        // 如果該員工無解 (例如所有班別都違反硬限制)，強迫排 OFF
        context.assignments[staff.uid][day] = 'OFF';
        return await this.solveRecursive(day, staffList, index + 1, context);
    }

    // ============================================================
    //  4. 班別篩選與評分 (硬邏輯核心)
    // ============================================================
    static getPossibleShifts(staff, day, context) {
        const shifts = ['D', 'E', 'N', 'OFF'];
        const results = [];
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        for (const shift of shifts) {
            // ✅ 4.1 硬限制檢查 (Hard Constraints) - 這裡最重要
            if (!this.checkHardConstraints(staff, shift, day, context)) {
                continue; // 直接剔除，絕對不排
            }

            // 4.2 計算分數
            let score = 0;
            const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';

            // 基礎分
            score += (shift === 'OFF') ? 50 : WEIGHTS.BASE;

            // 人力需求分
            if (shift !== 'OFF') {
                const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
                const current = this.getCurrentCount(shift, day, context);
                if (current < req) score += WEIGHTS.NEED_HIGH; // 缺人就加分
                else score -= 50; // 滿了就扣分
            }

            // 連續上班扣分 (避免雖然沒超過硬上限，但還是太累)
            const consecutive = this.getConsecutiveDays(staff.uid, day, context);
            if (shift !== 'OFF' && consecutive >= 5) score -= 100;
            
            // N 班偏好
            if (shift === 'N' && prevShift === 'N') score += WEIGHTS.CONTINUITY;

            results.push({ shift, score });
        }
        return results;
    }

    static checkHardConstraints(staff, shift, day, context) {
        const prevShift = context.assignments[staff.uid][day - 1] || 'OFF';
        const consecutive = this.getConsecutiveDays(staff.uid, day, context);
        const maxDays = context.rules.maxConsecutiveWork || 6;

        // 1. 連續工作上限 (勞基法七休一)
        if (shift !== 'OFF' && consecutive >= maxDays) {
            return false; // ❌ 絕對禁止：連續上班超過天數
        }

        // 2. 班別間隔 (11小時)
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E' && shift === 'D') return false; // ❌ 禁止 E 接 D
            if (prevShift === 'D' && shift === 'N') return false; // ❌ 禁止 D 接 N
        }

        // 3. 孕婦保護
        if (staff.constraints?.isPregnant && (shift === 'N' || shift === 'E')) {
            return false; // ❌ 禁止夜間工作
        }
        
        // 4. 大夜後不可接白班
        if (prevShift === 'N' && shift === 'D') return false;

        return true;
    }

    // ============================================================
    //  輔助函式
    // ============================================================
    static getConsecutiveDays(uid, currentDay, context) {
        // 簡單快取機制
        const key = `${uid}-${currentDay}`;
        if(context.cache.consecutiveDays.has(key)) return context.cache.consecutiveDays.get(key);

        let count = 0;
        // 計算包含當天(如果是工作日)之前的連續天數
        // 注意：這裡我們是在評估「如果今天排 shift」，所以如果 shift 不是 OFF，count 至少是 1 + 前面的
        // 但此函式是計算「前面已經連上幾天」，所以在 checkHardConstraints 判斷時，是判斷 (前面 + 今天 > 上限)
        
        for (let d = currentDay - 1; d >= 1; d--) {
            const s = context.assignments[uid][d];
            if (s && s !== 'OFF' && s !== 'M_OFF') count++;
            else break;
        }
        context.cache.consecutiveDays.set(key, count);
        return count;
    }

    static isShiftFull(shift, day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
        const current = this.getCurrentCount(shift, day, context);
        return current >= req;
    }

    static getCurrentCount(shift, day, context) {
        let count = 0;
        context.staffList.forEach(s => {
            if (context.assignments[s.uid][day] === shift) count++;
        });
        return count;
    }

    static prefillBatchShifts(context) {
        // 簡單實作：如果有包班設定，先填入
        context.staffList.forEach(s => {
            if (s.constraints?.batchPref) {
                for (let d = 1; d <= context.daysInMonth; d++) {
                    if (!context.assignments[s.uid][d]) {
                        context.assignments[s.uid][d] = s.constraints.batchPref;
                    }
                }
            }
        });
    }

    static shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
