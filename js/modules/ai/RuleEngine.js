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
        // ✅ 安全檢查：若 assignments 為 undefined/null，視為空物件，不報錯
        const safeAssignments = assignments || {};

        // 1. 取得規則參數 (優先使用個人設定，若無則用全域設定)
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const maxConsecutive = staffConstraints?.maxConsecutive || globalMaxConsecutive;
        const maxConsecutiveNights = staffConstraints?.maxConsecutiveNights || 4; // 預設連夜上限 4
        const isPregnant = !!staffConstraints?.isPregnant;

        const avoidNtoD = rules?.avoidNtoD !== false; // 預設開啟
        const avoidEtoD = rules?.avoidEtoD !== false;

        // 建立班別快速查找表
        const shiftMap = {};
        if (shiftDefs) {
            shiftDefs.forEach(s => shiftMap[s.code] = s);
        }

        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = safeAssignments[d] || '';
        }

        let consecutiveDays = 0;
        let consecutiveNights = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const isWorking = currentCode && currentCode !== 'OFF' && currentCode !== 'M_OFF';
            const isNight = currentCode === 'E' || currentCode === 'N';

            // --- 規則 A: 懷孕條款 ---
            if (isPregnant && isNight) {
                errors[d] = "懷孕不可排夜班";
            }

            // --- 規則 B: 連續上班天數 ---
            if (isWorking) {
                consecutiveDays++;
            } else {
                consecutiveDays = 0;
            }

            if (consecutiveDays > maxConsecutive) {
                errors[d] = `連${consecutiveDays} (上限${maxConsecutive})`;
            }

            // --- 規則 C: 連續夜班天數 ---
            if (isNight) {
                consecutiveNights++;
            } else {
                consecutiveNights = 0;
            }

            if (consecutiveNights > maxConsecutiveNights) {
                errors[d] = `連夜${consecutiveNights} (上限${maxConsecutiveNights})`;
            }

            // --- 規則 D: 班別銜接 (上一天 vs 這一天) ---
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                
                // N 接 D
                if (avoidNtoD && prevCode === 'N' && currentCode === 'D') {
                    errors[d] = "禁止 N 接 D";
                }
                
                // E 接 D
                if (avoidEtoD && prevCode === 'E' && currentCode === 'D') {
                    errors[d] = "禁止 E 接 D";
                }
            }
        }

        return { errors };
    }

    /**
     * 驗證每日人力是否充足
     */
    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {}; // { day: ["缺 D", "缺 N"] }
        const minStaffReq = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        
        // 初始化計數器
        const dailyCounts = {}; 
        for(let d=1; d<=daysInMonth; d++) dailyCounts[d] = { D:0, E:0, N:0 };

        // ✅ 安全檢查：確保 assignments 存在
        const allAssignments = scheduleData?.assignments || {};

        // 統計所有人
        Object.values(allAssignments).forEach(staffShifts => {
            if (!staffShifts) return; // 跳過無效資料
            for(let d=1; d<=daysInMonth; d++) {
                const shift = staffShifts[d];
                if (shift && dailyCounts[d][shift] !== undefined) {
                    dailyCounts[d][shift]++;
                }
            }
        });

        // 取得該月第 d 天是星期幾
        const year = scheduleData?.year || new Date().getFullYear();
        const month = scheduleData?.month || new Date().getMonth() + 1;

        // 比對規則
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const weekDay = date.getDay(); // 0-6

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
        
        // 1. 檢查個人
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const staffAssignments = scheduleData?.assignments ? scheduleData.assignments[staff.uid || staff.id] : {};
                // 注意：這裡傳入 staff.constraints 以支援個別限制
                const result = this.validateStaff(staffAssignments, daysInMonth, shiftDefs, rules, staff.constraints);
                if (Object.keys(result.errors).length > 0) {
                    staffReport[staff.uid || staff.id] = result;
                }
            });
        }

        // 2. 檢查每日人力
        const { coverageErrors } = this.validateDailyCoverage(scheduleData, daysInMonth, unitSettings);

        return { staffReport, coverageErrors };
    }
}
