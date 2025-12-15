export class RuleEngine {

    /**
     * 驗證單一員工 (v2.3: System Settings & Interval Calc)
     * @param {Object} systemSettings { weekStartDay: 0|1, firstShift: 'D'|'N' }
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthLastShift = 'OFF', lastMonthConsecutive = 0, checkUpToDay = null, year = null, month = null, systemSettings = {}) {
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

        const currentYear = year || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;
        // 讀取週起始日，預設為 1 (星期一)
        const weekStartDay = (systemSettings.weekStartDay !== undefined) ? systemSettings.weekStartDay : 1;

        const limitDay = checkUpToDay || daysInMonth;

        let consecutiveDays = lastMonthConsecutive;
        let consecutiveNights = (lastMonthLastShift === 'N') ? 1 : 0; 
        let prevShift = lastMonthLastShift;

        const shiftArray = [];
        shiftArray[0] = lastMonthLastShift;

        let currentWeekTypes = new Set();
        
        for (let d = 1; d <= limitDay; d++) {
            const currentCode = safeAssignments[d];
            const shift = currentCode || 'OFF';
            shiftArray[d] = shift;

            const isWorking = shift && shift !== 'OFF' && shift !== 'M_OFF';

            // --- 0. 週重置檢查 (依照系統設定) ---
            const date = new Date(currentYear, currentMonth - 1, d);
            const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
            
            // 若今日為設定的週起始日，重置
            if (dayOfWeek === weekStartDay) {
                currentWeekTypes.clear();
            }
            
            if (isWorking) {
                currentWeekTypes.add(shift);
            }

            if (currentWeekTypes.size > 2) {
                errors[d] = `本週(${this.getWeekRangeString(date, weekStartDay)})超過2種班`;
            }

            // --- A. 母性保護 ---
            if (isProtected && (shift.includes('N') || shift.includes('E') || shift.includes('大') || shift.includes('小'))) {
                errors[d] = "懷孕/哺乳不可排夜班";
            }

            // --- B. 連續上班 ---
            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            
            if (shift.includes('N')) consecutiveNights++; else consecutiveNights = 0;
            if (consecutiveNights > maxConsecutiveNights) errors[d] = `連夜${consecutiveNights} (上限${maxConsecutiveNights})`;

            // --- D. 間隔與邏輯 ---
            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
            
            // ✅ 修正：依實際時間計算間隔 (Interval Check)
            if (minInterval11h && prevIsWorking && isWorking) {
                const prevDef = shiftDefs.find(s => s.code === prevShift);
                const currDef = shiftDefs.find(s => s.code === shift);
                
                if (prevDef && currDef) {
                    // 計算前一班結束時間 (分鐘)
                    // 假設前一天是 D-1，今天是 D
                    // 時間格式 "HH:mm"
                    const getMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                    
                    let prevEndMins = getMins(prevDef.endTime);
                    let currStartMins = getMins(currDef.startTime);
                    
                    // 特殊處理：如果結束時間是 00:00，視為 24:00 (1440)
                    if (prevEndMins === 0) prevEndMins = 1440;
                    
                    // 若前一班是跨夜班 (例如 N: 00-08 或 E: 16-24)，結束時間在 D-1 的深夜
                    // 這裡的邏輯：
                    // Gap = (24 * 60 - prevEndMins) + currStartMins
                    // 例如 E(16-24): (1440 - 1440) + D(08:00=480) = 480 mins = 8 hrs < 11 hrs -> Violation
                    
                    const gapMins = (1440 - prevEndMins) + currStartMins;
                    
                    if (gapMins < 660) { // 11 * 60 = 660
                        errors[d] = `間隔不足11hr (${Math.floor(gapMins/60)}h${gapMins%60}m)`;
                    }
                }
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

    static getWeekRangeString(date, startDay) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day < startDay ? 7 : 0) + day - startDay;
        d.setDate(d.getDate() - diff);
        return `週${d.getMonth()+1}/${d.getDate()}起`;
    }

    // ... (validateDailyCoverage & validateAll 保持不變，但記得 validateAll 要傳入 systemSettings)
    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) { 
        // (省略，同前版)
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

    // ✅ 修正：validateAll 接收 systemSettings
    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules, systemSettings = {}) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        const year = scheduleData?.year;
        const month = scheduleData?.month;
        
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
                    staff.constraints,
                    'OFF', 0, null, 
                    year, month,
                    systemSettings // 傳入
                );
                if (Object.keys(result.errors).length > 0) staffReport[uid] = result;
            });
        }
        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);
        return { staffReport, coverageErrors };
    }
}
