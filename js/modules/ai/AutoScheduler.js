import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (歷史數據整合版)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v3.0 歷史數據整合版)");

        try {
            // --- 1. 上下文準備 ---
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // --- 2. 包班預填 ---
            console.log("🔹 執行包班預填...");
            this.prefillBatchShifts(context);

            // --- 3. 步進式排班 ---
            console.log("🔹 開始每日步進排班...");
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
                return { assignments: context.assignments, logs: context.logs };
            } else {
                console.warn("⚠️ 排班完成 (達回溯上限)，結果可能不完美");
                return { assignments: context.assignments, logs: context.logs }; 
            }

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            // 回傳錯誤日誌，讓前端知道發生什麼事
            return { assignments: {}, logs: [`Critical Error: ${e.message}`, `Stack: ${e.stack}`] };
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備 (整合 History)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 基礎物件防呆 (處理 null 與 undefined)
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        
        // 🔥 關鍵修復：Object.entries(null) 會報錯，必須確保是物件
        const submissions = (preScheduleData.submissions && typeof preScheduleData.submissions === 'object') ? preScheduleData.submissions : {};
        const historyData = (preScheduleData.history && typeof preScheduleData.history === 'object') ? preScheduleData.history : {};

        // 2. 人員清洗
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

        // 3. 初始化容器
        const assignments = {};
        const wishes = {}; 
        // 新增：上個月最後一天的班別 (用於 Day 1 檢查)
        const lastMonthShifts = {}; 

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            lastMonthShifts[s.uid] = null; // 預設無資料
        });

        // 4. 載入預班 (Wishes)
        try {
            Object.entries(submissions).forEach(([uid, sub]) => {
                if (assignments[uid] && sub && sub.wishes) {
                    Object.entries(sub.wishes || {}).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish;
                        assignments[uid][day] = wish; 
                    });
                }
            });
        } catch(e) { console.warn("預班讀取警告:", e); }

        // 5. 載入歷史資料 (History) - 找出上個月最後一天
        // historyData 結構: { uid: { 26: 'D', ... 30: 'N' } }
        try {
            Object.entries(historyData).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    // 找出 key 最大的一天 (即上個月最後一天)
                    const days = Object.keys(history).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) {
                        const lastDay = days[0];
                        lastMonthShifts[uid] = history[lastDay];
                    }
                }
            });
        } catch(e) { console.warn("歷史資料讀取警告:", e); }

        // 6. 人力需求防呆
        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { 
            D: rawReq.D || {}, 
            E: rawReq.E || {}, 
            N: rawReq.N || {} 
        };

        // 7. 班別定義
        let shiftDefs = settings.shifts || [
            { code: 'D', name: '白班' }, { code: 'E', name: '小夜' }, { code: 'N', name: '大夜' }, { code: 'OFF', name: '休假' }
        ];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments,
            wishes: wishes, 
            lastMonthShifts: lastMonthShifts, // ✅ 傳遞歷史資料
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
            shiftPriority: ['N', 'E', 'D', 'OFF'], 
            logs: [],
            maxBacktrack: 50000, 
            backtrackCount: 0
        };
    }

    // ============================================================
    //  核心邏輯 2: 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            const batchType = staff.constraints?.batchPref; 
            if (staff.constraints?.canBatch && batchType) {
                for (let day = 1; day <= context.daysInMonth; day++) {
                    const existing = context.assignments[staff.uid][day];
                    if (!existing) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
    }

    // ============================================================
    //  核心邏輯 3: 每日步進
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.daysInMonth) return true;

        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        if (await this.solveStaffForDay(day, pendingStaff, 0, context)) {
            const check = this.checkDailyManpower(day, context);
            if (check.isValid) {
                if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
                if (await this.solveDay(day + 1, context)) return true;
            }
        }

        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人決策 (整合 History Check)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) throw new Error("運算超載");

        const staff = staffList[index];
        let candidates = [...context.shiftPriority];

        // --- 判斷前一天 (Prev Day) ---
        let prevAssignment = null;
        let prevWish = null;

        if (day === 1) {
            // ✅ Day 1 特殊處理：讀取上個月最後一天 (History)
            prevAssignment = context.lastMonthShifts[staff.uid]; 
            // 上個月的預班我們通常不追溯，設為 null 或依需求擴充
            prevWish = null; 
        } else {
            // Day 2+：讀取本月前一天
            prevAssignment = context.assignments[staff.uid][day - 1];
            prevWish = context.wishes[staff.uid][day - 1];
        }

        // --- 規則：預休 OFF 不接 N ---
        if (candidates.includes('N')) {
            // 只有在本月內 (Day > 1) 才能判斷是否為「預休」
            // Day 1 無法判斷上個月是否為預休，故暫時忽略此規則，或視為系統休
            if (day > 1 && prevAssignment === 'OFF' && (prevWish === 'OFF' || prevWish === 'M_OFF')) {
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        // --- 嘗試班別 ---
        for (const shift of candidates) {
            context.assignments[staff.uid][day] = shift;
            
            // 呼叫 RuleEngine (需支援 Day 1 邊界檢查)
            // 為了讓 Day 1 能檢查間隔 (例如上月30是E，今日不能D)
            // 我們需要在 RuleEngine 內部處理，或者在這裡做簡易的 Hard Check
            
            // 簡易 Hard Check: E 接 D, D 接 N
            let hardCheckPassed = true;
            if (context.rules.constraints?.minInterval11h && prevAssignment) {
                if (prevAssignment === 'E' && shift === 'D') hardCheckPassed = false;
                if (prevAssignment === 'D' && shift === 'N') hardCheckPassed = false;
            }

            if (hardCheckPassed) {
                // 執行完整檢查
                const result = RuleEngine.validateStaff(
                    context.assignments[staff.uid], 
                    context.daysInMonth, 
                    context.shiftDefs, 
                    context.rules, 
                    staff.constraints
                );

                if (!result.errors[day]) {
                    if (await this.solveStaffForDay(day, staffList, index + 1, context)) {
                        return true;
                    }
                }
            }
        }

        delete context.assignments[staff.uid][day];
        return false;
    }

    // ============================================================
    //  輔助方法
    // ============================================================
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
            // ✅ 防呆：確保 staffReq[s] 存在
            const reqObj = context.staffReq[s] || {};
            const req = reqObj[w] || 0;
            if (counts[s] < req) missing.push(s);
        });

        return { isValid: missing.length === 0, missing };
    }

    static rollbackDay(day, staffList, context) {
        staffList.forEach(s => delete context.assignments[s.uid][day]);
    }

    static shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
