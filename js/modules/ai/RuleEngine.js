export class RuleEngine {

    /**
     * 驗證單一員工 (v2.0 效能優化版 + 跨月支援)
     * @param {Object} assignments 本月班表 {1:'D', 2:'OFF'...}
     * @param {number} daysInMonth 當月天數
     * @param {Array} shiftDefs 班別定義
     * @param {Object} rules 規則設定
     * @param {Object} staffConstraints 個人限制
     * @param {string} lastMonthLastShift 上個月最後一天的班別 (New)
     * @param {number} lastMonthConsecutive 上個月底已連續上班天數 (New)
     * @param {number} checkUpToDay (效能優化) 只檢查到第幾天，預設檢查全月
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthLastShift = 'OFF', lastMonthConsecutive = 0, checkUpToDay = null) {
        const errors = {};
        const safeAssignments = assignments || {};
        
        // 1. 參數讀取
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const constraints = rules?.constraints || {};
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        
        // 設定夜班連續上限 (取單位與個人設定之最小值)
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        
        const isPregnant = !!staffConstraints?.isPregnant;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const maxTypesPerWeek = constraints.maxShiftTypesWeek || 3;
        const firstNRequiresOFF = constraints.firstNRequiresOFF !== false;

        // ✅ 優化 1: 設定檢查終點
        const limitDay = checkUpToDay || daysInMonth;

        // ✅ 優化 2: 初始化狀態承接上個月
        let consecutiveDays = lastMonthConsecutive;
        let consecutiveNights = (lastMonthLastShift === 'N') ? 1 : 0; 
        let prevShift = lastMonthLastShift;

        // 建立陣列以利週檢查 (包含上個月最後一天作為 index 0)
        const shiftArray = [];
        shiftArray[0] = lastMonthLastShift;

        for (let d = 1; d <= limitDay; d++) {
            const currentCode = safeAssignments[d];

            // AI 跑到一半時，若後面還沒排，且指定了 limitDay，則視為處理完畢
            // 若沒指定 limitDay (全月檢查模式)，則空值視為 OFF
            const shift = currentCode || 'OFF';
            shiftArray[d] = shift;

            const isWorking = shift && shift !== 'OFF' && shift !== 'M_OFF';

            // --- A. 懷孕保護 ---
            if (isPregnant && (shift === 'N' || shift === 'E')) {
                errors[d] = "懷孕不可排夜班";
            }

            // --- B. 連續上班檢查 (七休一核心) ---
            if (isWorking) {
                consecutiveDays++;
            } else {
                consecutiveDays = 0;
            }

            if (consecutiveDays > maxConsecutive) {
                errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            }

            // --- C. 連續夜班檢查 ---
            if (shift === 'N') consecutiveNights++;
            else consecutiveNights = 0;

            if (consecutiveNights > maxConsecutiveNights) {
                errors[d] = `連大夜${consecutiveNights} (上限${maxConsecutiveNights})`;
            }

            // --- D. 間隔與邏輯檢查 ---
            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';

            // D-1. 間隔不足 11 小時 (E 接 D)
            if (prevShift === 'E' && shift === 'D') {
                errors[d] = "間隔不足11hr (E接D)";
            }

            // D-2. 大夜前需 OFF (N 前需 OFF 或 N)
            if (firstNRequiresOFF && shift === 'N') {
                if (prevIsWorking && prevShift !== 'N') {
                    errors[d] = "大夜前需OFF (或連N)";
                }
            }

            // D-3. 同班別最少連續天數 (往前追溯)
            if (prevIsWorking && prevShift !== shift) {
                let count = 0;
                // 往回追溯 (包含跨月 index 0)
                for(let back = d-1; back >= 0; back--) {
                    if (shiftArray[back] === prevShift) count++;
                    else break;
                }
                
                // 只有當 "前一天" 是工作日，且連續次數不足時才報錯
                // 注意：若 d=1 且 count < min，會標記在 d=0 (即上個月)，這裡我們標記在 d=1 的錯誤訊息裡提示
                if (count < minConsecutiveSame) {
                    // 如果是第一天換班，錯誤標記在當天；否則標記在前一天
                    const targetErrorDay = (d === 1) ? 1 : d - 1;
                    if (!errors[targetErrorDay]) {
                        errors[targetErrorDay] = `${prevShift}僅${count}天(需${minConsecutiveSame})`;
                    }
                }
            }

            prevShift = shift;
        }

        // --- E. 變形工時：一週內班別種類 ---
        // 效能考量：若為 AI 快速運算模式 (checkUpToDay 有值)，則略過此複雜檢查
        // 僅在全月驗證時執行
        if (!checkUpToDay) {
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
        
        // 這裡無法得知上個月的狀態，只能假設為 0
        // 若要更精確，需從外部傳入 preScheduleData 的 history
        
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const uid = staff.uid;
                if (!uid) return;

                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[uid] : {};
                
                // 全月驗證時，暫時不傳入上月資訊 (或由外部補充)
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
