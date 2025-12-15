export class ScoringService {
    
    /**
     * 1. 定義預設評分設定 (14 項指標)
     */
    static getDefaultConfig() {
        const standardLabels = ['優', '佳', '良', '可', '平'];

        return {
            fairness: {
                label: "1. 公平性指標",
                subs: {
                    hoursDiff: { 
                        label: "(1) 工時差異 (標準差)", desc: "所有員工工時與平均工時的標準差差異程度", weight: 10, enabled: true, 
                        tiers: [{limit: 2, score: 100, label: standardLabels[0]}, {limit: 4, score: 80, label: standardLabels[1]}, {limit: 6, score: 60, label: standardLabels[2]}, {limit: 8, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    },
                    nightDiff: { 
                        label: "(2) 夜班差異 (次)", desc: "員工之間夜班天數差異程度 (Max - Min)", weight: 10, enabled: true,
                        excludeBatch: true, // 預設開啟排除包班
                        tiers: [{limit: 1, score: 100, label: standardLabels[0]}, {limit: 2, score: 80, label: standardLabels[1]}, {limit: 3, score: 60, label: standardLabels[2]}, {limit: 4, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    },
                    holidayDiff: {
                        label: "(3) 假日差異 (天)", desc: "員工之間假日放假天數差異程度 (Max - Min)", weight: 10, enabled: true,
                        tiers: [{limit: 1, score: 100, label: standardLabels[0]}, {limit: 2, score: 80, label: standardLabels[1]}, {limit: 3, score: 60, label: standardLabels[2]}, {limit: 4, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    }
                }
            },
            satisfaction: {
                label: "2. 滿意度指標",
                subs: {
                    prefRate: { 
                        label: "(1) 排班偏好滿足度 (%)", desc: "排班的結果符合員工偏好的程度", weight: 15, enabled: true,
                        tiers: [{limit: 10, score: 100, label: standardLabels[0]}, {limit: 20, score: 80, label: standardLabels[1]}, {limit: 30, score: 60, label: standardLabels[2]}, {limit: 40, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    },
                    wishRate: { 
                        label: "(2) 預班達成率 (%)", desc: "排假的結果符合員工預班OFF的程度", weight: 10, enabled: true,
                        tiers: [{limit: 5, score: 100, label: standardLabels[0]}, {limit: 10, score: 80, label: standardLabels[1]}, {limit: 15, score: 60, label: standardLabels[2]}, {limit: 20, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    }
                }
            },
            fatigue: {
                label: "3. 疲勞度指標",
                subs: {
                    consWork: { 
                        label: "(1) 連續工作>6天 (人次)", desc: "最長連續工作天數達6天(以上)的人次次數", weight: 8, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 2, score: 80, label: standardLabels[1]}, {limit: 4, score: 60, label: standardLabels[2]}, {limit: 6, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    },
                    nToD: { 
                        label: "(2) 大夜接白 (次)", desc: "前一天大夜，隔天早班的次數", weight: 7, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 3, score: 80, label: standardLabels[1]}, {limit: 6, score: 60, label: standardLabels[2]}, {limit: 10, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    },
                    offTargetRate: {
                        label: "(3) 休假達標率 (%)", desc: "符合應放天數規定的員工比例", weight: 5, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 5, score: 80, label: standardLabels[1]}, {limit: 10, score: 60, label: standardLabels[2]}, {limit: 15, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    },
                    weeklyNight: {
                        label: "(4) 週夜班頻率 (SD)", desc: "每位員工週平均夜班次數的標準差", weight: 5, enabled: true,
                        excludeBatch: true,
                        tiers: [{limit: 0.3, score: 100, label: standardLabels[0]}, {limit: 0.5, score: 80, label: standardLabels[1]}, {limit: 0.7, score: 60, label: standardLabels[2]}, {limit: 1.0, score: 40, label: standardLabels[3]}, {limit: 999, score: 20, label: standardLabels[4]}]
                    }
                }
            },
            efficiency: {
                label: "4. 排班效率",
                subs: {
                    shortageRate: {
                        label: "(1) 缺班率 (%)", desc: "未成功分配人員的班次比例", weight: 8, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 2, score: 80, label: standardLabels[1]}, {limit: 5, score: 60, label: standardLabels[2]}, {limit: 10, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    },
                    seniorDist: {
                        label: "(2) 資深分佈合理性 (%)", desc: "各班至少1位年資2年以上員工", weight: 4, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 5, score: 80, label: standardLabels[1]}, {limit: 10, score: 60, label: standardLabels[2]}, {limit: 15, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    },
                    juniorDist: {
                        label: "(3) 資淺分佈合理性 (%)", desc: "各班最多1位年資2年以下員工", weight: 3, enabled: true,
                        tiers: [{limit: 0, score: 100, label: standardLabels[0]}, {limit: 10, score: 80, label: standardLabels[1]}, {limit: 20, score: 60, label: standardLabels[2]}, {limit: 30, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    }
                }
            },
            cost: {
                label: "5. 成本控制",
                subs: {
                    overtimeRate: {
                        label: "(1) 加班費比率 (%)", desc: "加班班數佔總班數的比例", weight: 5, enabled: true,
                        tiers: [{limit: 3, score: 100, label: standardLabels[0]}, {limit: 5, score: 80, label: standardLabels[1]}, {limit: 8, score: 60, label: standardLabels[2]}, {limit: 12, score: 40, label: standardLabels[3]}, {limit: 100, score: 20, label: standardLabels[4]}]
                    }
                }
            }
        };
    }

    /**
     * 2. 計算入口
     */
    static calculate(schedule, staffList, unitSettings, preSchedule) {
        if (!schedule || !schedule.assignments) return { totalScore: 0, details: {} };

        const assignments = schedule.assignments;
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const config = unitSettings.scoringConfig || this.getDefaultConfig();
        
        // 1. 計算所有原始指標 (metrics)
        const metrics = this.calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule, config);

        let totalScore = 0;
        let totalMax = 0;
        const details = {};

        // 2. 轉換分數
        Object.keys(config).forEach(catKey => {
            const catConfig = config[catKey];
            const subItems = [];
            let catMax = 0;
            let catScoreSum = 0;

            if (catConfig.subs) {
                Object.keys(catConfig.subs).forEach(subKey => {
                    const sub = catConfig.subs[subKey];
                    if (sub.enabled) {
                        const rawValue = metrics[subKey] || 0;
                        const tier = this.getTieredScore(rawValue, sub.tiers);
                        
                        const weight = parseInt(sub.weight) || 0;
                        const itemScore = (tier.score / 100) * weight;

                        catMax += weight;
                        catScoreSum += itemScore;

                        subItems.push({
                            name: sub.label,
                            value: this.formatValue(subKey, rawValue),
                            score: tier.score,
                            grade: tier.label || tier.score + '分', 
                            desc: sub.desc
                        });
                    }
                });
            }

            details[catKey] = {
                label: catConfig.label,
                score: catScoreSum,
                max: catMax,
                subItems: subItems,
                rawScore: catMax > 0 ? (catScoreSum / catMax * 100) : 0
            };

            totalScore += catScoreSum;
            totalMax += catMax;
        });

        const finalScore = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;

        return {
            totalScore: Math.round(finalScore),
            totalMax: totalMax,
            passed: finalScore >= 60,
            details: details
        };
    }

    // ==========================================
    //  3. 計算所有原始指標 (Metrics Calculation)
    // ==========================================
    static calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule, config) {
        const metrics = {};
        const req = unitSettings?.staffRequirements || {};
        
        // 取得班別定義 (Code) 與 時數對照表 (Hours Map)
        const unitShifts = unitSettings?.settings?.shifts || [];
        const shiftCodes = unitShifts.length > 0 ? unitShifts.map(s => s.code) : ['D','E','N'];
        
        // 建立工時查找表 { 'D': 8, 'E': 8, 'N': 8, 'NP': 12 ... }
        const hoursMap = {};
        unitShifts.forEach(s => {
            hoursMap[s.code] = parseFloat(s.hours) || 0;
        });

        const submissions = preSchedule?.submissions || {};
        const requiredOffDays = unitSettings?.rules?.minOffDays || 8;

        // --- 變數初始化 ---
        let totalShiftsFilled = 0;
        let totalShiftsNeeded = 0;
        let seniorViolations = 0;
        let juniorViolations = 0;
        let totalDailyShifts = 0;

        // --- A. 每日掃描 (效率) ---
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = (d % 7); 
            
            shiftCodes.forEach(s => {
                totalShiftsNeeded += (req[s]?.[dayOfWeek] || 0);
            });

            const dailyAssign = { D: [], E: [], N: [] }; // 簡易分類，若有自訂班別需擴充邏輯
            
            Object.keys(assignments).forEach(uid => {
                const shift = assignments[uid][d];
                // 只要 shift 存在且不是 OFF/M_OFF，就算有人力
                if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                    // 這裡為了檢查資深資淺，暫時只抓 D/E/N，若要支援所有班別需調整邏輯
                    if (dailyAssign[shift]) {
                        const staff = staffList.find(s => s.uid === uid);
                        if (staff) dailyAssign[shift].push(staff);
                    }
                    totalShiftsFilled++;
                    totalDailyShifts++;
                }
            });

            // 檢查資深資淺 (僅針對 D, E, N，或可依據屬性判斷)
            ['D', 'E', 'N'].forEach(s => {
                const staffInShift = dailyAssign[s] || [];
                if (staffInShift.length > 0) {
                    const seniors = staffInShift.filter(st => (st.years || 3) > 2).length;
                    const juniors = staffInShift.filter(st => (st.years || 3) <= 2).length;
                    if (seniors < 1) seniorViolations++;
                    if (juniors > 1) juniorViolations++;
                }
            });
        }

        // --- B. 個人掃描 (公平、滿意、疲勞) ---
        const staffStats = [];
        let totalWish = 0, metWish = 0;
        let totalPref = 0, metPref = 0;
        let nToDCount = 0;
        let consWorkViolations = 0;
        let holidayTargetMetCount = 0;
        let overtimeManDays = 0;

        staffList.forEach(staff => {
            const uid = staff.uid;
            const row = assignments[uid] || {};
            const wishes = submissions[uid]?.wishes || {};
            const prefs = submissions[uid]?.preferences || {};
            
            // 判斷是否為包班人員
            const isBatch = !!prefs.batch;

            let hours = 0, nights = 0, holidays = 0, off = 0;
            let cons = 0;
            let prev = 'OFF';

            for (let d = 1; d <= daysInMonth; d++) {
                const shift = row[d] || 'OFF';
                const isWork = shift !== 'OFF' && shift !== 'M_OFF';

                if (isWork) {
                    // ✅ 修正：從單位設定取得工時，若無設定則預設為 0 (避免誤算)
                    const h = hoursMap[shift] !== undefined ? hoursMap[shift] : 0;
                    hours += h;
                    
                    cons++;
                    // 假設夜班代碼包含 N 或 E，或可從 unitSettings 判斷屬性
                    if(['N','E'].includes(shift)) nights++;
                } else {
                    cons = 0;
                    off++;
                    if(d % 7 === 0 || d % 7 === 6) holidays++;
                }

                if (cons === 6) consWorkViolations++; 
                if (prev === 'N' && shift === 'D') nToDCount++;
                prev = shift;
            }

            staffStats.push({ hours, nights, holidays, isBatch });

            if (off >= requiredOffDays) holidayTargetMetCount++;
            if (off < requiredOffDays) overtimeManDays += (requiredOffDays - off);

            Object.entries(wishes).forEach(([d, w]) => {
                if (w === 'OFF' || w === 'M_OFF') {
                    totalWish++;
                    if (row[d] === 'OFF' || row[d] === 'M_OFF') metWish++;
                }
            });

            if (prefs.priority1) {
                totalPref++;
                if (Object.values(row).includes(prefs.priority1)) metPref++;
            }
        });

        // --- C. 計算最終指標 (含包班排除邏輯) ---
        
        // 1. 公平性
        const excludeBatchNight = config.fairness?.subs?.nightDiff?.excludeBatch === true;
        const nightStats = excludeBatchNight 
            ? staffStats.filter(s => !s.isBatch) 
            : staffStats;
        
        const nightsArr = nightStats.map(s => s.nights);
        const hoursArr = staffStats.map(s => s.hours);
        const holidaysArr = staffStats.map(s => s.holidays);

        metrics.hoursDiff = this.calcStdDev(hoursArr);
        metrics.nightDiff = nightsArr.length > 0 ? (Math.max(...nightsArr) - Math.min(...nightsArr)) : 0;
        metrics.holidayDiff = this.calcStdDev(holidaysArr);

        // 2. 滿意度
        metrics.wishRate = totalWish === 0 ? 0 : Math.round((1 - metWish/totalWish) * 100);
        metrics.prefRate = totalPref === 0 ? 0 : Math.round((1 - metPref/totalPref) * 100);

        // 3. 疲勞度
        metrics.consWork = consWorkViolations;
        metrics.nToD = nToDCount;
        metrics.offTargetRate = staffList.length === 0 ? 0 : Math.round((1 - holidayTargetMetCount/staffList.length) * 100);
        
        const excludeBatchWeekly = config.fatigue?.subs?.weeklyNight?.excludeBatch === true;
        const weeklyStats = excludeBatchWeekly 
            ? staffStats.filter(s => !s.isBatch) 
            : staffStats;
            
        const weeklyNights = weeklyStats.map(s => s.nights / 4);
        metrics.weeklyNight = this.calcStdDev(weeklyNights);

        // 4. 效率
        metrics.shortageRate = totalShiftsNeeded === 0 ? 0 : Math.round(((totalShiftsNeeded - totalShiftsFilled) / totalShiftsNeeded) * 100);
        metrics.seniorDist = totalDailyShifts === 0 ? 0 : Math.round((seniorViolations / totalDailyShifts) * 100);
        metrics.juniorDist = totalDailyShifts === 0 ? 0 : Math.round((juniorViolations / totalDailyShifts) * 100);

        // 5. 成本
        metrics.overtimeRate = totalShiftsFilled === 0 ? 0 : Math.round((overtimeManDays / totalShiftsFilled) * 100);

        return metrics;
    }

    // --- 輔助函式 ---
    static calcStdDev(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return parseFloat(Math.sqrt(variance).toFixed(2));
    }

    static getTieredScore(value, tiers) {
        if (!tiers || tiers.length === 0) return { score: 0, label: '未設定' };
        for (const t of tiers) {
            if (value <= t.limit) return { score: t.score, label: t.label };
        }
        const last = tiers[tiers.length - 1];
        return { score: last.score, label: last.label };
    }

    static formatValue(key, val) {
        if (['prefRate', 'wishRate', 'offTargetRate', 'shortageRate', 'seniorDist', 'juniorDist', 'overtimeRate'].includes(key)) {
            return val + '%';
        }
        if (key === 'nightDiff') return '差 ' + val;
        return val;
    }
}
