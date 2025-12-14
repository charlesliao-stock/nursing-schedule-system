/**
 * RuleEngine - 排班規則驗證引擎
 * 負責驗證排班是否符合勞基法、單位規則、個人限制
 * v2.0 優化版本
 */

export class RuleEngine {

    // ============================================================
    //  主要驗證方法
    // ============================================================

    /**
     * 驗證單一員工的班表
     * @param {Object} assignments - 員工的班表 { 1: 'D', 2: 'E', ... }
     * @param {Number} daysInMonth - 當月天數
     * @param {Array} shiftDefs - 班別定義
     * @param {Object} rules - 單位規則
     * @param {Object} staffConstraints - 員工個人限制
     * @returns {Object} { errors: { day: message } }
     */
    static validateStaff(assignments, daysInMonth, shiftDefs, rules, staffConstraints = {}) {
        const errors = {}; 
        const safeAssignments = assignments || {};
        
        // 取得規則參數
        const config = this.prepareValidationConfig(rules, staffConstraints);
        
        // 建立班表陣列 (索引從 1 開始)
        const shiftArray = [];
        for (let d = 0; d <= daysInMonth; d++) {
            shiftArray[d] = safeAssignments[d] || '';
        }
        
        // 執行各項驗證
        this.validatePregnantProtection(shiftArray, daysInMonth, config, errors);
        this.validateConsecutiveWork(shiftArray, daysInMonth, config, errors);
        this.validateConsecutiveNights(shiftArray, daysInMonth, config, errors);
        this.validateIntervalRules(shiftArray, daysInMonth, config, errors);
        this.validateMinimumConsecutive(shiftArray, daysInMonth, config, errors);
        this.validateShiftVariety(shiftArray, daysInMonth, config, errors);
        this.validateTwoWeekRest(shiftArray, daysInMonth, config, errors);
        
        return { errors };
    }

    /**
     * 驗證每日人力覆蓋
     * @param {Object} scheduleData - 完整班表資料
     * @param {Number} daysInMonth - 當月天數
     * @param {Object} unitSettings - 單位設定
     * @returns {Object} { coverageErrors, dailyCounts }
     */
    static validateDailyCoverage(scheduleData, daysInMonth, unitSettings) {
        const coverageErrors = {};
        const minStaffReq = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        
        // 統計每日各班別人數
        const dailyCounts = {};
        for(let d = 1; d <= daysInMonth; d++) {
            dailyCounts[d] = { D: 0, E: 0, N: 0 };
        }
        
        const allAssignments = scheduleData?.assignments || {};
        Object.values(allAssignments).forEach(staffShifts => {
            if (!staffShifts) return;
            
            for(let d = 1; d <= daysInMonth; d++) {
                const shift = staffShifts[d];
                if (shift && dailyCounts[d][shift] !== undefined) {
                    dailyCounts[d][shift]++;
                }
            }
        });
        
        // 檢查是否符合最低人力需求
        const year = scheduleData?.year || new Date().getFullYear();
        const month = scheduleData?.month || new Date().getMonth() + 1;
        
        for(let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const weekDay = date.getDay();
            
            const minD = minStaffReq.D?.[weekDay] || 0;
            const minE = minStaffReq.E?.[weekDay] || 0;
            const minN = minStaffReq.N?.[weekDay] || 0;
            
            const issues = [];
            if (minD > 0 && dailyCounts[d].D < minD) {
                issues.push({
                    shift: 'D',
                    required: minD,
                    actual: dailyCounts[d].D,
                    shortage: minD - dailyCounts[d].D,
                    message: `白班缺 ${minD - dailyCounts[d].D} 人`
                });
            }
            if (minE > 0 && dailyCounts[d].E < minE) {
                issues.push({
                    shift: 'E',
                    required: minE,
                    actual: dailyCounts[d].E,
                    shortage: minE - dailyCounts[d].E,
                    message: `小夜缺 ${minE - dailyCounts[d].E} 人`
                });
            }
            if (minN > 0 && dailyCounts[d].N < minN) {
                issues.push({
                    shift: 'N',
                    required: minN,
                    actual: dailyCounts[d].N,
                    shortage: minN - dailyCounts[d].N,
                    message: `大夜缺 ${minN - dailyCounts[d].N} 人`
                });
            }
            
            if (issues.length > 0) {
                coverageErrors[d] = issues;
            }
        }
        
        return { coverageErrors, dailyCounts };
    }

