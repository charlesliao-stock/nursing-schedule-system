export class RuleEngine {

    /**
     * 驗證單一員工 (符合規格書 4. 硬限制驗證器)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}, lastMonthLastShift = 'OFF', lastMonthConsecutive = 0, checkUpToDay = null, year = null, month = null, systemSettings = {}) {
        const errors = {};
        const safeAssignments = assignments || {};
        const limitDay = checkUpToDay || daysInMonth;

        // 參數設定 (從規格書或 UI 讀取)
        const maxConsecutive = staffConstraints.maxConsecutive || rules.maxConsecutiveWork || 6;
        const isProtected = !!staffConstraints.isPregnant || !!staffConstraints.isPostpartum;
        
        // 狀態追蹤
        let consecutiveDays = lastMonthConsecutive;
        let prevShift = lastMonthLastShift;
        let shiftArray = [lastMonthLastShift]; // index 0 is prev month last day

        for (let d = 1; d <= limitDay; d++) {
            const shift = safeAssignments[d] || 'OFF';
            shiftArray[d] = shift;
            const isWorking = shift !== 'OFF' && shift !== 'M_OFF';
            const prevIsWorking = prevShift !== 'OFF' && prevShift !== 'M_OFF';

            // --- 規格書 4. 硬限制驗證 ---

            // 1. 禁止逆向排班 (Spec 4. 禁止逆向)
            // 定義：禁「小夜接白」、「小夜接大夜」、「白班接大夜」
            // 假設代碼：D(白), E(小), N(大)
            if (prevIsWorking && isWorking) {
                if (prevShift === 'E' && shift === 'D') errors[d] = "禁止逆向(小接白)";
                if (prevShift === 'E' && shift === 'N') errors[d] = "禁止逆向(小接大)";
                if (prevShift === 'D' && shift === 'N') errors[d] = "禁止逆向(白接大)";
            }

            // 2. 大夜銜接規則 (Spec 4. 大夜銜接規則)
            // 大夜班的前一天，必須是「大夜」或「OFF」
            if (shift === 'N') {
                if (prevShift !== 'N' && prevShift !== 'OFF' && prevShift !== 'M_OFF') {
                    errors[d] = "大夜前需OFF或連N";
                }
            }

            // 3. 休息間隔 (Spec 4. 休息間隔 11 小時)
            // 若無特定定義，使用預設時段檢查
            if (rules.constraints?.minInterval11h !== false && prevIsWorking && isWorking) {
                const prevDef = shiftDefs.find(s => s.code === prevShift);
                const currDef = shiftDefs.find(s => s.code === shift);
                if (prevDef && currDef) {
                    const getMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                    let prevEnd = getMins(prevDef.endTime);
                    let currStart = getMins(currDef.startTime);
                    if (prevEnd === 0) prevEnd = 1440; // 24:00
                    
                    // 間隔 = (24hr - 前班結束) + 後班開始
                    const gap = (1440 - prevEnd) + currStart;
                    if (gap < 660) { // 11 * 60 = 660 mins
                        errors[d] = `間隔不足11hr (${Math.floor(gap/60)}h)`;
                    }
                }
            }

            // 4. 連續上班天數 (Spec 4. 連續上班天數)
            if (isWorking) consecutiveDays++; else consecutiveDays = 0;
            if (consecutiveDays > maxConsecutive) {
                errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            }

            // 5. 母性保護 (Spec 2. 特殊身分)
            if (isProtected && (shift === 'N' || shift === 'E')) {
                errors[d] = "懷孕/哺乳不可夜班";
            }

            prevShift = shift;
        }

        return { errors };
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules, systemSettings = {}) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        staffList.forEach(staff => {
            const result = this.validateStaff(
                scheduleData.assignments[staff.uid], 
                daysInMonth, shiftDefs, rules, staff.constraints,
                'OFF', 0, null, 
                scheduleData.year, scheduleData.month, systemSettings
            );
            if (Object.keys(result.errors).length > 0) staffReport[staff.uid] = result;
        });
        return { staffReport, coverageErrors: {} }; // 簡化回傳
    }
}
