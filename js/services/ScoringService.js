// js/services/ScoringService.js

export class ScoringService {

    static calculate(scheduleData, staffList, rules, preSchedule) {
        const assignments = scheduleData.assignments || {};
        const year = scheduleData.year;
        const month = scheduleData.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // 取得設定 (含子項目權重)
        const config = rules.scoringConfig || this.getDefaultConfig();
        
        // 1. 基礎數據統計
        const stats = this.analyzeSchedule(assignments, staffList, year, month, daysInMonth);

        // 2. 計算各項得分 (傳入對應的 sub-config)
        const scores = {
            hardConstraints: this.calcHardConstraints(stats),
            fairness: this.calcFairness(stats, config.fairness),
            satisfaction: this.calcSatisfaction(stats, config.satisfaction, preSchedule),
            efficiency: this.calcEfficiency(stats, config.efficiency, rules, daysInMonth),
            health: this.calcHealth(stats, config.health),
            quality: this.calcQuality(stats, config.quality, daysInMonth),
            cost: this.calcCost(stats, config.cost, daysInMonth, staffList.length)
        };

        // 3. 計算總分 (Sum of enabled sub-weights)
        let totalScore = 0;
        let totalMaxWeight = 0;

        // 若違反硬性約束，標記
        const isPassed = scores.hardConstraints.passed;

        ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(catKey => {
            const catScoreObj = scores[catKey];
            // 大分類分數已是該分類下所有子項目的加權和
            totalScore += catScoreObj.score; 
            
            // 計算該分類的啟用總權重 (用於正規化? 或者是直接累加)
            // 根據需求 "計分項目可調整設定"，假設各小項權重加總即為總分 (理想100)
            // 這裡直接累加計算出的 score 即可 (因為 score 已經乘過權重)
        });

        // 檢查總權重是否為 100? 若使用者設定總和只有 80，那滿分就是 80
        // 若需正規化到 100:
        // const normalized = (totalScore / userConfiguredTotalWeight) * 100
        // 為簡單起見，直接顯示累加分
        
        return {
            totalScore: Math.round(totalScore * 10) / 10,
            details: scores,
            passed: isPassed
        };
    }

