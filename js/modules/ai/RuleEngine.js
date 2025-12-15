export class RuleEngine {

    /**
     * 驗證單一員工 (v2.2 Final: Calendar Week Logic)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthLastShift = 'OFF', lastMonthConsecutive = 0, checkUpToDay = null, year = null, month = null) {
        const errors = {};
        const safeAssignments = assignments || {};
        
        // 1. 參數讀取
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

        // 若無傳入年份月份，預設為當前 (避免舊代碼報錯，但計算星期會不準)
        const currentYear = year || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;

        const limitDay = checkUpToDay || daysInMonth;

        let consecutiveDays = lastMonthConsecutive;
        let consecutiveNights = (lastMonthLastShift === 'N') ? 1 : 0; 
        let prevShift = lastMonthLastShift;

        const shiftArray = [];
        shiftArray[0] = lastMonthLastShift;

        // 變形工時：週班別種類 (Calendar Week: Mon-Sun)
        // 需維護當前週的班別集合
        let currentWeekTypes = new Set();
        
        for (let d = 1; d <= limitDay; d++) {
            const currentCode = safeAssignments[d];
            const shift = currentCode || 'OFF';
            shiftArray[d] = shift;

            const isWorking = shift && shift !== 'OFF' && shift !== 'M_OFF';

            // --- 0. 週一重置檢查 (Calendar Week Logic) ---
            const date = new Date(currentYear, currentMonth - 1, d);
            const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
            
            // 如果是星期一，重置班別種類計數
            if (dayOfWeek === 1) {
                currentWeekTypes.clear();
            }
            
            // 加入今日班別 (若非休假)
            if (isWorking) {
                currentWeekTypes.add(shift);
            }

            // 檢查本週是否已超過 2 種 (硬性規定)
            // 注意：這裡是即時檢查。如果週一排A，週二排B，週三排C -> 週三報錯
            if (currentWeekTypes.size > 2) {
                errors[d] = `本週(${this.getWeekRangeString(date)})超過2種班`;
            }

            // --- A. 母性保護 ---
            if (isProtected && (shift.includes('N') || shift.includes('E') || shift.includes('大') || shift.includes('小'))) {
                errors[d] = "懷孕/哺乳不可排夜班";
            }

            // --- B. 連續上班 ---
            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            
            // --- C. 連續夜班 ---
            if (shift.includes('N')) consecutiveNights++; else consecutiveNights = 0;
            if (consecutiveNights > maxConsecutiveNights) errors[d] = `連夜${consecutiveNights} (上限${maxConsecutiveNights})`;

            // --- D. 間隔與邏輯 ---
            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
            
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

        return { errors };
    }

    // 輔助顯示週區間字串
    static getWeekRangeString(date) {
        const day = date.getDay() || 7; // Get current day number, converting Sun. to 7
        if (day !== 1) date.setHours(-24 * (day - 1)); // Set to Monday
        const start = `${date.getMonth()+1}/${date.getDate()}`;
        return `週${start}起`;
    }

    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {};
        const minStaffReq = unitSettings?.staffRequirements || {};
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
                if (shift && dailyCounts[d][shift] !== undefined) dailyCounts[d][shift]++;
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
                if (required > 0 && actual < required) issues.push(`${code}缺${required - actual}`);
            });
            if (issues.length > 0) coverageErrors[d] = issues;
        }
        return { coverageErrors, dailyCounts };
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        const year = scheduleData?.year;
        const month = scheduleData?.month;
        
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const uid = staff.uid;
                if (!uid) return;
                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[uid] : {};
                // ✅ 傳入 year, month
                const result = this.validateStaff(
                    staffAssignments, 
                    daysInMonth, 
                    shiftDefs, 
                    rules, 
                    staff.constraints,
                    'OFF', 0, null, 
                    year, month
                );
                if (Object.keys(result.errors).length > 0) staffReport[uid] = result;
            });
        }
        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);
        return { staffReport, coverageErrors };
    }
}