    /**
     * 驗證整個單位的班表
     * @param {Object} scheduleData - 班表資料
     * @param {Number} daysInMonth - 當月天數
     * @param {Array} staffList - 員工清單
     * @param {Object} unitSettings - 單位設定
     * @param {Object} rules - 規則設定
     * @returns {Object} { staffErrors, coverageErrors, summary }
     */
    static validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules) {
        const staffErrors = {};
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        // 驗證每位員工
        if (staffList && Array.isArray(staffList)) {
            staffList.forEach(staff => {
                const uid = staff.uid;
                if (!uid) return;

                const staffAssignments = scheduleData?.assignments?.[uid] || {};
                const result = this.validateStaff(
                    staffAssignments, 
                    daysInMonth, 
                    shiftDefs, 
                    rules, 
                    staff.constraints
                );
                
                if (Object.keys(result.errors).length > 0) {
                    staffErrors[uid] = {
                        name: staff.displayName || staff.email || uid,
                        errors: result
                    };
                }
            });
        }

        // 驗證每日人力
        const { coverageErrors, dailyCounts } = this.validateDailyCoverage(
            scheduleData, 
            daysInMonth, 
            unitSettings
        );

        // 產生摘要
        const summary = this.generateValidationSummary(staffErrors, coverageErrors);

        return { 
            staffErrors, 
            coverageErrors, 
            dailyCounts,
            summary 
        };
    }

    // ============================================================
    //  配置準備
    // ============================================================

    /**
     * 準備驗證配置
     */
    static prepareValidationConfig(rules, staffConstraints) {
        const globalMaxConsecutive = rules?.maxConsecutiveWork || 6;
        const constraints = rules?.constraints || {};
        
        return {
            // 連續工作天數
            maxConsecutive: staffConstraints?.maxConsecutive || globalMaxConsecutive,
            
            // 連續夜班天數
            maxConsecutiveNights: Math.min(
                constraints.maxConsecutiveNight || 4,
                staffConstraints?.maxConsecutiveNights || 4
            ),
            
            // 孕婦保護
            isPregnant: !!staffConstraints?.isPregnant,
            
            // 同班連續最少天數
            minConsecutiveSame: constraints.minConsecutiveSame || 2,
            
            // 一週最多班別種類
            maxTypesPerWeek: constraints.maxShiftTypesWeek || 3,
            
            // 大夜前需 OFF
            firstNRequiresOFF: constraints.firstNRequiresOFF !== false,
            
            // 11 小時間隔
            minInterval11h: constraints.minInterval11h !== false,
            
            // 兩週休假檢核
            checkTwoWeekOff: constraints.checkTwoWeekOff !== false,
            
            // N 接 D 策略
            nToDStrategy: constraints.nToDStrategy || 'penalty_high'
        };
    }

    // ============================================================
    //  各項驗證規則
    // ============================================================

    /**
     * 驗證孕婦保護條款
     */
    static validatePregnantProtection(shiftArray, daysInMonth, config, errors) {
        if (!config.isPregnant) return;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const shift = shiftArray[d];
            if (shift === 'N' || shift === 'E') {
                errors[d] = '⚠️ 孕婦不可排夜班或小夜班';
            }
        }
    }

    /**
     * 驗證連續工作天數
     */
    static validateConsecutiveWork(shiftArray, daysInMonth, config, errors) {
        let consecutiveDays = 0;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const shift = shiftArray[d];
            const isWorking = shift && shift !== 'OFF' && shift !== 'M_OFF';
            
            if (isWorking) {
                consecutiveDays++;
                if (consecutiveDays > config.maxConsecutive) {
                    errors[d] = `❌ 連續工作 ${consecutiveDays} 天 (上限 ${config.maxConsecutive} 天)`;
                }
            } else {
                consecutiveDays = 0;
            }
        }
    }

    /**
     * 驗證連續夜班天數
     */
    static validateConsecutiveNights(shiftArray, daysInMonth, config, errors) {
        let consecutiveNights = 0;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const shift = shiftArray[d];
            
            if (shift === 'N') {
                consecutiveNights++;
                if (consecutiveNights > config.maxConsecutiveNights) {
                    errors[d] = `❌ 連續大夜 ${consecutiveNights} 天 (上限 ${config.maxConsecutiveNights} 天)`;
                }
            } else {
                consecutiveNights = 0;
            }
        }
    }

    /**
     * 驗證班別間隔規則
     */
    static validateIntervalRules(shiftArray, daysInMonth, config, errors) {
        for (let d = 2; d <= daysInMonth; d++) {
            const prevShift = shiftArray[d - 1];
            const currentShift = shiftArray[d];
            
            // 11 小時間隔規則
            if (config.minInterval11h) {
                // E 接 D (小夜 22:00 下班 → 白班 08:00 上班 = 10 小時)
                if (prevShift === 'E' && currentShift === 'D') {
                    if (!errors[d]) {
                        errors[d] = '⚠️ 間隔不足 11 小時 (E→D)';
                    }
                }
                
                // D 接 N (白班 17:00 下班 → 大夜 22:00 上班 = 5 小時)
                if (prevShift === 'D' && currentShift === 'N') {
                    if (!errors[d]) {
                        errors[d] = '⚠️ 間隔不足 11 小時 (D→N)';
                    }
                }
            }
            
            // 大夜前需 OFF 或連續 N
            if (config.firstNRequiresOFF && currentShift === 'N') {
                const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
                if (prevIsWorking && prevShift !== 'N') {
                    if (!errors[d]) {
                        errors[d] = `⚠️ 大夜前一天需為休假或連續夜班 (前日: ${prevShift})`;
                    }
                }
            }
            
            // N 接 D 策略檢查 (僅警告，不阻擋)
            if (prevShift === 'N' && currentShift === 'D') {
                if (config.nToDStrategy === 'ban') {
                    errors[d] = '❌ 嚴格禁止夜班接白班 (N→D)';
                } else if (config.nToDStrategy === 'penalty_high') {
                    if (!errors[d]) {
                        errors[d] = '⚠️ 不建議夜班接白班，疲勞風險高';
                    }
                }
            }
        }
    }

    /**
     * 驗證同班連續最少天數
     */
    static validateMinimumConsecutive(shiftArray, daysInMonth, config, errors) {
        for (let d = 2; d <= daysInMonth; d++) {
            const prevShift = shiftArray[d - 1];
            const currentShift = shiftArray[d];
            
            const prevIsWorking = prevShift && prevShift !== 'OFF' && prevShift !== 'M_OFF';
            const currentIsWorking = currentShift && currentShift !== 'OFF' && currentShift !== 'M_OFF';
            
            // 如果前一天在工作，且今天換了不同班別
            if (prevIsWorking && currentIsWorking && prevShift !== currentShift) {
                // 計算前一班別連續了幾天
                let count = 0;
                for(let back = d - 1; back >= 1; back--) {
                    if (shiftArray[back] === prevShift) {
                        count++;
                    } else {
                        break;
                    }
                }
                
                // 如果連續天數不足最低要求
                if (count < config.minConsecutiveSame) {
                    if (!errors[d - 1]) {
                        errors[d - 1] = `⚠️ ${prevShift} 班僅連續 ${count} 天 (建議至少 ${config.minConsecutiveSame} 天)`;
                    }
                }
            }
        }
    }

    /**
     * 驗證一週內班別種類
     */
    static validateShiftVariety(shiftArray, daysInMonth, config, errors) {
        if (config.maxTypesPerWeek >= 99) return; // 不限制
        
        for (let d = 7; d <= daysInMonth; d++) {
            const types = new Set();
            
            // 檢查過去 7 天
            for (let k = 0; k < 7; k++) {
                const shift = shiftArray[d - k];
                if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                    types.add(shift);
                }
            }
            
            if (types.size > config.maxTypesPerWeek) {
                if (!errors[d]) {
                    errors[d] = `⚠️ 7天內有 ${types.size} 種班別 (上限 ${config.maxTypesPerWeek} 種)`;
                }
            }
        }
    }

    /**
     * 驗證兩週休假規則
     */
    static validateTwoWeekRest(shiftArray, daysInMonth, config, errors) {
        if (!config.checkTwoWeekOff) return;
        
        for (let d = 14; d <= daysInMonth; d++) {
            let offDays = 0;
            
            // 檢查過去 14 天
            for (let k = 0; k < 14; k++) {
                const shift = shiftArray[d - k];
                if (!shift || shift === 'OFF' || shift === 'M_OFF') {
                    offDays++;
                }
            }
            
            // 兩週至少需要 2 天休假
            if (offDays < 2) {
                if (!errors[d]) {
                    errors[d] = `⚠️ 過去兩週僅休 ${offDays} 天 (法規要求至少 2 天)`;
                }
            }
        }
    }

    // ============================================================
    //  摘要與統計
    // ============================================================

    /**
     * 產生驗證摘要
     */
    static generateValidationSummary(staffErrors, coverageErrors) {
        const summary = {
            totalStaffViolations: 0,
            totalCoverageIssues: 0,
            violationsByType: {},
            criticalDays: [],
            passed: true
        };
        
        // 統計員工違規
        Object.values(staffErrors).forEach(staffError => {
            const errors = staffError.errors.errors || {};
            summary.totalStaffViolations += Object.keys(errors).length;
            
            Object.values(errors).forEach(msg => {
                // 分類錯誤類型
                if (msg.includes('連續工作')) {
                    summary.violationsByType['consecutive_work'] = 
                        (summary.violationsByType['consecutive_work'] || 0) + 1;
                } else if (msg.includes('連續大夜')) {
                    summary.violationsByType['consecutive_nights'] = 
                        (summary.violationsByType['consecutive_nights'] || 0) + 1;
                } else if (msg.includes('間隔')) {
                    summary.violationsByType['interval'] = 
                        (summary.violationsByType['interval'] || 0) + 1;
                } else if (msg.includes('孕婦')) {
                    summary.violationsByType['pregnant'] = 
                        (summary.violationsByType['pregnant'] || 0) + 1;
                } else if (msg.includes('兩週')) {
                    summary.violationsByType['two_week_rest'] = 
                        (summary.violationsByType['two_week_rest'] || 0) + 1;
                } else {
                    summary.violationsByType['other'] = 
                        (summary.violationsByType['other'] || 0) + 1;
                }
            });
        });
        
        // 統計人力缺口
        Object.entries(coverageErrors).forEach(([day, issues]) => {
            summary.totalCoverageIssues += issues.length;
            
            const totalShortage = issues.reduce((sum, issue) => sum + issue.shortage, 0);
            if (totalShortage >= 3) {
                summary.criticalDays.push({
                    day: parseInt(day),
                    shortage: totalShortage,
                    details: issues
                });
            }
        });
        
        // 判斷是否通過
        summary.passed = summary.totalStaffViolations === 0 && 
                        summary.totalCoverageIssues === 0;
        
        return summary;
    }

    /**
     * 取得友善的錯誤訊息
     */
    static getFriendlyErrorMessage(errorCode) {
        const messages = {
            'consecutive_work': '連續工作天數過多',
            'consecutive_nights': '連續夜班天數過多',
            'interval': '班別間隔時間不足',
            'pregnant': '孕婦保護規則違反',
            'two_week_rest': '兩週休假不足',
            'variety': '班別變化過於頻繁',
            'minimum_consecutive': '同班連續天數不足',
            'other': '其他規則違反'
        };
        
        return messages[errorCode] || '未知錯誤';
    }

    /**
     * 取得嚴重程度
     */
    static getViolationSeverity(errorMessage) {
        if (errorMessage.includes('❌')) return 'critical';
        if (errorMessage.includes('⚠️')) return 'warning';
        return 'info';
    }

    // ============================================================
    //  輔助方法
    // ============================================================

    /**
     * 檢查班別是否為工作班
     */
    static isWorkingShift(shift) {
        return shift && shift !== 'OFF' && shift !== 'M_OFF' && shift !== '';
    }

    /**
     * 計算某段時間內的工作天數
     */
    static countWorkingDays(shiftArray, startDay, endDay) {
        let count = 0;
        for (let d = startDay; d <= endDay; d++) {
            if (this.isWorkingShift(shiftArray[d])) {
                count++;
            }
        }
        return count;
    }

    /**
     * 取得某段時間內的班別種類
     */
    static getShiftTypes(shiftArray, startDay, endDay) {
        const types = new Set();
        for (let d = startDay; d <= endDay; d++) {
            const shift = shiftArray[d];
            if (this.isWorkingShift(shift)) {
                types.add(shift);
            }
        }
        return Array.from(types);
    }

    /**
     * 產生詳細的驗證報告 (供匯出使用)
     */
    static generateDetailedReport(validationResult) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: validationResult.summary,
            staffViolations: [],
            coverageIssues: []
        };
        
        // 整理員工違規
        Object.entries(validationResult.staffErrors || {}).forEach(([uid, staffError]) => {
            Object.entries(staffError.errors.errors || {}).forEach(([day, message]) => {
                report.staffViolations.push({
                    uid,
                    name: staffError.name,
                    day: parseInt(day),
                    message,
                    severity: this.getViolationSeverity(message)
                });
            });
        });
        
        // 整理人力缺口
        Object.entries(validationResult.coverageErrors || {}).forEach(([day, issues]) => {
            issues.forEach(issue => {
                report.coverageIssues.push({
                    day: parseInt(day),
                    shift: issue.shift,
                    required: issue.required,
                    actual: issue.actual,
                    shortage: issue.shortage
                });
            });
        });
        
        return report;
    }
}
