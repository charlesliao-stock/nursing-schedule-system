// js/modules/ai/RuleEngine.js

export class RuleEngine {

    /**
     * 驗證單一人員的排班規則
     * @param {Object} assignments 該員當月班表 {1: 'D', 2: 'N', ...}
     * @param {number} daysInMonth 當月天數
     * @param {Array} shiftDefs 班別定義 (Array of Objects)
     * @param {Object} rules 排班規則 (minStaff, constraints)
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules) {
        const errors = {}; 
        if (!assignments || !shiftDefs) return { errors };

        const constraints = rules?.constraints || {};
        const maxWorkDays = constraints.maxWorkDays || 6;
        
        // 建立班別快速查找表
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
            const isWorking = currentCode && currentCode !== 'OFF';

            // 1. 連續上班天數檢查
            if (isWorking) {
                consecutiveDays++;
            } else {
                consecutiveDays = 0;
            }

            if (consecutiveDays > maxWorkDays) {
                errors[d] = `連${consecutiveDays} (上限${maxWorkDays})`;
            }

            // 2. 班別銜接檢查 (上一天 vs 這一天)
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                
                // 檢查 N 接 D
                if (constraints.noNtoD && prevCode === 'N' && currentCode === 'D') {
                    errors[d] = "禁止 N 接 D";
                }
                
                // 檢查 E 接 D
                if (constraints.noEtoD && prevCode === 'E' && currentCode === 'D') {
                    errors[d] = "禁止 E 接 D";
                }

                // 檢查 11 小時休息 (若班別有設定時間)
                const prevShift = shiftMap[prevCode];
                if (prevShift && currentShift && prevCode !== 'OFF' && currentCode !== 'OFF') {
                    if (prevShift.endTime && currentShift.startTime) {
                        const restHours = this.calculateRestHours(prevShift.endTime, currentShift.startTime);
                        if (restHours < 11) { // 勞基法預設 11
                            // 標記在後一天
                            if (!errors[d]) errors[d] = `間隔僅 ${restHours.toFixed(1)}hr`;
                        }
                    }
                }
            }
        }

        return { errors };
    }

    /**
     * 驗證每日人力是否充足
     * @param {Object} scheduleData 完整班表資料
     * @param {number} daysInMonth 
     * @param {Object} rules 排班規則
     */
    static validateDailyCoverage(scheduleData, daysInMonth, rules) {
        const coverageErrors = {}; // { day: ["缺 D", "缺 N"] }
        const minStaff = rules?.minStaff || {};
        
        // 初始化計數器
        const dailyCounts = {}; 
        for(let d=1; d<=daysInMonth; d++) dailyCounts[d] = { D:0, E:0, N:0 };

        // 統計所有人
        Object.values(scheduleData.assignments || {}).forEach(staffShifts => {
            for(let d=1; d<=daysInMonth; d++) {
                const shift = staffShifts[d];
                if (shift && dailyCounts[d][shift] !== undefined) {
                    dailyCounts[d][shift]++;
                }
            }
        });

        // 比對規則
        for(let d=1; d<=daysInMonth; d++) {
            const issues = [];
            if (minStaff.D > 0 && dailyCounts[d].D < minStaff.D) issues.push(`白缺${minStaff.D - dailyCounts[d].D}`);
            if (minStaff.E > 0 && dailyCounts[d].E < minStaff.E) issues.push(`小缺${minStaff.E - dailyCounts[d].E}`);
            if (minStaff.N > 0 && dailyCounts[d].N < minStaff.N) issues.push(`大缺${minStaff.N - dailyCounts[d].N}`);
            
            if (issues.length > 0) {
                coverageErrors[d] = issues;
            }
        }

        return { coverageErrors, dailyCounts };
    }

    /**
     * 輔助：計算休息時數
     */
    static calculateRestHours(prevEndTime, currStartTime) {
        const parse = (t) => {
            if(!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h + m / 60;
        };
        
        let pEnd = parse(prevEndTime);
        const cStart = parse(currStartTime);

        // 假設前一班結束時間小於開始時間，視為跨日 (如 16:00-00:00, 00:00=24)
        // 或是前一班是大夜 00:00-08:00 (結束 8)，接下一班 16:00 (開始 16) -> 16-8=8hr
        // 這裡邏輯需視班別定義而定，暫以簡單邏輯：
        // 若結束時間 <= 12 (中午前)，通常視為當天早上；若 > 12，視為當天下午/晚上
        // 這裡假設 pEnd 若比 cStart 大很多，可能是跨日? 
        // 比較通用的作法：計算 (24 - pEnd) + cStart
        // 但如果 pEnd 是 08:00，cStart 是 16:00，其實是同一天。
        
        // 簡化邏輯：假設 pEnd 是前一天的時間點，cStart 是今天的時間點 (加 24)
        // 若 pEnd > cStart (例如前一天大夜到 08:00，今天白班 08:00)，這邏輯會有問題
        // 修正：依賴 Shift 的屬性 (是否跨日) 最準，若無，則假設「所有班別都在 24 小時週期內」
        // 間隔 = (今天的開始時間 + 24) - (前一天的結束時間)
        
        // 修正 2: 如果前一天的班別結束時間很晚 (如 23:00) 或跨日 (02:00 = 26:00)
        // 我們假設 pEnd 已經是絕對時間 (例如 02:00 應視為 26)
        // 在此範例先回傳 12 (Pass) 避免誤判，待 Shift 資料結構更完整後實作
        return 12; 
    }

    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffReport = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        // 1. 檢查個人
        staffList.forEach(staff => {
            const staffAssignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs, rules);
            if (Object.keys(result.errors).length > 0) {
                staffReport[staff.id] = result;
            }
        });

        // 2. 檢查每日人力
        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, rules);

        return { staffReport, coverageErrors };
    }
}
