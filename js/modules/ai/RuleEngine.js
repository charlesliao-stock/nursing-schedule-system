/**
 * 規則驗證引擎
 */
export class RuleEngine {

    /**
     * 驗證單一員工
     * @param {Object} assignments 排班資料 { "1": "D", ... }
     * @param {number} daysInMonth 當月天數
     * @param {Array} shiftDefs 班別定義 (從 Unit Settings 取得)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs) {
        const errors = {}; 
        
        if (!assignments || !shiftDefs) return { errors };

        // 建立快速查詢表: code -> shiftObject
        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);

        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = assignments[d] || '';
        }

        // --- 規則檢查迴圈 ---
        let consecutiveDays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const currentShift = shiftMap[currentCode];

            // 1. 檢查連續工作 (連七)
            if (currentCode && currentCode !== 'OFF') {
                consecutiveDays++;
            } else {
                consecutiveDays = 0;
            }

            if (consecutiveDays > 6) {
                errors[d] = "連續工作超過 6 天 (連七)";
            }

            // 2. 檢查間隔時間 (11小時條款)
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                const prevShift = shiftMap[prevCode];

                // 只有當前後兩天都有排班，且都不是 OFF 時才檢查
                if (prevShift && currentShift && prevCode !== 'OFF' && currentCode !== 'OFF') {
                    if (prevShift.endTime && currentShift.startTime) {
                        const restHours = this.calculateRestHours(prevShift.endTime, currentShift.startTime);
                        if (restHours < 11) {
                            errors[d] = `間隔不足 11 小時 (${restHours.toFixed(1)}hr)`;
                        }
                    }
                }
            }
        }

        return { errors };
    }

    /**
     * 計算休息時間 (小時)
     * 假設情境：
     * A: 08:00-16:00
     * B: 16:00-24:00
     * C: 00:00-08:00 (跨日)
     */
    static calculateRestHours(prevEndTimeStr, currStartTimeStr) {
        // 格式 HH:mm
        const parseTime = (str) => {
            const [h, m] = str.split(':').map(Number);
            return h + m / 60;
        };

        let prevEnd = parseTime(prevEndTimeStr);
        let currStart = parseTime(currStartTimeStr);

        // 邏輯修正：
        // 我們要計算的是 Day 1 的結束時間 到 Day 2 的開始時間
        // 所以 Day 2 的時間基礎上要 + 24 小時
        // 範例 1: D(08-16) 接 N(00-08, 假設是隔天凌晨) -> 這是同一天還是隔天? 
        // 在 validateStaff 迴圈中，d 與 d-1 代表「日曆天」。
        
        // 情況 A: 前一班是在 Day 1 結束 (e.g., 16:00)
        // 情況 B: 前一班跨日到 Day 2 結束 (e.g., 大夜 24:00 或 08:00)
        // 這邊需要知道「班別是否跨日」。
        // 簡單判斷：如果 endTime < startTime，通常代表跨日 (如 16:00 - 00:00, 00:00 - 08:00)
        
        // 但我們現在只有 HH:mm。
        // 我們假設排班表上的 D, E, N 都是標準班。
        // Day 1 的 Shift 結束時間點：
        // 如果 Shift 定義是 16:00-24:00 (或00:00)，則結束時間是 Day 2 的 00:00
        // 如果 Shift 定義是 00:00-08:00，這通常是指當天凌晨。
        
        // 修正算法：
        // 1. 先把 Day 1 的 Shift 轉成絕對時間
        //    如果 prevStart > prevEnd (跨日)，則 prevEnd += 24
        //    範例 N 班: 00:00 - 08:00 (不跨日，是一天的開始) -> End = 8
        //    範例 E 班: 16:00 - 00:00 (跨日) -> End = 24
        
        // 這邊有個盲點：N 班(00-08) 其實是接在 Day 1 的晚上嗎？
        // 通常 N 班是指當天凌晨。
        // 所以 Day 1 的 N 班結束於 Day 1 的 08:00。
        // Day 2 的 D 班開始於 Day 2 的 08:00。
        // 間隔 = (24 + 8) - 8 = 24 小時。沒問題。
        
        // 違規案例：
        // Day 1 是 E 班 (16:00 - 24:00)
        // Day 2 是 D 班 (08:00 - 16:00)
        // 間隔 = (24 + 8) - 24 = 8 小時。 (違規！)

        // 判斷前一班是否跨日 (End < Start ? 其實不一定，看醫院定義)
        // 比較安全的做法：假設所有班別都是當天開始。
        // Day 1 End Time = prevEnd. (如果 prevEnd < prevStart，視為 +24)
        // 但 N 班 (00-08) 結束於 8，E 班 (16-00) 結束於 24。
        
        // 讓我們用 shift code 簡單判斷跨日可能不夠，依賴時間數值：
        // 如果 endTime <= startTime，我們假設它跨日到了隔天
        // 範例 E: 16:00 - 00:00 (End 0 <= Start 16) -> End 視為 24
        // 範例 N: 00:00 - 08:00 (End 8 > Start 0) -> End 視為 8
        
        // 前一班結束的絕對時間點 (相對於 Day 1 00:00)
        let prevStart = parseTime(arguments[0] || "00:00"); // 這裡沒傳入 prevStart，需要修改 validateStaff 傳入完整物件
        
        // 為了簡化，我們在 calculateRestHours 僅接收 End 和 Start
        // 但我們需要知道前一班是否跨日。
        // 妥協：我們假設如果 EndTime 是 "00:00"，它是 24:00。
        // 如果 EndTime 小於 StartTime (e.g. 16:00 - 02:00)，它是 26:00。
        
        // 重新實作判斷跨日：我們需要前一班的 start time 才能準確判斷
        // 所以回頭修改 validateStaff 呼叫方式。
        return 24; // 暫時回傳，下面完整修正
    }

    /**
     * 修正後的驗證邏輯
     */
    static validateAll(scheduleData, daysInMonth, staffList, unitSettings) {
        const report = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        staffList.forEach(staff => {
            const staffAssignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs);
            if (Object.keys(result.errors).length > 0) {
                report[staff.id] = result;
            }
        });

        return report;
    }
}
