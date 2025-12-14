export class StatisticsService {
    
    /**
     * 計算個人統計 (依月份)
     */
    static calculatePersonal(scheduleData, staffId) {
        if (!scheduleData || !scheduleData.assignments || !scheduleData.assignments[staffId]) {
            return null;
        }

        const shifts = scheduleData.assignments[staffId];
        const stats = {
            totalShifts: 0,
            D: 0, E: 0, N: 0, OFF: 0,
            holidayShifts: 0
        };

        const year = scheduleData.year;
        const month = scheduleData.month;

        Object.entries(shifts).forEach(([day, shift]) => {
            if (!shift) return;
            stats.totalShifts++;
            if (stats[shift] !== undefined) stats[shift]++;
            else if (shift === 'OFF') stats.OFF++;
            
            // 判斷假日上班 (簡單判斷週末)
            const date = new Date(year, month - 1, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if (isWeekend && shift !== 'OFF') {
                stats.holidayShifts++;
            }
        });

        return stats;
    }

    /**
     * 計算單位統計 (每日人力覆蓋率)
     */
    static calculateUnitCoverage(scheduleData) {
        if (!scheduleData || !scheduleData.assignments) return {};

        const daysInMonth = new Date(scheduleData.year, scheduleData.month, 0).getDate();
        const dailyStats = {};

        for (let d = 1; d <= daysInMonth; d++) {
            dailyStats[d] = { D: 0, E: 0, N: 0, OFF: 0, Total: 0 };
        }

        Object.values(scheduleData.assignments).forEach(staffShifts => {
            Object.entries(staffShifts).forEach(([day, shift]) => {
                if (dailyStats[day] && shift) {
                    if (dailyStats[day][shift] !== undefined) dailyStats[day][shift]++;
                    else if (shift === 'OFF') dailyStats[day]['OFF']++;
                    if (shift !== 'OFF') dailyStats[day]['Total']++;
                }
            });
        });

        return dailyStats;
    }
}
