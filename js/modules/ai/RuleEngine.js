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
        // 使用單位設定的連夜上限，若人員有更嚴格限制(較小值)則取人員的
        const unitMaxNight = constraints.maxConsecutiveNight || 4;
        const staffMaxNight = staffConstraints?.maxConsecutiveNights || 4;
        const maxConsecutiveNights = Math.min(unitMaxNight, staffMaxNight);
        
        const isPregnant = !!staffConstraints?.isPregnant;
        const minConsecutiveSame = constraints.minConsecutiveSame || 2;
        const maxTypesPerWeek = constraints.maxShiftTypesWeek || 3;
        const firstNRequiresOFF = constraints.firstNRequiresOFF !== false; // 預設 true

        // 建立班別陣列
        const shiftArray = [];
        for (let d = 1; d <= daysInMonth; d++) {
            shiftArray[d] = safeAssignments[d] || '';
        }

        let consecutiveDays = 0;
        let consecutiveNights = 0;
        let currentSameShift = 0;
        
        // 用於檢查一週班別種類 (假設每7天一週，或滑動視窗)
        // 這裡採用勞基法常見的「每七日」檢查，這裡簡化為週一至週日區間檢查
        // 需要知道每月1號是星期幾
        // 由於此函數未傳入 year/month，我們改用滑動視窗(Rolling 7 days)或暫時略過精確日期檢查
        // 為了效能與簡化，這裡暫時檢查連續 7 天內的種類

        for (let d = 1; d <= daysInMonth; d++) {
            const currentCode = shiftArray[d];
            const isWorking = currentCode && currentCode !== 'OFF' && currentCode !== 'M_OFF';
            const isNight = currentCode === 'N'; // 只算大夜為連夜限制，E算小夜
            // 注意：有時 E 也算夜班，視醫院定義。這裡依需求 N 為大夜。

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

            // --- 4. 班別銜接邏輯 (Sequencing & 11 Hours) ---
            if (d > 1) {
                const prevCode = shiftArray[d-1];
                const prevIsWorking = prevCode && prevCode !== 'OFF' && prevCode !== 'M_OFF';

                // (1) 11小時/逆向禁止: OFF -> N -> D -> E
                // 禁止: E -> D (休息不足), N -> E (休息不足/逆向), D -> N (逆向/需OFF)
                // 禁止: 任何班 -> N (若 N 需 OFF)
                
                if (prevCode === 'E' && currentCode === 'D') errors[d] = "禁止小接白(E-D)";
                if (prevCode === 'N' && currentCode === 'E') errors[d] = "禁止大接小(N-E)";
                
                // 逆向檢查 (D->N 其實會被下面的 firstNRequiresOFF 擋住，但 E->N 也需擋)
                if (prevCode === 'E' && currentCode === 'N') errors[d] = "禁止小接大(E-N)"; 
                if (prevCode === 'D' && currentCode === 'N') errors[d] = "禁止白接大(D-N)";

                // (2) 首個大夜前必須 OFF
                if (firstNRequiresOFF && currentCode === 'N') {
                    if (prevCode === 'N') {
                        // 連續大夜，OK
                    } else if (prevIsWorking) {
                        // 昨天有上班 (D 或 E)，今天接 N -> 禁止
                        errors[d] = "大夜前需OFF";
                    }
                }

                // (3) 同種班最少連續 days (避免花花班)
                // 檢查點：當班別改變時 (例如 D D -> E)，檢查前面的 D 是否足夠
                if (prevIsWorking && prevCode !== currentCode) {
                    // 往前追溯 prevCode 連續了幾天
                    let count = 0;
                    for(let back = d-1; back >= 1; back--) {
                        if (shiftArray[back] === prevCode) count++;
                        else break;
                    }
                    // 如果中斷了且長度不足
                    if (count < minConsecutiveSame) {
                        // 標記在昨天 (因為是昨天的班別長度不足)
                        if (!errors[d-1]) errors[d-1] = `${prevCode}僅${count}天(需${minConsecutiveSame})`;
                    }
                }
            }
        }

        // --- 5. 一週班別種類 (Rolling 7 Days) ---
        // 簡單檢查：任 7 天區間內，班別種類不可超過設定值
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

    /**
     * 驗證每日人力是否充足
     */
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
