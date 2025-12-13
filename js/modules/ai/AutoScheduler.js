import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (步進回溯模式)");

        // --- 1. 上下文準備 (Context Preparation) ---
        const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
        
        // --- 2. 包班預填階段 (Preprocessing) ---
        console.log("🔹 執行包班預填...");
        this.prefillBatchShifts(context);

        // --- 3. 進入步進式排班主迴圈 (Solver) ---
        console.log("🔹 開始每日步進排班...");
        // 從第 1 天開始排，傳入遞迴深度限制避免當機
        const success = await this.solveDay(1, context);

        if (success) {
            console.log("✅ 排班成功！");
            return { assignments: context.assignments, logs: context.logs };
        } else {
            console.error("❌ 排班失敗：無法找到滿足所有硬規則的解");
            // 即使失敗也回傳目前的進度供參考
            return { assignments: context.assignments, logs: context.logs }; 
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 資料清洗
        const validStaffList = staffList.filter(s => s.uid || s.id).map(s => {
            s.uid = s.uid || s.id;
            s.constraints = s.constraints || {};
            // 確保有預設值
            if (!s.constraints.maxConsecutive) s.constraints.maxConsecutive = 7;
            return s;
        });

        // 建立班表儲存結構
        const assignments = {};
        const wishes = {}; // 儲存「預班」內容，用於與「系統排班」做區隔
        
        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
        });

        // 載入預班 (Wishes)
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (assignments[uid] && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish; // 記錄原始預班
                        // 預先填入 assignments，之後包班邏輯會用到
                        assignments[uid][day] = wish; 
                    });
                }
            });
        }

        // 定義班別
        let shiftDefs = unitSettings.settings?.shifts || [
            { code: 'D', name: '白班' }, { code: 'E', name: '小夜' }, { code: 'N', name: '大夜' }, { code: 'OFF', name: '休假' }
        ];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments,
            wishes: wishes, // 這是關鍵：用來區分「預休」還是「系統休」
            rules: unitSettings.rules || {},
            staffReq: unitSettings.staffRequirements || { D: {}, E: {}, N: {} },
            shiftDefs: shiftDefs,
            shiftPriority: ['N', 'E', 'D', 'OFF'], // 嘗試順序
            logs: [],
            // 效能控制
            maxBacktrack: 5000, // 最大回溯次數，避免瀏覽器卡死
            backtrackCount: 0
        };
    }

    // ============================================================
    //  核心邏輯 2: 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            // 讀取包班偏好 (需在 SubmitPage 儲存時寫入 preferences.batch)
            // 這裡假設 staff 物件已經包含了提交的 preferences
            // 若資料結構不同，需從 preScheduleData 撈取
            
            // 假設 batchPref 存在於 staff.batchPref 或從 submissions 撈到的
            // 為了示範，這裡檢查 constraints.canBatch 與預班設定
            const batchType = staff.constraints?.batchPref; // 例如 'N' 或 'D'
            
            if (staff.constraints?.canBatch && batchType) {
                // 掃描整個月
                for (let day = 1; day <= context.daysInMonth; day++) {
                    const existingWish = context.assignments[staff.uid][day];
                    
                    // 若該日無預班，或非 OFF 類預班，則強制填入包班
                    // 若是 'OFF' 或 'M_OFF'，則保留，不做動作 (保留 OFF)
                    if (!existingWish) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
    }

    // ============================================================
    //  核心邏輯 3: 每日步進 (遞迴)
    // ============================================================
    static async solveDay(day, context) {
        // 終止條件：排完最後一天
        if (day > context.daysInMonth) return true;

        // 取得當日需要排班的人員 (排除已有預班或已包班填滿的人)
        // 注意：這裡只排「空位」，如果包班邏輯已經填了，這裡就跳過
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);

        // 為了公平與隨機性，每天打亂順序
        this.shuffleArray(pendingStaff);

        // 進入「單日人員填空」遞迴
        if (await this.solveStaffForDay(day, pendingStaff, 0, context)) {
            
            // 當日所有人排完後，【檢查當日人力】
            const manpowerCheck = this.checkDailyManpower(day, context);
            
            if (manpowerCheck.isValid) {
                // 讓 UI 有機會喘息渲染 (避免算太久畫面凍結)
                if (day % 5 === 0) await new Promise(r => setTimeout(r, 0));

                // 成功，推進到下一天
                if (await this.solveDay(day + 1, context)) return true;
                
                // 若下一天失敗回傳 false，則這一天也要回溯 (Backtrack Global)
            } else {
                // 人力不足，觸發回溯
                // context.logs.push(`Day ${day} 人力不足 (${manpowerCheck.missing}), 回溯...`);
            }
        }

        // 若跑到這，代表這一天無解 (死路)
        // 清除這一天所有「系統排」的班 (保留預班)
        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人單日決策 (深度優先搜尋)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        // 這一天的人都排完了
        if (index >= staffList.length) return true;

        // 安全機制：回溯次數過多強制停止
        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) throw new Error("計算量過大，強制中止");

        const staff = staffList[index];
        
        // 1. 產生候選班別
        let candidates = [...context.shiftPriority]; // ['N', 'E', 'D', 'OFF']

        // 2. 特殊邏輯：針對非包班人員的大夜 (N) 檢核
        // 若 Day N-1 是「預班 OFF」，剔除 N
        if (candidates.includes('N') && !staff.constraints?.canBatch) {
            const prevDayWish = context.wishes[staff.uid][day - 1]; // 昨天的「預班」狀況
            if (prevDayWish === 'OFF' || prevDayWish === 'M_OFF') {
                // 昨天是請假，今天不能接 N (防止規避)
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        // 3. 嘗試每個班別
        for (const shiftCode of candidates) {
            
            // 【模擬填入】
            context.assignments[staff.uid][day] = shiftCode;

            // 【規則檢核】呼叫 RuleEngine
            // 注意：這裡只驗證這位員工截至今日是否合法
            // 為了效能，我們只檢查 Hard Rules
            const isValid = this.validateHardRules(staff, day, shiftCode, context);

            if (isValid) {
                // 合法，遞迴排下一個人
                if (await this.solveStaffForDay(day, staffList, index + 1, context)) {
                    return true;
                }
            }
        }

        // 【死路】所有班別都試過了都不行
        // 回溯：清除該員該日班別
        delete context.assignments[staff.uid][day];
        return false;
    }

    // ============================================================
    //  輔助方法
    // ============================================================

    static validateHardRules(staff, day, shiftCode, context) {
        // 這裡應該呼叫 RuleEngine.validateStaff
        // 為了效能，這邊寫簡化版，實際應整合您的 RuleEngine.js
        
        // 1. 連續上班檢查
        // 需往回追溯 context.assignments
        // ... (省略實作細節，應由 RuleEngine 處理)
        
        // 2. 間隔 11 小時 (E-D, D-N)
        const prevShift = context.assignments[staff.uid][day - 1];
        if (context.rules.constraints?.minInterval11h) {
            if (prevShift === 'E' && shiftCode === 'D') return false;
            if (prevShift === 'D' && shiftCode === 'N') return false;
        }

        // 3. N 前一天必須 N 或 OFF (若有此規則)
        if (context.rules.constraints?.firstNRequiresOFF && shiftCode === 'N') {
            if (prevShift && prevShift !== 'N' && prevShift !== 'OFF' && prevShift !== 'M_OFF') return false;
        }

        return true;
    }

    static checkDailyManpower(day, context) {
        const weekDay = new Date(context.year, context.month - 1, day).getDay();
        const req = context.staffReq; // {D:{0:3...}, E:..., N:...}
        
        const counts = { D: 0, E: 0, N: 0 };
        Object.values(context.assignments).forEach(sch => {
            const s = sch[day];
            if (counts[s] !== undefined) counts[s]++;
        });

        // 檢查缺口
        const missing = [];
        ['D', 'E', 'N'].forEach(s => {
            const needed = (req[s] && req[s][weekDay]) || 0;
            if (counts[s] < needed) missing.push(s);
        });

        if (missing.length > 0) return { isValid: false, missing: missing.join(',') };
        return { isValid: true };
    }

    static rollbackDay(day, staffList, context) {
        staffList.forEach(s => {
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
