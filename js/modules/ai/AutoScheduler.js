import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (步進回溯版)
     * @param {Object} currentSchedule 目前的排班物件 (含 year, month)
     * @param {Array} staffList 人員列表 (含 constraints)
     * @param {Object} unitSettings 單位設定 (含 rules, staffRequirements)
     * @param {Object} preScheduleData 預班資料 (含 submissions)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (安全步進模式)");

        try {
            // --- 1. 上下文準備 (Context Preparation) ---
            // 這裡進行了嚴格的資料清洗，防止 undefined 錯誤
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // --- 2. 包班預填階段 (Preprocessing) ---
            console.log("🔹 執行包班預填...");
            this.prefillBatchShifts(context);

            // --- 3. 進入步進式排班主迴圈 (Solver) ---
            console.log("🔹 開始每日步進排班...");
            
            // 從第 1 天開始排
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
                return { assignments: context.assignments, logs: context.logs };
            } else {
                console.warn("⚠️ 排班完成，但可能存在未解的缺口或妥協 (已達回溯上限)");
                // 即使失敗也回傳目前的進度供參考
                return { assignments: context.assignments, logs: context.logs }; 
            }

        } catch (e) {
            console.error("❌ 排班引擎發生錯誤:", e);
            // 回傳空結果與錯誤訊息，避免前端畫面全白
            return { assignments: {}, logs: [`Critical Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備 (高強度防呆)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 基礎物件防呆：確保所有輸入都不是 null/undefined
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {}; // ✅ 關鍵修復：確保 submissions 至少是空物件

        // 2. 人員名單清洗與參數補正
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                
                // 補足 RuleEngine 所需的預設值，防止 crash
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 7;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

        // 3. 建立儲存結構
        const assignments = {};
        const wishes = {}; // 用於區分「預班OFF」與「系統OFF」
        
        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
        });

        // 4. 載入預班 (Wishes) - 使用 try-catch 保護
        try {
            Object.entries(submissions).forEach(([uid, sub]) => {
                // 確保該員還在名單內，且 sub 物件結構正確
                if (assignments[uid] && sub && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish;      // 記錄原始意願
                        assignments[uid][day] = wish; // 預填入班表
                    });
                }
            });
        } catch(e) {
            console.warn("⚠️ 讀取預班資料時發生輕微錯誤 (已忽略):", e);
        }

        // 5. 班別定義
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
            rules: rules,
            staffReq: unitSettings.staffRequirements || { D: {}, E: {}, N: {} },
            shiftDefs: shiftDefs,
            shiftPriority: ['N', 'E', 'D', 'OFF'], // 嘗試填入的優先順序
            logs: [],
            maxBacktrack: 50000, // 安全閥：最大回溯次數
            backtrackCount: 0
        };
    }

    // ============================================================
    //  核心邏輯 2: 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            // 讀取包班偏好 (假設存在於 constraints.batchPref 或 submissions 中)
            // 這裡統一從 constraints 讀取 (需確保 SubmitPage 寫入位置一致)
            const batchType = staff.constraints?.batchPref; 
            
            if (staff.constraints?.canBatch && batchType) {
                for (let day = 1; day <= context.daysInMonth; day++) {
                    const existing = context.assignments[staff.uid][day];
                    // 邏輯：若格子是空的 (沒預班)，就填入包班；若有 OFF 則不動
                    if (!existing) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
    }

    // ============================================================
    //  核心邏輯 3: 每日步進 (Solver)
    // ============================================================
    static async solveDay(day, context) {
        // 終止條件：排完最後一天
        if (day > context.daysInMonth) return true;

        // 找出當日空白的人員 (排除已有預班或包班的人)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        
        // 隨機打亂順序，確保公平性
        this.shuffleArray(pendingStaff);

        // 進入單日人員填空
        if (await this.solveStaffForDay(day, pendingStaff, 0, context)) {
            
            // 當日排完後，檢查人力缺口
            const check = this.checkDailyManpower(day, context);
            
            if (check.isValid) {
                // UI 效能優化：每排 3 天讓瀏覽器喘息一下
                if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));

                // 成功，推進到下一天
                if (await this.solveDay(day + 1, context)) return true;
                
                // 若下一天失敗回傳 false，程式會繼續往下走 -> 觸發本層回溯
            }
        }

        // 死路回溯：還原這一天
        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人決策 (DFS)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        // 這一天的人都排完了
        if (index >= staffList.length) return true;

        // 安全閥檢查
        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) {
            throw new Error("運算量過大，強制中止 (建議檢查規則是否過於嚴苛)");
        }

        const staff = staffList[index];
        let candidates = [...context.shiftPriority];

        // --- 特殊規則：預休 OFF 不接 N ---
        if (candidates.includes('N')) {
            const prevWish = context.wishes[staff.uid][day - 1];      // 昨天是否「預班OFF」
            const prevAssigned = context.assignments[staff.uid][day - 1]; // 昨天的最終班表
            
            // 邏輯：昨天是 OFF 且 這個 OFF 是員工自己要的
            if (prevAssigned === 'OFF' && (prevWish === 'OFF' || prevWish === 'M_OFF')) {
                // 剔除 N
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        // 嘗試每個候選班別
        for (const shift of candidates) {
            // 暫填
            context.assignments[staff.uid][day] = shift;
            
            // 呼叫 RuleEngine 驗證 (只檢查 Hard Rules)
            const result = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints
            );

            // 如果今天沒有違規
            if (!result.errors[day]) {
                // 遞迴排下一個人
                if (await this.solveStaffForDay(day, staffList, index + 1, context)) {
                    return true;
                }
            }
        }

        // 死路：所有班別都試過了都不行 -> 回溯
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
            const req = (context.staffReq[s] && context.staffReq[s][w]) || 0;
            if (counts[s] < req) missing.push(s);
        });

        return { isValid: missing.length === 0, missing };
    }

    static rollbackDay(day, staffList, context) {
        // 只清除當下嘗試排的人，保留原本的預班
        staffList.forEach(s => delete context.assignments[s.uid][day]);
    }

    static shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