    // ... analyzeSchedule (同上一版，請保留) ...
    static analyzeSchedule(assignments, staffList, year, month, daysInMonth) {
        const staffStats = {};
        const dailyStats = {}; 
        for(let d=1; d<=daysInMonth; d++) dailyStats[d] = { D:0, E:0, N:0, total:0, senior:0, junior:0 };

        staffList.forEach(staff => {
            const uid = staff.uid;
            const shifts = assignments[uid] || {};
            const isBatch = staff.constraints?.canBatch;
            const hireDate = staff.hireDate ? new Date(staff.hireDate) : new Date();
            const years = (new Date() - hireDate) / (1000 * 60 * 60 * 24 * 365);
            const isSenior = years >= 2;

            const s = {
                uid, name: staff.name, isBatch, isSenior,
                totalHours: 0,
                shiftCounts: { D:0, E:0, N:0, Holiday:0 },
                consecutive: [], 
                nightShifts: 0,
                quickReturns: 0,
                offDays: 0,
                prefsMet: 0, prefsTotal: 0 // 偏好
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

                    // Quick Return (N/E -> D)
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

    // Helper: 取得權重 (若未啟用則回傳 0)
    static getW(config, key) {
        return (config && config.subs && config.subs[key] && config.subs[key].enabled) 
            ? config.subs[key].weight : 0;
    }

    // 1. 硬性約束
    static calcHardConstraints(stats) {
        let passed = true;
        const logs = [];
        Object.values(stats.staffStats).forEach(s => {
            if (s.offDays < 4) { passed = false; logs.push(`${s.name} 休假不足`); }
            if (s.quickReturns > 0) { passed = false; logs.push(`${s.name} 休息不足 (接班)`); }
        });
        return { score: passed ? 100 : 0, passed, logs };
    }

    // 2. 公平性 (工時 + 班次)
    static calcFairness(stats, cfg) {
        const wHours = this.getW(cfg, 'hours');
        const wShifts = this.getW(cfg, 'shifts');
        let rawScore = 0;
        const details = {};

        const values = Object.values(stats.staffStats);

        // 1.1 工時標準差
        if (wHours > 0) {
            const hours = values.map(s => s.totalHours);
            const mean = hours.reduce((a,b)=>a+b,0) / hours.length;
            const sd = Math.sqrt(hours.map(x => Math.pow(x - mean, 2)).reduce((a,b)=>a+b,0) / hours.length);
            const s = this.mapScore(sd, [2, 4, 6, 8], [100, 80, 60, 40, 0]); // 依需求調整分數
            rawScore += s * (wHours / 100); // 轉換為佔總分的比例
            details.hoursSD = sd.toFixed(1);
        }

        // 1.2 班次均勻度 (含假日)
        if (wShifts > 0) {
            const nonBatch = values.filter(s => !s.isBatch);
            let sPoints = 100;
            if(nonBatch.length > 0) {
                // 假日差異 (40%)
                const hols = nonBatch.map(s => s.shiftCounts.Holiday);
                const diffH = Math.max(...hols) - Math.min(...hols);
                const scoreH = this.mapScore(diffH, [1, 2, 3, 4], [100, 75, 50, 25, 0]);
                
                // 一般差異 (60%)
                const norms = nonBatch.map(s => s.shiftCounts.D + s.shiftCounts.E + s.shiftCounts.N);
                const diffN = Math.max(...norms) - Math.min(...norms);
                const scoreN = this.mapScore(diffN, [1, 2, 3, 4], [100, 80, 60, 40, 0]);
                
                sPoints = (scoreN * 0.6) + (scoreH * 0.4);
            }
            rawScore += sPoints * (wShifts / 100);
        }
        
        return { score: rawScore, ...details };
    }

    // 3. 滿意度
    static calcSatisfaction(stats, cfg, preSchedule) {
        const wPref = this.getW(cfg, 'pref');
        const wCons = this.getW(cfg, 'consecutive');
        let rawScore = 0;
        const details = {};

        // 2.1 偏好
        if (wPref > 0) {
            // 這裡做簡易模擬：假設滿足度 80%
            // 實作需比對 preSchedule wishes vs actual assignments
            const s = 80; 
            rawScore += s * (wPref / 100);
        }

        // 2.2 連續工作
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

    // 4. 效率
    static calcEfficiency(stats, cfg, rules, daysInMonth) {
        const wCov = this.getW(cfg, 'coverage');
        if (wCov === 0) return { score: 0 };

        const req = rules.staffRequirements || { D:{}, E:{}, N:{} };
        let reqTotal = 0, fillTotal = 0;

        for(let d=1; d<=daysInMonth; d++) {
            const w = (d % 7); // 簡易週計算
            const r = (req.D?.[w]||0) + (req.E?.[w]||0) + (req.N?.[w]||0);
            reqTotal += r;
            fillTotal += stats.dailyStats[d].total;
        }
        const cov = reqTotal > 0 ? (fillTotal / reqTotal)*100 : 100;
        
        // 100=100, 98=85, 95=70, 90=50, <90=0
        let s = 0;
        if(cov >= 100) s=100;
        else if(cov >= 98) s=85;
        else if(cov >= 95) s=70;
        else if(cov >= 90) s=50;
        
        return { score: s * (wCov / 100), coverage: cov.toFixed(1)+'%' };
    }

    // 5. 健康
    static calcHealth(stats, cfg) {
        const wNight = this.getW(cfg, 'night');
        const wQuick = this.getW(cfg, 'quick');
        const wLeave = this.getW(cfg, 'leave');
        let rawScore = 0;
        const details = {};

        // 4.1 夜班頻率
        if (wNight > 0) {
            let violations = 0;
            Object.values(stats.staffStats).filter(s=>!s.isBatch).forEach(s => {
                if((s.nightShifts/4) > 2) violations++; // > 2次/週
            });
            // 簡易給分
            const s = violations === 0 ? 100 : (violations < 3 ? 60 : 0);
            rawScore += s * (wNight / 100);
        }

        // 4.2 早晚交替
        if (wQuick > 0) {
            let qCount = 0;
            Object.values(stats.staffStats).forEach(s => qCount += s.quickReturns);
            const s = this.mapScore(qCount, [0, 1, 3, 4], [100, 80, 60, 35, 0]);
            rawScore += s * (wQuick / 100);
            details.quickReturns = qCount;
        }

        // 4.3 休假達標 (假設都達標)
        if (wLeave > 0) rawScore += 100 * (wLeave / 100);

        return { score: rawScore, ...details };
    }

    // 6. 品質
    static calcQuality(stats, cfg, daysInMonth) {
        const wExp = this.getW(cfg, 'exp');
        if (wExp === 0) return { score: 0 };

        let good = 0;
        for(let d=1; d<=daysInMonth; d++) {
            if(stats.dailyStats[d].senior >= 1) good++;
        }
        const ratio = (good / daysInMonth) * 100;
        let s = 0;
        if(ratio >= 100) s=100;
        else if(ratio >= 95) s=85;
        else if(ratio >= 90) s=70;
        else if(ratio >= 80) s=50;

        return { score: s * (wExp / 100), ratio: ratio.toFixed(0)+'%' };
    }

    // 7. 成本
    static calcCost(stats, cfg, daysInMonth, staffCount) {
        const wOver = this.getW(cfg, 'overtime');
        if (wOver === 0) return { score: 0 };

        const reqOff = 8; 
        const stdWork = daysInMonth - reqOff;
        let over = 0;
        Object.values(stats.staffStats).forEach(s => {
            const w = daysInMonth - s.offDays;
            if(w > stdWork) over += (w - stdWork);
        });

        const s = this.mapScore(over, [0, 5, 10, 15], [100, 85, 70, 50, 0]);
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
            fairness: { label: '公平性', subs: { hours: {label:'工時標準差', weight:15, enabled:true}, shifts: {label:'班次均勻度', weight:15, enabled:true} } },
            satisfaction: { label: '滿意度', subs: { pref: {label:'偏好滿足', weight:15, enabled:true}, consecutive: {label:'連續工作', weight:10, enabled:true} } },
            efficiency: { label: '效率', subs: { coverage: {label:'班次覆蓋率', weight:20, enabled:true} } },
            health: { label: '健康', subs: { night: {label:'夜班頻率', weight:8, enabled:true}, quick: {label:'早晚交替', weight:5, enabled:true}, leave: {label:'休假達標', weight:2, enabled:true} } },
            quality: { label: '品質', subs: { exp: {label:'經驗分布', weight:10, enabled:true} } },
            cost: { label: '成本', subs: { overtime: {label:'加班比例', weight:10, enabled:false} } }
        };
    }
}
