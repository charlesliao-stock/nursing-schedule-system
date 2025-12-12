// js/modules/ai/RuleEngine.js

export class RuleEngine {

    /**
     * 驗證單一人員的排班規則
     * @param {Object} assignments 該員當月班表 {1: 'D', 2: 'N', ...}
     * @param {number} daysInMonth 當月天數
     * @param {Array} shiftDefs 班別定義 (Array of Objects)
     * @param {Object} rules 單位規則 (maxConsecutive, weights, etc.)
     * @param {Object} staffConstraints 人員個別限制 (isPregnant, maxConsecutiveNights...)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}) {
        const errors = {}; 
        const safeAssignments = assignments || {};

        // 1. 取得全域與個別規則參數
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const constraints = rules?.constraints || {};
        
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        
        const isPregnant = !!staffConstraints?.isPregnant;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const maxTypesPerWeek = constraints.maxShiftTypesWeek || 3;
        
        // 建立班別陣列
        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = safeAssignments[d] || '';
        }

        let consecutiveDays = 0;
        let consecutiveNights = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const isWorking = currentCode && currentCode !== 'OFF' && currentCode !== 'M_OFF';
            // 大夜定義為 N
            
            // --- 1. 懷孕條款 ---
            if (isPregnant && (currentCode === 'N' || currentCode === 'E')) {
                errors[d] = "懷孕不可排夜班";
            }

            // --- 2. 連續上班天數 ---
            if (isWorking) consecutiveDays++;
            else consecutiveDays = 0;

            if (consecutiveDays > maxConsecutive) {
                errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            }

            // --- 3. 連續大夜天數 ---
            if (currentCode === 'N') consecutiveNights++;
            else consecutiveNights = 0;

            if (consecutiveNights > maxConsecutiveNights) {
                errors[d] = `連大夜${consecutiveNights} (上限${maxConsecutiveNights})`;
            }

            // --- 4. 班別銜接邏輯 (勞基法 11 小時 & 排班順序) ---
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                const prevIsWorking = prevCode && prevCode !== 'OFF' && prevCode !== 'M_OFF';

                // A. 勞基法 11 小時檢查
                // E (16-24) -> D (08-16): 間隔 8 小時 -> 禁止
                if (prevCode === 'E' && currentCode === 'D') {
                    errors[d] = "間隔不足11hr (E接D)";
                }
                
                // N (00-08) -> D (次日08-16): 間隔 24 小時 -> OK (依需求開放)
                // N (00-08) -> E (次日16-24): 間隔 32 小時 -> OK (依需求開放)

                // B. 大夜前一日限制 (Rule: 前一天必須是 N 或 OFF)
                // 這條規則同時擋掉了 D->N (間隔8hr) 與 E->N (間隔0hr)
                if (currentCode === 'N') {
                    // 若前一天有上班，且不是 N (即前一天是 D 或 E) -> 禁止
                    if (prevIsWorking && prevCode !== 'N') {
                        errors[d] = "大夜前需OFF (或連N)";
                    }
                }

                // C. 同種班最少連續 days (避免花花班)
                // 當班別改變時 (例如 D D -> E)，檢查前面的 D 是否足夠
                if (prevIsWorking && prevCode !== currentCode) {
                    let count = 0;
                    for(let back = d-1; back >= 1; back--) {
                        if (shiftArray[back] === prevCode) count++;
                        else break;
                    }
                    if (count < minConsecutiveSame) {
                        if (!errors[d-1]) errors[d-1] = `${prevCode}僅${count}天(需${minConsecutiveSame})`;
                    }
                }
            }
        }

        // --- 5. 一週班別種類 (Rolling 7 Days) ---
        for (let d = 7; d <= daysInMonth; d++) {
            const types = new Set();
            for (let k = 0; k < 7; k++) {
                const code = shiftArray[d-k];
                if (code && code !== 'OFF' && code !== 'M_OFF') {
                    types.add(code);
                }
            }
            if (types.size > maxTypesPerWeek) {
                errors[d] = `7天內${types.size}種班(上限${maxTypesPerWeek})`;
            }
        }

        return { errors };
    }

    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {}; 
        const minStaffReq = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        const dailyCounts = {}; 
        for(let d=1; d<=daysInMonth; d++) dailyCounts[d] = { D:0, E:0, N:0 };

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

            const minD = minStaffReq.D?.[weekDay] || 0;
            const minE = minStaffReq.E?.[weekDay] || 0;
            const minN = minStaffReq.N?.[weekDay] || 0;

            const issues = [];
            if (minD > 0 && dailyCounts[d].D < minD) issues.push(`白缺${minD - dailyCounts[d].D}`);
            if (minE > 0 && dailyCounts[d].E < minE) issues.push(`小缺${minE - dailyCounts[d].E}`);
            if (minN > 0 && dailyCounts[d].N < minN) issues.push(`大缺${minN - dailyCounts[d].N}`);
            
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
                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[staff.uid || staff.id] : {};
                const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs, rules, staff.constraints);
                if (Object.keys(result.errors).length > 0) {
                    staffReport[staff.uid || staff.id] = result;
                }
            });
        }

        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);

        return { staffReport, coverageErrors };
    }
}
