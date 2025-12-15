export class RuleEngine {

    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthLastShift = 'OFF', lastMonthConsecutive = 0, checkUpToDay = null) {
        const errors = {};
        const safeAssignments = assignments || {};
        
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const constraints = rules?.constraints || {};
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        
        const isProtected = !!staffConstraints?.isPregnant || !!staffConstraints?.isPostpartum;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const firstNRequiresOFF = constraints.firstNRequiresOFF !== false;
        const minInterval11h = constraints.minInterval11h !== false;

        const limitDay = checkUpToDay || daysInMonth;

        let consecutiveDays = lastMonthConsecutive;
        let consecutiveNights = (lastMonthLastShift === 'N') ? 1 : 0; 
        let prevShift = lastMonthLastShift;

        const shiftArray = [];
        shiftArray[0] = lastMonthLastShift;

        for (let d = 1; d <= limitDay; d++) {
            const currentCode = safeAssignments[d];
            const shift = currentCode || 'OFF';
            shiftArray[d] = shift;

            const isWorking = shift && shift !== 'OFF' && shift !== 'M_OFF';

            // ✅ 修正 3: 母性保護 (通用判斷: N/E/大/小)
            if (isProtected && (shift.includes('N') || shift.includes('E') || shift.includes('大') || shift.includes('小'))) {
                errors[d] = "懷孕/哺乳不可排夜班";
            }

            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            
            if (shift.includes('N')) consecutiveNights++; else consecutiveNights = 0;
            if (consecutiveNights > maxConsecutiveNights) errors[d] = `連夜${consecutiveNights} (上限${maxConsecutiveNights})`;

            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
            
            // ✅ 修正 3: 間隔不足 (簡易版: E接D 或 晚接早)
            if (minInterval11h && (prevShift.includes('E') || prevShift.includes('小')) && (shift.includes('D') || shift.includes('白'))) {
                errors[d] = "間隔不足11hr";
            }
            
            if (firstNRequiresOFF && shift.includes('N')) {
                if (prevIsWorking && !prevShift.includes('N')) {
                    errors[d] = "大夜前需OFF (或連N)";
                }
            }
            
            if (prevIsWorking && prevShift !== shift) {
                let count = 0;
                for(let back = d-1; back >= 0; back--) { 
                    if (shiftArray[back] === prevShift) count++; 
                    else break; 
                }
                if (count < minConsecutiveSame) {
                    const targetErrorDay = (d === 1) ? 1 : d - 1;
                    if (!errors[targetErrorDay]) {
                        errors[targetErrorDay] = `${prevShift}僅${count}天(需${minConsecutiveSame})`;
                    }
                }
            }
            prevShift = shift;
        }

        if (!checkUpToDay) {
            for (let d = 7; d <= daysInMonth; d++) {
                const types = new Set();
                for (let k = 0; k < 7; k++) {
                    const code = shiftArray[d-k];
                    if (code && code !== 'OFF' && code !== 'M_OFF') {
                        types.add(code);
                    }
                }
                if (types.size > 2) {
                    errors[d] = `7天內${types.size}種班(上限2種)`;
                }
            }
        }

        return { errors };
    }

    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {};
        const minStaffReq = unitSettings?.staffRequirements || {};
        const dailyCounts = {};

        // ✅ 修正 3: 動態取得所有班別代碼
        const shiftCodes = unitSettings?.settings?.shifts ? unitSettings.settings.shifts.map(s=>s.code) : ['D','E','N'];
        
        for(let d=1; d<=daysInMonth; d++) {
            dailyCounts[d] = {};
            shiftCodes.forEach(code => dailyCounts[d][code] = 0);
        }

        const allAssignments = scheduleData?.assignments || {};
        Object.values(allAssignments).forEach(staffShifts => {
            if (!staffShifts) return;
            for(let d=1; d<=daysInMonth; d++) {
                const shift = staffShifts[d];
                if (shift && dailyCounts[d][shift] !== undefined) {
                    dailyCounts[d][shift]++;
                }
            }
        });

        const year = scheduleData?.year || new Date().getFullYear();
        const month = scheduleData?.month || new Date().getMonth() + 1;

        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const weekDay = date.getDay();
            const issues = [];
            
            shiftCodes.forEach(code => {
                const required = minStaffReq[code]?.[weekDay] || 0;
                const actual = dailyCounts[d][code] || 0;
                if (required > 0 && actual < required) {
                    issues.push(`${code}缺${required - actual}`);
                }
            });
            
            if (issues.length > 0) {
                coverageErrors[d] = issues;
            }
        }
        return { coverageErrors, dailyCounts };
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const uid = staff.uid;
                if (!uid) return;

                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[uid] : {};
                const result = this.validateStaff(
                    staffAssignments, 
                    daysInMonth, 
                    shiftDefs, 
                    rules, 
                    staff.constraints
                );
                
                if (Object.keys(result.errors).length > 0) {
                    staffReport[uid] = result;
                }
            });
        }

        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);

        return { staffReport, coverageErrors };
    }
}
