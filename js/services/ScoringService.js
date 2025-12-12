export class ScoringService {

    /**
     * 計算排班品質總分
     */
    static calculate(scheduleData, staffList, rules, preSchedule) {
        const assignments = scheduleData.assignments || {};
        const year = scheduleData.year;
        const month = scheduleData.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // 取得評分設定 (若無則使用預設)
        const config = rules.scoringConfig || this.getDefaultConfig();
        
        // 1. 基礎數據統計
        const stats = this.analyzeSchedule(assignments, staffList, year, month, daysInMonth);

        // 2. 計算各項得分
        const scores = {
            hardConstraints: this.calcHardConstraints(stats),
            fairness: this.calcFairness(stats, config.fairness),
            satisfaction: this.calcSatisfaction(stats, config.satisfaction, preSchedule),
            efficiency: this.calcEfficiency(stats, config.efficiency, rules, daysInMonth),
            health: this.calcHealth(stats, config.health),
            quality: this.calcQuality(stats, config.quality, daysInMonth),
            cost: this.calcCost(stats, config.cost, daysInMonth, staffList.length)
        };

        // 3. 計算加權總分
        let totalScore = 0;
        let totalWeight = 0;
        const isPassed = scores.hardConstraints.passed;

        ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(cat => {
            if (config[cat] && config[cat].enabled) {
                totalScore += scores[cat].score * (config[cat].weight / 100);
                totalWeight += config[cat].weight;
            }
        });

        // 正規化
        const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

        return {
            totalScore: Math.round(normalizedScore * 10) / 10,
            details: scores,
            passed: isPassed
        };
    }

    static analyzeSchedule(assignments, staffList, year, month, daysInMonth) {
        const staffStats = {};
        const dailyStats = {}; 
        for(let d=1; d<=daysInMonth; d++) dailyStats[d] = { D:0, E:0, N:0, total:0, senior:0, junior:0 };

        staffList.forEach(staff => {
            const uid = staff.uid;
            const shifts = assignments[uid] || {};
            const isBatch = staff.constraints?.canBatch;
            
            const hireDate = staff.hireDate ? new Date(staff.hireDate) : new Date();
            const today = new Date();
            const years = (today - hireDate) / (1000 * 60 * 60 * 24 * 365);
            const isSenior = years >= 2;

            const s = {
                uid, name: staff.name, isBatch, isSenior,
                totalHours: 0,
                shiftCounts: { D:0, E:0, N:0, Holiday:0 },
                consecutive: [], 
                nightShifts: 0,
                quickReturns: 0,
                offDays: 0
            };

            let currentConsecutive = 0;
            let prevShift = null;

            for(let d=1; d<=daysInMonth; d++) {
                const shift = shifts[d];
                const date = new Date(year, month - 1, d);
                const w = date.getDay();
                const isHoliday = (w === 0 || w === 6); 

                if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                    s.totalHours += 8; 
                    s.shiftCounts[shift] = (s.shiftCounts[shift] || 0) + 1;
                    if(isHoliday) s.shiftCounts.Holiday++;
                    if(shift === 'E' || shift === 'N') s.nightShifts++;

                    if(dailyStats[d][shift] !== undefined) dailyStats[d][shift]++;
                    dailyStats[d].total++;
                    if(isSenior) dailyStats[d].senior++; else dailyStats[d].junior++;

                    currentConsecutive++;

                    if (prevShift && (prevShift === 'N' || prevShift === 'E') && shift === 'D') {
                        s.quickReturns++;
                    }
                } else {
                    if(currentConsecutive > 0) s.consecutive.push(currentConsecutive);
                    currentConsecutive = 0;
                    s.offDays++;
                }
                prevShift = shift;
            }
            if(currentConsecutive > 0) s.consecutive.push(currentConsecutive);
            staffStats[uid] = s;
        });

        return { staffStats, dailyStats, staffCount: staffList.length };
    }

    static getW(config, key) {
        return (config && config.subs && config.subs[key] && config.subs[key].enabled) 
            ? config.subs[key].weight : 0;
    }

    static calcHardConstraints(stats) {
        let passed = true;
        const logs = [];
        Object.values(stats.staffStats).forEach(s => {
            if (s.offDays < 4) { passed = false; logs.push(`${s.name} 休假不足`); }
            if (s.quickReturns > 0) { passed = false; logs.push(`${s.name} 休息不足 (接班)`); }
        });
        return { score: passed ? 100 : 0, passed, logs };
    }

    static calcFairness(stats, cfg) {
        const wHours = this.getW(cfg, 'hours');
        const wShifts = this.getW(cfg, 'shifts');
        let rawScore = 0;
        const details = {};
        const values = Object.values(stats.staffStats);

        if (wHours > 0 && values.length > 0) {
            const hours = values.map(s => s.totalHours);
            const mean = hours.reduce((a,b)=>a+b,0) / hours.length;
            const sd = Math.sqrt(hours.map(x => Math.pow(x - mean, 2)).reduce((a,b)=>a+b,0) / hours.length);
            const s = this.mapScore(sd, [2, 4, 6, 8], [100, 90, 70, 50, 20]);
            rawScore += s * (wHours / 100);
            details.hoursSD = sd.toFixed(1);
        }

        if (wShifts > 0) {
            const nonBatch = values.filter(s => !s.isBatch);
            let sPoints = 100;
            if(nonBatch.length > 0) {
                const hols = nonBatch.map(s => s.shiftCounts.Holiday);
                const diffH = Math.max(...hols) - Math.min(...hols);
                const scoreH = this.mapScore(diffH, [1, 2, 3, 4], [100, 85, 60, 35, 10]);
                sPoints = scoreH; 
            }
            rawScore += sPoints * (wShifts / 100);
        }
        return { score: rawScore, ...details };
    }

    static calcSatisfaction(stats, cfg, preSchedule) {
        const wPref = this.getW(cfg, 'pref');
        const wCons = this.getW(cfg, 'consecutive');
        let rawScore = 0;
        const details = {};

        if (wPref > 0) {
            // 暫時模擬
            const s = 85; 
            rawScore += s * (wPref / 100);
        }

        if (wCons > 0) {
            let maxC = 0;
            Object.values(stats.staffStats).forEach(s => {
                const m = Math.max(...(s.consecutive.length?s.consecutive:[0]));
                if(m > maxC) maxC = m;
            });
            const s = this.mapScore(maxC, [5, 6, 7, 9], [100, 80, 60, 35, 0]);
            rawScore += s * (wCons / 100);
            details.maxConsecutive = maxC;
        }
        return { score: rawScore, ...details };
    }

    static calcEfficiency(stats, cfg, rules, daysInMonth) {
        const wCov = this.getW(cfg, 'coverage');
        if (wCov === 0) return { score: 0 };
        
        let reqTotal = 0, fillTotal = 0;
        const req = rules.staffRequirements || { D:{}, E:{}, N:{} };
        for(let d=1; d<=daysInMonth; d++) {
            const w = (d % 7);
            const r = (req.D?.[w]||0) + (req.E?.[w]||0) + (req.N?.[w]||0);
            reqTotal += r;
            fillTotal += stats.dailyStats[d].total;
        }
        const cov = reqTotal > 0 ? (fillTotal / reqTotal)*100 : 100;
        let s = cov >= 100 ? 100 : (cov >= 95 ? 80 : 50);
        return { score: s * (wCov / 100), coverage: cov.toFixed(1)+'%' };
    }

    static calcHealth(stats, cfg) {
        const wNight = this.getW(cfg, 'night');
        let rawScore = 0;
        if (wNight > 0) {
            let violations = 0;
            Object.values(stats.staffStats).filter(s=>!s.isBatch).forEach(s => {
                if((s.nightShifts/4) > 2) violations++;
            });
            const s = violations === 0 ? 100 : 60;
            rawScore += s * (wNight / 100);
        }
        return { score: rawScore };
    }

    static calcQuality(stats, cfg, daysInMonth) {
        const wExp = this.getW(cfg, 'exp');
        if (wExp === 0) return { score: 0 };
        let good = 0;
        for(let d=1; d<=daysInMonth; d++) {
            if(stats.dailyStats[d].senior >= 1) good++;
        }
        const ratio = (good / daysInMonth) * 100;
        let s = ratio >= 100 ? 100 : 60;
        return { score: s * (wExp / 100), ratio: ratio.toFixed(0)+'%' };
    }

    static calcCost(stats, cfg, daysInMonth, staffCount) {
        const wOver = this.getW(cfg, 'overtime');
        if (wOver === 0) return { score: 0 };
        let over = 0;
        Object.values(stats.staffStats).forEach(s => {
            if (s.offDays < 8) over += (8 - s.offDays);
        });
        const s = this.mapScore(over, [0, 5, 10], [100, 80, 50, 0]);
        return { score: s * (wOver / 100), overtimeDays: over };
    }

    static mapScore(val, thres, scores) {
        for(let i=0; i<thres.length; i++) {
            if(val <= thres[i]) return scores[i];
        }
        return scores[scores.length-1];
    }

    static getDefaultConfig() {
        return {
            hard: { enabled: true, weight: 0 },
            fairness: { label: '公平性', subs: { hours: {label:'工時標準差', weight:15, enabled:true}, shifts: {label:'班次均勻度', weight:15, enabled:true} } },
            satisfaction: { label: '滿意度', subs: { pref: {label:'偏好滿足', weight:15, enabled:true}, consecutive: {label:'連續工作', weight:10, enabled:true} } },
            efficiency: { label: '效率', subs: { coverage: {label:'班次覆蓋率', weight:20, enabled:true} } },
            health: { label: '健康', subs: { night: {label:'夜班頻率', weight:8, enabled:true}, quick: {label:'早晚交替', weight:5, enabled:true}, leave: {label:'休假達標', weight:2, enabled:true} } },
            quality: { label: '品質', subs: { exp: {label:'經驗分布', weight:10, enabled:true} } },
            cost: { label: '成本', subs: { overtime: {label:'加班比例', weight:10, enabled:false} } }
        };
    }
}
