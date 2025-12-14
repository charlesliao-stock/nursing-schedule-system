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
        
        // ✅ 修正：母性保護包含懷孕與產後哺乳 (檢查 isPostpartum)
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

            // --- A. 母性保護 (硬性) ---
            // 勞基法：懷孕與哺乳期間不得於 22:00-06:00 工作
            if (isProtected && (shift === 'N' || shift === 'E')) {
                errors[d] = "懷孕/哺乳不可排 22點後班別";
            }

            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            
            if (shift === 'N') consecutiveNights++; else consecutiveNights = 0;
            if (consecutiveNights > maxConsecutiveNights) errors[d] = `連大夜${consecutiveNights} (上限${maxConsecutiveNights})`;

            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
            
            if (minInterval11h && prevShift === 'E' && shift === 'D') {
                errors[d] = "間隔不足11hr (E接D)";
            }
            
            if (firstNRequiresOFF && shift === 'N') {
                if (prevIsWorking && prevShift !== 'N') {
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

        // --- E. 一週內班別種類 (硬性限制：最多 2 種) ---
        // 強制檢查 7 天滑動區間
        if (!checkUpToDay) {
            for (let d = 7; d <= daysInMonth; d++) {
                const types = new Set();
                for (let k = 0; k < 7; k++) {
                    const code = shiftArray[d-k];
                    if (code && code !== 'OFF' && code !== 'M_OFF') {
                        types.add(code);
                    }
                }
                // ✅ 強制鎖定上限為 2 種
                if (types.size > 2) {
                    errors[d] = `7天內${types.size}種班(上限2種)`;
                }
            }
        }

        return { errors };
    }

    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {};
        const minStaffReq = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        const dailyCounts = {};

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
