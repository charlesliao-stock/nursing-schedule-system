import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎
     * @param {Object} currentSchedule 目前的排班物件 (含 year, month)
     * @param {Array} staffList 人員列表 (含 constraints)
     * @param {Object} unitSettings 單位設定 (含 rules, staffRequirements)
     * @param {Object} preScheduleData 預班資料 (含 submissions)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (步進回溯模式)");

        // --- 1. 上下文準備 (Context Preparation) ---
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
            console.warn("⚠️ 排班完成，但可能存在未解的缺口或妥協");
            // 即使失敗也回傳目前的進度供參考 (通常是 Partial Solution)
            return { assignments: context.assignments, logs: context.logs }; 
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 資料清洗與標準化
        const validStaffList = staffList.filter(s => s.uid || s.id).map(s => {
            const newS = { ...s };
            newS.uid = s.uid || s.id;
            newS.constraints = s.constraints || {};
            // 確保有預設值
            if (!newS.constraints.maxConsecutive) newS.constraints.maxConsecutive = 7;
            if (!newS.constraints.maxConsecutiveNights) newS.constraints.maxConsecutiveNights = 4;
            return newS;
        });

        // 建立班表儲存結構
        const assignments = {};
        const wishes = {}; // 儲存「預班」內容，用於特殊邏輯判斷
        
        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
        });

        // 載入預班 (Wishes) 並鎖定
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                // 確保該員還在名單內
                if (assignments[uid] && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish; // 記錄原始預班意願
                        assignments[uid][day] = wish; // 預填入班表
                    });
                }
            });
        }

        // 定義班別與權重
        let shiftDefs = unitSettings.settings?.shifts || [
            { code: 'D', name: '白班' }, { code: 'E', name: '小夜' }, { code: 'N', name: '大夜' }, { code: 'OFF', name: '休假' }
        ];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments,
            wishes: wishes, 
            rules: unitSettings.rules || {},
            staffReq: unitSettings.staffRequirements || { D: {}, E: {}, N: {} },
            shiftDefs: shiftDefs,
            shiftPriority: ['N', 'E', 'D', 'OFF'], // 嘗試順序
            logs: [],
            // 安全閥：避免無限迴圈
            maxBacktrack: 100000, 
            backtrackCount: 0
        };
    }

    // ============================================================
    //  核心邏輯 2: 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            // 假設包班設定存在於 constraints.canBatch 與 preferences.batch (需確認資料結構)
            // 這裡模擬讀取：若人員有 canBatch 且有指定 batchPref (需從外部傳入或在 staff 物件中)
            // 為簡化，這裡假設 constraints 裡有一個 batchPref 欄位 (實際需對接 SubmitPage 資料)
            const batchType = staff.constraints?.batchPref; // 例如 'N'
            
            if (staff.constraints?.canBatch && batchType) {
                for (let day = 1; day <= context.daysInMonth; day++) {
                    const existingAssignment = context.assignments[staff.uid][day];
                    
                    // 邏輯：若該格是空的，就填包班；若已經有 OFF (預班)，則保留 OFF
                    if (!existingAssignment) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
    }

    // ============================================================
    //  核心邏輯 3: 每日步進 (遞迴 Solver)
    // ============================================================
    static async solveDay(day, context) {
        // 終止條件：成功排完最後一天
        if (day > context.daysInMonth) return true;

        // 取得當日「尚未排班」的人員 (排除已有預班、包班的人)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);

        // 隨機打亂順序，避免排後面的人永遠吃虧
        this.shuffleArray(pendingStaff);

        // 進入「單日人員填空」遞迴
        // 我們傳入 pendingStaff 的 index，一個一個排
        if (await this.solveStaffForDay(day, pendingStaff, 0, context)) {
            
            // 當日所有人排完後，進行【當日人力檢查】
            const manpowerCheck = this.checkDailyManpower(day, context);
            
            if (manpowerCheck.isValid) {
                // UI 讓步：每排幾天讓瀏覽器喘息一下，避免畫面凍結
                if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));

                // 成功，推進到下一天
                if (await this.solveDay(day + 1, context)) return true;
                
                // 若下一天回傳 false (失敗)，則程式會繼續往下走 -> 觸發本層的回溯
            } else {
                // 當日人力不足，這是一個失敗的分支
                // console.log(`[Backtrack] Day ${day} 人力不足: ${manpowerCheck.missing}`);
            }
        }

        // 若跑到這裡，代表：
        // 1. solveStaffForDay 失敗 (有人無班可排)
        // 2. 或 checkDailyManpower 失敗 (人力不足)
        // 3. 或 solveDay(day+1) 失敗 (未來走投無路)
        
        // 【回溯】：清除這一天「系統試填」的所有班別 (還原狀態)
        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人單日決策 (深度優先搜尋)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        // Base Case: 這一天的人都排完了
        if (index >= staffList.length) return true;

        // 安全閥檢查
        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) {
            throw new Error("計算量過大 (超過回溯上限)，排班強制中止。建議放寬規則。");
        }

        const staff = staffList[index];
        
        // 1. 產生候選班別 (依分數排序)
        // 這裡可以加入 calculateScore 來動態排序，目前先用固定優先序
        let candidates = [...context.shiftPriority]; // ['N', 'E', 'D', 'OFF']

        // 2. 特殊邏輯過濾：
        // 規則：若 Day N-1 是「預班 OFF」，今天不能排 N (防止規避)
        // 規則：若 Day N-1 是「系統排 OFF」，今天可以排 N
        if (candidates.includes('N')) {
            const prevDayWish = context.wishes[staff.uid][day - 1]; // 昨天的預班
            const prevAssignment = context.assignments[staff.uid][day - 1];
            
            // 昨天是 OFF 且 昨天是預班
            if (prevAssignment === 'OFF' && (prevDayWish === 'OFF' || prevDayWish === 'M_OFF')) {
                // 剔除 N
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        // 3. 嘗試每個候選班別
        for (const shiftCode of candidates) {
            
            // 3.1 模擬填入
            context.assignments[staff.uid][day] = shiftCode;

            // 3.2 【規則檢核】呼叫 RuleEngine
            // 我們只驗證這位員工、到今天為止的排班是否合法 (Hard Rules)
            const validation = RuleEngine.validateStaff(
                context.assignments[staff.uid], 
                context.daysInMonth, 
                context.shiftDefs, 
                context.rules, 
                staff.constraints
            );

            // 檢查今天 (day) 是否有錯誤
            const hasError = !!validation.errors[day];

            if (!hasError) {
                // 合法！遞迴排下一個人
                if (await this.solveStaffForDay(day, staffList, index + 1, context)) {
                    return true; // 成功找到路徑
                }
                // 若下一個人回傳 false，代表這個 shiftCode 雖然我合法，但會害死後面的人
                // 所以繼續迴圈，換下一個 shiftCode 試試看
            }
        }

        // 4. 死路：所有班別都試過了都不行
        // 清除嘗試的痕跡
        delete context.assignments[staff.uid][day];
        return false; // 回傳失敗，觸發上一層換班別
    }

    // ============================================================
    //  輔助方法
    // ============================================================

    static checkDailyManpower(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const weekDay = date.getDay();
        const req = context.staffReq; // {D:{0:3...}, E:..., N:...}
        
        const counts = { D: 0, E: 0, N: 0 };
        
        // 統計當日所有人
        Object.values(context.assignments).forEach(sch => {
            const s = sch[day];
            if (counts[s] !== undefined) counts[s]++;
        });

        // 比對需求
        const missing = [];
        ['D', 'E', 'N'].forEach(s => {
            const needed = (req[s] && req[s][weekDay]) || 0;
            if (counts[s] < needed) missing.push(`${s}(缺${needed - counts[s]})`);
        });

        if (missing.length > 0) return { isValid: false, missing: missing.join(', ') };
        return { isValid: true };
    }

    static rollbackDay(day, staffList, context) {
        // 只清除「系統排」的部分，保留預班
        staffList.forEach(s => {
            // 因為 staffList 傳進來的是 pendingStaff (原本該日無班的人)
            // 所以可以直接刪除，不用擔心刪到預班
            delete context.assignments[s.uid][day];
        });
    }

    static shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
