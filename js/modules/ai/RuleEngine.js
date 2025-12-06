/**
 * 規則驗證引擎
 * 負責檢查排班表是否違反勞基法或醫院規則
 */
export class RuleEngine {

    /**
     * 驗證單一員工的整月班表
     * @param {Object} assignments 該員工的排班物件 { "1": "D", "2": "N" ... }
     * @param {number} daysInMonth 當月天數
     * @returns {Object} 錯誤報告 { days: { "5": "連七", "12": "N-D" } }
     */
    static validateStaff(assignments, daysInMonth) {
        const errors = {}; // 紀錄哪一天有錯，格式: { day: errorMsg }
        
        if (!assignments) return { errors };

        // 1. 轉換為陣列方便操作 (index 0 是空的，index 1 是 1號)
        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = assignments[d] || '';
        }

        // --- 規則 A: 檢查 N-D (夜班接白班) ---
        // 假設 N 是夜班, D 是白班 (需根據你的設定代號調整，這裡先寫死範例)
        // 定義危險組合: 前一天是 N，後一天是 D
        for (let d = 1; d < daysInMonth; d++) {
            const current = shiftArray[d];
            const next = shiftArray[d+1];

            if (current === 'N' && next === 'D') {
                errors[d+1] = "禁止 N 接 D"; 
            }
        }

        // --- 規則 B: 檢查連續工作天數 (連七) ---
        // 勞基法：不得連續工作超過 6 天 (也就是每 7 天至少要休 1 天)
        let consecutiveDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const shift = shiftArray[d];
            
            // 判斷是否為工作日 (非 OFF 且非空)
            if (shift && shift !== 'OFF') {
                consecutiveDays++;
            } else {
                consecutiveDays = 0; // 遇到休假重置
            }

            if (consecutiveDays > 6) {
                errors[d] = "連續工作超過 6 天";
            }
        }

        return { errors };
    }

    /**
     * 批次驗證所有員工
     */
    static validateAll(scheduleData, daysInMonth, staffList) {
        const report = {}; // { staffId: { errors: { day: msg } } }
        
        staffList.forEach(staff => {
            const staffAssignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            const result = this.validateStaff(staffAssignments, daysInMonth);
            if (Object.keys(result.errors).length > 0) {
                report[staff.id] = result;
            }
        });

        return report;
    }
}
