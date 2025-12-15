export class ScoringService {
    
    // 定義預設結構 (含預設 Tiers)
    static getDefaultConfig() {
        return {
            efficiency: {
                label: "效率 (人力)",
                subs: {
                    lackDays: { 
                        label: "缺人天數", weight: 20, enabled: true, 
                        tiers: [{limit:0, score:100, label:'優秀'}, {limit:2, score:80, label:'良好'}, {limit:5, score:60, label:'普通'}, {limit:99, score:40, label:'差'}] 
                    },
                    severeLack: { 
                        label: "嚴重缺口(≥2)", weight: 20, enabled: true,
                        tiers: [{limit:0, score:100, label:'優秀'}, {limit:0, score:60, label:'不佳'}]
                    }
                }
            },
            satisfaction: {
                label: "滿意度 (偏好)",
                subs: {
                    wishRate: { 
                        label: "預班達成率", weight: 20, enabled: true,
                        // 特殊邏輯：數值越大越好，這裡用反向思考：未達成率 <= X
                        // 或簡單處理：我們計算「未達成率(%)」傳入
                        tiers: [{limit:2, score:100, label:'優秀'}, {limit:10, score:80, label:'良好'}, {limit:20, score:60, label:'普通'}]
                    },
                    violateNo: { 
                        label: "違反勿排", weight: 10, enabled: true,
                        tiers: [{limit:0, score:100, label:'優秀'}, {limit:1, score:60, label:'普通'}, {limit:99, score:0, label:'嚴重'}]
                    }
                }
            },
            fairness: {
                label: "公平性",
                subs: {
                    diffTotal: { 
                        label: "總班數差異", weight: 10, enabled: true,
                        tiers: [{limit:1, score:100, label:'優秀'}, {limit:2, score:80, label:'良好'}, {limit:4, score:60, label:'普通'}, {limit:6, score:40, label:'差'}]
                    },
                    diffNight: { 
                        label: "夜班數差異", weight: 10, enabled: true,
                        tiers: [{limit:1, score:100, label:'優秀'}, {limit:3, score:80, label:'良好'}, {limit:5, score:60, label:'普通'}]
                    }
                }
            },
            health: {
                label: "健康 (法規)",
                subs: {
                    nToD: { 
                        label: "N接D (疲勞)", weight: 10, enabled: true,
                        tiers: [{limit:0, score:100, label:'優秀'}, {limit:0, score:40, label:'危險'}]
                    }
                }
            }
        };
    }

    static calculate(schedule, staffList, unitSettings, preSchedule) {
        if (!schedule || !schedule.assignments) return { totalScore: 0, details: {} };

        const assignments = schedule.assignments;
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        
        // 使用單位設定，若無則用預設
        const config = unitSettings.scoringConfig || this.getDefaultConfig();
        
        // 1. 計算所有原始數據 (Raw Metrics)
        const metrics = this.calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule);

        let totalScore = 0;
        let totalMax = 0;
        const details = {};

        // 2. 根據 Config 與 Metrics 計算分數
        Object.keys(config).forEach(catKey => {
            const catConfig = config[catKey];
            const subItems = [];
            let catMax = 0;
            let catScoreSum = 0;

            if (catConfig.subs) {
                Object.keys(catConfig.subs).forEach(subKey => {
                    const sub = catConfig.subs[subKey];
                    if (sub.enabled) {
                        const rawValue = metrics[subKey] || 0; // 取得該項目的原始數值 (如: 3天)
                        
                        // 根據 Tiers 轉換分數
                        const tier = this.getTieredScore(rawValue, sub.tiers);
                        
                        // 加權計算
                        // 該細項得分 = (階梯分數 / 100) * 權重
                        const weight = parseInt(sub.weight) || 0;
                        const itemScore = (tier.score / 100) * weight;

                        catMax += weight;
                        catScoreSum += itemScore;

                        subItems.push({
                            name: sub.label,
                            value: this.formatValue(subKey, rawValue),
                            score: tier.score, // 顯示階梯分數 (0-100)
                            grade: tier.label
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

        return {
            totalScore: Math.round(totalScore),
            totalMax: totalMax,
            passed: totalScore >= (totalMax * 0.6),
            details: details
        };
    }

    static getTieredScore(value, tiers) {
        if (!tiers || tiers.length === 0) return { score: 0, label: '未設定' };
        // 假設 tiers 已排序 (由小到大)
        for (const t of tiers) {
            if (value <= t.limit) return { score: t.score, label: t.label };
        }
        // 超過最大限制，回傳最後一個 (通常是最差)
        const last = tiers[tiers.length - 1];
        return { score: last.score, label: last.label };
    }

    static formatValue(key, val) {
        if (key.includes('Rate')) return val + '% (未達成)';
        if (key.includes('diff')) return '差異 ' + val;
        return val + ' 次/天';
    }

    // ==========================================
    //  計算所有原始指標 (Metrics)
    // ==========================================
    static calculateMetrics(assignments, staffList, daysInMonth, unitSettings, preSchedule) {
        const req = unitSettings?.staffRequirements || {};
        const shiftCodes = unitSettings?.settings?.shifts ? unitSettings.settings.shifts.map(s=>s.code) : ['D','E','N'];
        const submissions = preSchedule?.submissions || {};

        let lackDays = 0, severeLack = 0;
        let nToD = 0;
        let wishMiss = 0, totalWish = 0, violateNo = 0;

        // 1. 每日檢查 (效率、健康)
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = (d % 7); 
            const counts = {};
            shiftCodes.forEach(c => counts[c] = 0);

            Object.values(assignments).forEach(row => {
                const s = row[d];
                if (s && counts[s] !== undefined) counts[s]++;
            });

            let dayLack = 0;
            shiftCodes.forEach(s => {
                const needed = req[s]?.[dayOfWeek] || 0;
                if (needed > 0 && counts[s] < needed) dayLack += (needed - counts[s]);
            });
            if (dayLack > 0) lackDays++;
            if (dayLack >= 2) severeLack++;
        }

        // 2. 個人檢查 (健康、偏好、公平)
        const totalCounts = [];
        const nightCounts = [];

        staffList.forEach(staff => {
            const uid = staff.uid;
            const row = assignments[uid] || {};
            const wishes = submissions[uid]?.wishes || {};
            
            // 統計班數
            const shifts = Object.values(row).filter(v => v && v !== 'OFF' && v !== 'M_OFF');
            totalCounts.push(shifts.length);
            nightCounts.push(shifts.filter(v => v === 'N' || v === 'E').length);

            // 檢查 N-D
            let prev = 'OFF';
            for(let d=1; d<=daysInMonth; d++) {
                const curr = row[d] || 'OFF';
                if (prev === 'N' && curr === 'D') nToD++;
                prev = curr;
            }

            // 檢查偏好
            Object.entries(wishes).forEach(([d, w]) => {
                if (w === 'M_OFF') return;
                totalWish++;
                const actual = row[d];
                if (w.startsWith('NO_')) {
                    if (actual === w.replace('NO_', '')) violateNo++;
                } else {
                    if (actual !== w) wishMiss++;
                }
            });
        });

        const diffTotal = totalCounts.length ? (Math.max(...totalCounts) - Math.min(...totalCounts)) : 0;
        const diffNight = nightCounts.length ? (Math.max(...nightCounts) - Math.min(...nightCounts)) : 0;
        const wishMissRate = totalWish === 0 ? 0 : Math.round((wishMiss / totalWish) * 100);

        return {
            lackDays,       // 缺人天數
            severeLack,     // 嚴重缺口天數
            wishRate: wishMissRate, // 未達成率 (%)
            violateNo,      // 違反勿排次數
            diffTotal,      // 總班數差異
            diffNight,      // 夜班數差異
            nToD            // N接D次數
        };
    }
}
