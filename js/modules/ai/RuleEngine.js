export class RuleEngine {

    // (validateStaff, validateDailyCoverage 方法保持原樣)
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}) {
        // ... (內容與之前相同，這裡省略重複代碼，重點在 validateAll)
        // (請保留您原有的 validateStaff 完整邏輯)
        const errors = {}; 
        const safeAssignments = assignments || {};
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const constraints = rules?.constraints || {};
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        const isPregnant = !!staffConstraints?.isPregnant;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const maxTypesPerWeek = constraints.maxShiftTypesWeek || 3;
        const firstNRequiresOFF = constraints.firstNRequiresOFF !== false;
        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) { shiftArray[d] = safeAssignments[d] || ''; }
        let consecutiveDays = 0;
        let consecutiveNights = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const isWorking = currentCode && currentCode !== 'OFF' && currentCode !== 'M_OFF';
            if (isPregnant && (currentCode === 'N' || currentCode === 'E')) { errors[d] = "懷孕不可排夜班"; }
            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) { errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`; }
            if (currentCode === 'N') consecutiveNights++; else consecutiveNights = 0;
            if (consecutiveNights > maxConsecutiveNights) { errors[d] = `連大夜${consecutiveNights} (上限${maxConsecutiveNights})`; }
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                const prevIsWorking = prevCode && prevCode !== 'OFF' && prevCode !== 'M_OFF';
                if (prevCode === 'E' && currentCode === 'D') { errors[d] = "間隔不足11hr (E接D)"; }
                if (firstNRequiresOFF && currentCode === 'N') { if (prevIsWorking && prevCode !== 'N') { errors[d] = "大夜前需OFF (或連N)"; } }
                if (prevIsWorking && prevCode !== currentCode) {
                    let count = 0;
                    for(let back = d-1; back >= 1; back--) { if (shiftArray[back] === prevCode) count++; else break; }
                    if (count < minConsecutiveSame) { if (!errors[d-1]) errors[d-1] = `${prevCode}僅${count}天(需${minConsecutiveSame})`; }
                }
            }
        }
        for (let d = 7; d <= daysInMonth; d++) {
            const types = new Set();
            for (let k = 0; k < 7; k++) { const code = shiftArray[d-k]; if (code && code !== 'OFF' && code !== 'M_OFF') { types.add(code); } }
            if (types.size > maxTypesPerWeek) { errors[d] = `7天內${types.size}種班(上限${maxTypesPerWeek})`; }
        }
        return { errors };
    }

    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        // ... (保持原樣，省略重複)
        const coverageErrors = {}; const minStaffReq = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} }; const dailyCounts = {}; for(let d=1; d<=daysInMonth; d++) dailyCounts[d] = { D:0, E:0, N:0 }; const allAssignments = scheduleData?.assignments || {}; Object.values(allAssignments).forEach(staffShifts => { if (!staffShifts) return; for(let d=1; d<=daysInMonth; d++) { const shift = staffShifts[d]; if (shift && dailyCounts[d][shift] !== undefined) { dailyCounts[d][shift]++; } } }); const year = scheduleData?.year || new Date().getFullYear(); const month = scheduleData?.month || new Date().getMonth() + 1; for(let d=1; d<=daysInMonth; d++) { const date = new Date(year, month - 1, d); const weekDay = date.getDay(); const minD = minStaffReq.D?.[weekDay] || 0; const minE = minStaffReq.E?.[weekDay] || 0; const minN = minStaffReq.N?.[weekDay] || 0; const issues = []; if (minD > 0 && dailyCounts[d].D < minD) issues.push(`白缺${minD - dailyCounts[d].D}`); if (minE > 0 && dailyCounts[d].E < minE) issues.push(`小缺${minE - dailyCounts[d].E}`); if (minN > 0 && dailyCounts[d].N < minN) issues.push(`大缺${minN - dailyCounts[d].N}`); if (issues.length > 0) { coverageErrors[d] = issues; } } return { coverageErrors, dailyCounts };
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                // ✅ 嚴格使用 uid
                const uid = staff.uid; 
                if (!uid) return; // 沒 uid 直接忽略

                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[uid] : {};
                const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs, rules, staff.constraints);
                if (Object.keys(result.errors).length > 0) {
                    staffReport[uid] = result;
                }
            });
        }

        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);

        return { staffReport, coverageErrors };
    }
}
