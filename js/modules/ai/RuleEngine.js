export class RuleEngine {

    static validateStaff(assignments, daysInMonth, shiftDefs) {
        const errors = {}; 
        if (!assignments || !shiftDefs) return { errors };

        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);

        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = assignments[d] || '';
        }

        let consecutiveDays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const currentShift = shiftMap[currentCode];

            // 1. 連七檢查
            if (currentCode && currentCode !== 'OFF') {
                consecutiveDays++;
            } else {
                consecutiveDays = 0;
            }

            if (consecutiveDays > 6) {
                errors[d] = "連七違規";
            }

            // 2. 11小時檢查
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                const prevShift = shiftMap[prevCode];

                if (prevShift && currentShift && prevCode !== 'OFF' && currentCode !== 'OFF') {
                    if (prevShift.startTime && prevShift.endTime && currentShift.startTime) {
                        
                        const parse = (t) => {
                            const [h, m] = t.split(':').map(Number);
                            return h + m / 60;
                        };

                        const pStart = parse(prevShift.startTime);
                        let pEnd = parse(prevShift.endTime);
                        const cStart = parse(currentShift.startTime);

                        // 處理前一班跨日 (例如 16:00 - 00:00, 00:00 視為 24)
                        // 或 20:00 - 04:00 (04:00 視為 28)
                        if (pEnd <= pStart) {
                            pEnd += 24;
                        }

                        // 計算間隔
                        // Day 2 的開始時間是 (24 + cStart)
                        // 間隔 = (24 + cStart) - pEnd
                        const rest = (24 + cStart) - pEnd;

                        if (rest < 11) {
                            errors[d] = `間隔 ${rest.toFixed(1)}hr (需>11)`;
                        }
                    }
                }
            }
        }

        return { errors };
    }

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
