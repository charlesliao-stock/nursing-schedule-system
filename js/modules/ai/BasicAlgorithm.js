/**
 * 基礎排班演算法模組
 * 負責處理簡單的填充邏輯與規則檢查
 */
export class BasicAlgorithm {

    /**
     * 演算法：將所有空白格子填入 OFF
     * @param {Object} scheduleData 目前的排班資料物件
     * @param {number} daysInMonth 當月天數
     * @param {Array} staffList 員工列表
     * @returns {Object} 更新後的 assignments (Map)
     */
    static fillEmptyWithOff(scheduleData, daysInMonth, staffList) {
        // 深拷貝 assignments 以免直接修改原始物件造成副作用
        const newAssignments = JSON.parse(JSON.stringify(scheduleData.assignments || {}));
        let changeCount = 0;

        staffList.forEach(staff => {
            const staffId = staff.id;
            if (!newAssignments[staffId]) {
                newAssignments[staffId] = {};
            }

            for (let d = 1; d <= daysInMonth; d++) {
                // 如果該格是 undefined, null 或空字串，就填入 OFF
                if (!newAssignments[staffId][d]) {
                    newAssignments[staffId][d] = 'OFF';
                    changeCount++;
                }
            }
        });

        return { 
            updatedAssignments: newAssignments, 
            count: changeCount 
        };
    }

    /**
     * 演算法：清除所有班別 (重置)
     */
    static clearAll(scheduleData, daysInMonth, staffList) {
        const newAssignments = {};
        staffList.forEach(staff => {
            newAssignments[staff.id] = {}; // 全部清空
        });
        return newAssignments;
    }
}
