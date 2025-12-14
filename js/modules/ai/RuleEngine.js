export class RuleEngine {

    /**
     * 驗證單一人員的整月班表
     * @param {Object} assignments 該人員當月班表 {1:'D', 2:'N', ...}
     * @param {number} daysInMonth 當月天數
     * @param {Array} shiftDefs 班別定義
     * @param {Object} rules 單位規則設定 (UnitSettings.rules)
     * @param {Object} staffConstraints 人員個別限制 (Staff.constraints)
     * @param {string} lastMonthShift 上個月最後一天的班別 (用於跨月檢查)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthShift = 'OFF') {
        const errors = {}; 
        const safeAssignments = assignments || {};
        
        // 1. 讀取限制參數
        const constraints = rules?.constraints || {};
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        
        const isPregnant = !!staffConstraints?.isPregnant;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const maxTypesPerWeek = constraints.maxShiftTypesWeek || 3;
        const firstNRequiresOFF = constraints.firstNRequiresOFF !== false;

        // 2. 建構完整的班別陣列 (包含 Day 0)
        const shiftArray = [];
        shiftArray[0] = lastMonthShift; 
        for (let d = 1; d <= daysInMonth; d++) { 
            shiftArray[d] = safeAssignments[d] || ''; 
        }

        let consecutiveDays = 0;
        let consecutiveNights = 0;

        // 3. 逐日檢查
        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const prevCode = shiftArray[d-1];
            
            const isWorking = currentCode && currentCode !== 'OFF' && currentCode !== 'M_OFF';
            const prevIsWorking = prevCode && prevCode !== 'OFF' && prevCode !== 'M_OFF';

            // A. 懷孕保護
            if (isPregnant && (currentCode === 'N' || currentCode === 'E')) { 
                errors[d] = "懷孕不可排夜班(E/N)"; 
            }

            // B. 連續工作天數
            if (isWorking) consecutiveDays++; 
            else consecutiveDays = 0;

            if (consecutiveDays > maxConsecutive) { 
                errors[d] = `連上${consecutiveDays}天 (上限${maxConsecutive})`; 
            }

            // C. 連續夜班天數
            if (currentCode === 'N') consecutiveNights++; 
            else consecutiveNights = 0;

            if (consecutiveNights > maxConsecutiveNights) { 
                errors[d] = `連大夜${consecutiveNights}天 (上限${maxConsecutiveNights})`; 
            }

            // D. 班別銜接邏輯 (需參考前一天)
            // 1. 間隔 11 小時 (E 不接 D, D 不接 N - 視定義而定，通常 E-D 最嚴重)
            if (constraints.minInterval11h !== false) {
                if (prevCode === 'E' && currentCode === 'D') { errors[d] = "間隔不足11hr (E接D)"; }
            }

            // 2. 大夜前一日需 OFF
            if (firstNRequiresOFF && currentCode === 'N') { 
                // 如果前一天有上班，且不是 N (連 N 允許)，則報錯
                if (prevIsWorking && prevCode !== 'N') { 
                    errors[d] = "大夜前需OFF (或連N)"; 
                } 
            }

            // 3. 同種班別連續下限 (避免花班，如 D-N-D)
            // 當班別發生「切換」且前一天是上班日，檢查前一種班別長度
            if (prevIsWorking && prevCode !== currentCode) {
                let count = 0;
                // 往回追朔 prevCode 連續了幾天
                for(let back = d-1; back >= 0; back--) { // 注意：允許追朔到 Day 0
                    if (shiftArray[back] === prevCode) count++; 
                    else break; 
                }
                // 如果 Day 0 就是邊界，可能導致誤判，這裡主要檢查當月內的 "斷點"
                // 只有當斷點發生在 d-1 (也就是 d-1 是該段落最後一天) 時才報錯
                if (count < minConsecutiveSame) { 
                    if (!errors[d-1]) errors[d-1] = `${prevCode}僅${count}天(需連${minConsecutiveSame})`; 
                }
            }
        }

        // 4. 週班別種類上限 (滑動視窗)
        for (let d = 7; d <= daysInMonth; d++) {
            const types = new Set();
            for (let k = 0; k < 7; k++) { 
                const code = shiftArray[d-k]; 
                if (code && code !== 'OFF' && code !== 'M_OFF') { types.add(code); } 
            }
            if (types.size > maxTypesPerWeek) { 
                errors[d] = `7天內${types.size}種班別(上限${maxTypesPerWeek})`; 
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
        
        // 統計
        Object.values(allAssignments).forEach(staffShifts => { 
            if (!staffShifts) return; 
            for(let d=1; d<=daysInMonth; d++) { 
                const shift = staffShifts[d]; 
                if (shift && dailyCounts[d][shift] !== undefined) { 
                    dailyCounts[d][shift]++; 
                } 
            } 
        }); 

        // 比對需求
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
            
            if (issues.length > 0) { coverageErrors[d] = issues; } 
        } 
        return { coverageErrors, dailyCounts };
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        // 取得上個月的歷史紀錄 (如果有的話，通常在 scheduleData 外部傳入，這裡假設若無則為 OFF)
        // 在 SchedulePage 中呼叫此函數時，建議優化介面傳入 lastMonthShifts
        
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const uid = staff.uid; 
                if (!uid) return; 

                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[uid] : {};
                
                // 嘗試從 assignment[0] 獲取上月資料，若無則預設 OFF
                const lastMonth = staffAssignments[0] || 'OFF';

                const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs, rules, staff.constraints, lastMonth);
                if (Object.keys(result.errors).length > 0) {
                    staffReport[uid] = result;
                }
            });
        }

        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);

        return { staffReport, coverageErrors };
    }
}
