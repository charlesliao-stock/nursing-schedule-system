export class ScoringService {
    
    /**
     * 1. 定義預設評分設定 (14 項指標)
     */
    static getDefaultConfig() {
        return {
            fairness: {
                label: "1. 公平性指標",
                subs: {
                    hoursDiff: { 
                        label: "(1) 工時差異 (標準差)", desc: "所有員工工時與平均工時的標準差差異程度", weight: 10, enabled: true, 
                        tiers: [{limit: 2, score: 100}, {limit: 4, score: 80}, {limit: 6, score: 60}, {limit: 8, score: 40}, {limit: 999, score: 20}]
                    },
                    nightDiff: { 
                        label: "(2) 夜班差異 (次)", desc: "員工之間夜班天數差異程度 (Max - Min)", weight: 10, enabled: true,
                        tiers: [{limit: 1, score: 100}, {limit: 2, score: 80}, {limit: 3, score: 60}, {limit: 4, score: 40}, {limit: 999, score: 20}]
                    },
                    holidayDiff: {
                        label: "(3) 假日差異 (天)", desc: "員工之間假日放假天數差異程度 (Max - Min)", weight: 10, enabled: true,
                        tiers: [{limit: 1, score: 100}, {limit: 2, score: 80}, {limit: 3, score: 60}, {limit: 4, score: 40}, {limit: 999, score: 20}]
                    }
                }
            },
            satisfaction: {
                label: "2. 滿意度指標",
                subs: {
                    prefRate: { 
                        label: "(1) 排班偏好滿足度 (%)", desc: "排班的結果符合員工偏好的程度", weight: 15, enabled: true,
                        // 這裡邏輯是：數值 >= X 得分。為了統一 getTieredScore (<=)，我們計算「未滿足率」
                        // 未滿足率 <= 10 (即滿足 >= 90) -> 100分
                        tiers: [{limit: 10, score: 100}, {limit: 20, score: 80}, {limit: 30, score: 60}, {limit: 40, score: 40}, {limit: 100, score: 20}]
                    },
                    wishRate: { 
                        label: "(2) 預班達成率 (%)", desc: "排假的結果符合員工預班OFF的程度", weight: 10, enabled: true,
                        // 同上，計算「未達成率」
                        tiers: [{limit: 5, score: 100}, {limit: 10, score: 80}, {limit: 15, score: 60}, {limit: 20, score: 40}, {limit: 100, score: 20}]
                    }
                }
            },
            fatigue: {
                label: "3. 疲勞度指標",
                subs: {
                    consWork: { 
                        label: "(1) 連續工作>6天 (人次)", desc: "最長連續工作天數達6天(以上)的人次次數", weight: 8, enabled: true,
                        tiers: [{limit: 0, score: 100}, {limit: 2, score: 80}, {limit: 4, score: 60}, {limit: 6, score: 40}, {limit: 999, score: 20}]
                    },
                    nToD: { 
                        label: "(2) 大夜接白 (次)", desc: "前一天大夜，隔天早班的次數", weight: 7, enabled: true,
                        tiers: [{limit: 0, score: 100}, {limit: 3, score: 80}, {limit: 6, score: 60}, {limit: 10, score: 40}, {limit: 999, score: 20}]
                    },
                    offTargetRate: {
                        label: "(3) 休假達標率 (%)", desc: "符合應放天數規定的員工比例", weight: 5, enabled: true,
                        // 計算「未達標率」
                        tiers: [{limit: 0, score: 100}, {limit: 5, score: 80}, {limit: 10, score: 60}, {limit: 15, score: 40}, {limit: 100, score: 20}]
                    },
                    weeklyNight: {
                        label: "(4) 週夜班頻率 (SD)", desc: "每位員工週平均夜班次數的標準差", weight: 5, enabled: true,
                        tiers: [{limit: 0.3, score: 100}, {limit: 0.5, score: 80}, {limit: 0.7, score: 60}, {limit: 1.0, score: 40}, {limit: 999, score: 20}]
                    }
                }
            },
            efficiency: {
                label: "4. 排班效率",
                subs: {
                    shortageRate: {
                        label: "(1) 缺班率 (%)", desc: "未成功分配人員的班次比例", weight: 8, enabled: true,
                        tiers: [{limit: 0, score: 100}, {limit: 2, score: 80}, {limit: 5, score: 60}, {limit: 10, score: 40}, {limit: 100, score: 20}]
                    },
                    seniorDist: {
                        label: "(2) 資深分佈合理性 (%)", desc: "各班至少1位年資2年以上員工", weight: 4, enabled: true,
                        // 計算「不合理率」
                        tiers: [{limit: 0, score: 100}, {limit: 5, score: 80}, {limit: 10, score: 60}, {limit: 15, score: 40}, {limit: 100, score: 20}]
                    },
                    juniorDist: {
                        label: "(3) 資淺分佈合理性 (%)", desc: "各班最多1位年資2年以下員工", weight: 3, enabled: true,
                        // 計算「不合理率」
                        tiers: [{limit: 0, score: 100}, {limit: 10, score: 80}, {limit: 20, score: 60}, {limit: 30, score: 40}, {limit: 100, score: 20}]
                    }
                }
            },
            cost: {
                label: "5. 成本控制",
                subs: {
                    overtimeRate: {
                        label: "(1) 加班費比率 (%)", desc: "加班班數佔總班數的比例", weight: 5, enabled: true,
                        tiers: [{limit: 3, score: 100}, {limit: 5, score: 80}, {limit: 8, score: 60}, {limit: 12, score: 40}, {limit: 100, score: 20}]
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
        
        // 計算所有原始指標
        const metrics = this.calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule);

        let totalScore = 0;
        let totalMax = 0;
        const details = {};

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
                            desc: sub.desc // 傳遞描述供顯示
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
    static calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule) {
        const metrics = {};
        const req = unitSettings?.staffRequirements || {};
        const shiftCodes = unitSettings?.settings?.shifts ? unitSettings.settings.shifts.map(s=>s.code) : ['D','E','N'];
        const submissions = preSchedule?.submissions || {};
        const requiredOffDays = unitSettings?.rules?.minOffDays || 8;

        // 統計變數
        let totalShiftsFilled = 0;
        let totalShiftsNeeded = 0;
        let seniorViolations = 0;
        let juniorViolations = 0;
        let totalDailyShifts = 0; // 總班次數 (分母)

        // 1. 每日掃描
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(new Date().getFullYear(), new Date().getMonth(), d);
            const dayOfWeek = (d % 7); // 簡化
            
            // 需求
            shiftCodes.forEach(s => {
                totalShiftsNeeded += (req[s]?.[dayOfWeek] || 0);
            });

            // 實際
            const dailyAssign = { D: [], E: [], N: [] };
            Object.keys(assignments).forEach(uid => {
                const shift = assignments[uid][d];
                if (shift && dailyAssign[shift]) {
                    const staff = staffList.find(s => s.uid === uid);
                    if (staff) dailyAssign[shift].push(staff);
                    totalShiftsFilled++;
                    totalDailyShifts++;
                }
            });

            // 資深/資淺檢查
            ['D', 'E', 'N'].forEach(s => {
                const staffInShift = dailyAssign[s] || [];
                if (staffInShift.length > 0) {
                    // 假設 yearOfExp 為年資，若無則預設 3
                    const seniors = staffInShift.filter(st => (st.years || 3) > 2).length;
                    const juniors = staffInShift.filter(st => (st.years || 3) <= 2).length;
                    
                    if (seniors < 1) seniorViolations++;
                    if (juniors > 1) juniorViolations++;
                }
            });
        }

        // 2. 個人掃描
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

            let hours = 0, nights = 0, holidays = 0, off = 0;
            let cons = 0;
            let prev = 'OFF';

            for (let d = 1; d <= daysInMonth; d++) {
                const shift = row[d] || 'OFF';
                const isWork = shift !== 'OFF' && shift !== 'M_OFF';

                if (isWork) {
                    hours += 8;
                    cons++;
                    if(['N','E'].includes(shift)) nights++;
                } else {
                    cons = 0;
                    off++;
                    if(d % 7 === 0 || d % 7 === 6) holidays++;
                }

                if (cons === 6) consWorkViolations++; // 達 6 天算一次 (連續更多天不再重複計，或可改邏輯)
                if (prev === 'N' && shift === 'D') nToDCount++;
                prev = shift;
            }

            staffStats.push({ hours, nights, holidays });

            if (off >= requiredOffDays) holidayTargetMetCount++;
            if (off < requiredOffDays) overtimeManDays += (requiredOffDays - off);

            // 預班 (OFF)
            Object.entries(wishes).forEach(([d, w]) => {
                if (w === 'OFF' || w === 'M_OFF') {
                    totalWish++;
                    if (row[d] === 'OFF' || row[d] === 'M_OFF') metWish++;
                }
            });

            // 偏好 (P1)
            if (prefs.priority1) {
                totalPref++;
                if (Object.values(row).includes(prefs.priority1)) metPref++;
            }
        });

        // 3. 計算結果
        const hoursArr = staffStats.map(s => s.hours);
        const nightsArr = staffStats.map(s => s.nights);
        const holidaysArr = staffStats.map(s => s.holidays);

        // 公平性
        metrics.hoursDiff = this.calcStdDev(hoursArr);
        metrics.nightDiff = Math.max(...nightsArr) - Math.min(...nightsArr);
        metrics.holidayDiff = Math.max(...holidaysArr) - Math.min(...holidaysArr);

        // 滿意度 (轉為未達成率/未滿足率)
        metrics.wishRate = totalWish === 0 ? 0 : Math.round((1 - metWish/totalWish) * 100);
        metrics.prefRate = totalPref === 0 ? 0 : Math.round((1 - metPref/totalPref) * 100);

        // 疲勞度
        metrics.consWork = consWorkViolations;
        metrics.nToD = nToDCount;
        metrics.offTargetRate = staffList.length === 0 ? 0 : Math.round((1 - holidayTargetMetCount/staffList.length) * 100);
        
        // 週夜班頻率標準差 (總夜班/4週/人數 的標準差? 題目定義為標準差)
        const weeklyNights = nightsArr.map(n => n / 4);
        metrics.weeklyNight = this.calcStdDev(weeklyNights);

        // 效率
        metrics.shortageRate = totalShiftsNeeded === 0 ? 0 : Math.round(((totalShiftsNeeded - totalShiftsFilled) / totalShiftsNeeded) * 100);
        metrics.seniorDist = totalDailyShifts === 0 ? 0 : Math.round((seniorViolations / totalDailyShifts) * 100); // 不合理率
        metrics.juniorDist = totalDailyShifts === 0 ? 0 : Math.round((juniorViolations / totalDailyShifts) * 100); // 不合理率

        // 成本 (加班費比率)
        metrics.overtimeRate = totalShiftsFilled === 0 ? 0 : Math.round((overtimeManDays / totalShiftsFilled) * 100);

        return metrics;
    }

    // --- 輔助 ---
    static calcStdDev(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return parseFloat(Math.sqrt(variance).toFixed(2));
    }

    static getTieredScore(value, tiers) {
        if (!tiers || tiers.length === 0) return { score: 0, label: '未設定' };
        for (const t of tiers) {
            if (value <= t.limit) return { score: t.score, label: t.label || t.score + '分' };
        }
        const last = tiers[tiers.length - 1];
        return { score: last.score, label: last.label || last.score + '分' };
    }

    static formatValue(key, val) {
        if (['prefRate', 'wishRate', 'offTargetRate', 'shortageRate', 'seniorDist', 'juniorDist', 'overtimeRate'].includes(key)) {
            return val + '%'; // 這些是比率
        }
        if (key.includes('Diff') && !key.includes('hours')) return '差 ' + val; // 次數/天數差
        return val;
    }
}
