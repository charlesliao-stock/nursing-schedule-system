// js/services/ScoringService.js

export class ScoringService {

    /**
     * 計算排班品質總分
     * @param {Object} scheduleData 班表資料 { assignments: { uid: { 1: 'D', ... } }, year, month }
     * @param {Array} staffList 人員列表 (需含 hireDate)
     * @param {Object} rules 單位規則 (含 scoringConfig, minStaff)
     * @param {Object} preSchedule 預班資料 (含 preferences)
     */
    static calculate(scheduleData, staffList, rules, preSchedule) {
        const assignments = scheduleData.assignments || {};
        const year = scheduleData.year;
        const month = scheduleData.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // 取得評分設定 (若無則使用預設)
        const config = rules.scoringConfig || this.getDefaultConfig();
        
        // 1. 基礎數據統計 (計算工時、班次、連續天數等)
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

        // 硬性約束若失敗，總分標記為 Fail (或直接歸零，視需求而定)
        // 這裡我們僅標記，分數仍計算其他部分供參考
        const isPassed = scores.hardConstraints.passed;

        // 遍歷主要項目計算加權
        const categories = ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'];
        categories.forEach(cat => {
            if (config[cat] && config[cat].enabled) {
                totalScore += scores[cat].score * (config[cat].weight / 100);
                totalWeight += config[cat].weight;
            }
        });

        // 正規化 (若權重加總不為 100，則按比例放大/縮小回 100分制)
        const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

        return {
            totalScore: Math.round(normalizedScore * 10) / 10, // 小數點一位
            details: scores,
            passed: isPassed
        };
    }

    // ==========================================
    //  分析與統計 (Data Analysis)
    // ==========================================
    static analyzeSchedule(assignments, staffList, year, month, daysInMonth) {
        const staffStats = {};
        const dailyStats = {}; // { 1: { D:0, E:0, N:0, Senior:0, Junior:0 } }

        // Init Daily Stats
        for(let d=1; d<=daysInMonth; d++) {
            dailyStats[d] = { D:0, E:0, N:0, total:0, senior:0, junior:0 };
        }

        staffList.forEach(staff => {
            const uid = staff.uid;
            const shifts = assignments[uid] || {};
            const isBatch = staff.constraints?.canBatch; // 是否包班
            
            // 年資判斷 (預設 2 年 = 730 天)
            const hireDate = staff.hireDate ? new Date(staff.hireDate) : new Date();
            const today = new Date();
            const years = (today - hireDate) / (1000 * 60 * 60 * 24 * 365);
            const isSenior = years >= 2;

            const s = {
                uid, name: staff.name, isBatch, isSenior,
                totalHours: 0,
                shiftCounts: { D:0, E:0, N:0, Holiday:0 },
                consecutive: [], // 紀錄連續上班段落 [3, 2, 5...]
                nightShifts: 0, // 小夜+大夜
                quickReturns: 0, // N->D, E->D
                offDays: 0,
                preferencesMet: 0, // 滿意度用
                preferencesTotal: 0
            };

            let currentConsecutive = 0;
            let prevShift = null;

            for(let d=1; d<=daysInMonth; d++) {
                const shift = shifts[d];
                const date = new Date(year, month - 1, d);
                const w = date.getDay();
                const isHoliday = (w === 0 || w === 6); 

                if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                    // 工時 (假設 D=8, E=8, N=8)
                    s.totalHours += 8; 
                    s.shiftCounts[shift] = (s.shiftCounts[shift] || 0) + 1;
                    if(isHoliday) s.shiftCounts.Holiday++;
                    if(shift === 'E' || shift === 'N') s.nightShifts++;

                    // 每日統計
                    if(dailyStats[d][shift] !== undefined) dailyStats[d][shift]++;
                    dailyStats[d].total++;
                    if(isSenior) dailyStats[d].senior++;
                    else dailyStats[d].junior++;

                    currentConsecutive++;

                    // 早晚交替 (Quick Return): 前一天 N/E 接 今天 D
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

    // ==========================================
    //  各項指標計算 (Metrics Calculation)
    // ==========================================

    // 1. 硬性約束 (門檻)
    static calcHardConstraints(stats) {
        let passed = true;
        const logs = [];

        // 1.1 兩週內須有2個休假 (簡化檢查：月休 < 4天視為不合規)
        // 精確算法應 sliding window 14天，這裡做簡易版
        Object.values(stats.staffStats).forEach(s => {
            if (s.offDays < 4) { 
                passed = false;
                logs.push(`${s.name} 休假不足 (月休${s.offDays}天)`);
            }
        });

        // 1.2 休息時間 (使用 Quick Return 判斷間隔不足)
        Object.values(stats.staffStats).forEach(s => {
            if (s.quickReturns > 0) {
                // 依規則此項不可違反，若有則 Fail
                passed = false;
                logs.push(`${s.name} 違反休息間隔 (${s.quickReturns}次)`);
            }
        });

        return { score: passed ? 100 : 0, passed, logs };
    }

    // 2. 公平性 (30%)
    static calcFairness(stats, config) {
        if (!config.enabled) return { score: 100 };
        const staffValues = Object.values(stats.staffStats);
        
        // 2.1 工時標準差 (15%)
        const hours = staffValues.map(s => s.totalHours);
        const mean = hours.reduce((a,b)=>a+b,0) / hours.length;
        const stdDev = Math.sqrt(hours.map(x => Math.pow(x - mean, 2)).reduce((a,b)=>a+b,0) / hours.length);
        
        const score1 = this.mapScore(stdDev, [2, 4, 6, 8], [100, 90, 70, 50, 20]); 

        // 2.2 班次均勻度 (15%) - 排除包班者
        const nonBatchStaff = staffValues.filter(s => !s.isBatch);
        let score2 = 100;
        
        if (nonBatchStaff.length > 0) {
            // A. 假日班次差異 (40%)
            const holidays = nonBatchStaff.map(s => s.shiftCounts.Holiday);
            const diffH = Math.max(...holidays) - Math.min(...holidays);
            const scoreH = this.mapScore(diffH, [1, 2, 3, 4], [100, 85, 60, 35, 10]);
            
            // B. 一般班次差異 (60%) - 簡化算總班數差異
            const shifts = nonBatchStaff.map(s => (s.shiftCounts.D + s.shiftCounts.E + s.shiftCounts.N));
            const diffS = Math.max(...shifts) - Math.min(...shifts);
            const scoreS = this.mapScore(diffS, [1, 2, 3, 4], [100, 90, 70, 50, 20]);

            score2 = (scoreS * 0.6) + (scoreH * 0.4);
        }

        const weighted = (score1 * 0.5) + (score2 * 0.5);
        return { score: weighted, stdDev: stdDev.toFixed(1) };
    }

    // 3. 員工滿意度 (25%)
    static calcSatisfaction(stats, config, preSchedule) {
        if (!config.enabled) return { score: 100 };
        
        // 3.1 偏好滿足度 (15%) - 這裡需比對 PreSchedule 的 assignments
        // 由於傳入的 scheduleData 已經是 assignments，這裡簡化假設 85 分，
        // 若要精確需在此遍歷 preSchedule.submissions 並比對實際排班
        let score1 = 85; 

        // 3.2 連續工作天數 (10%)
        let maxAll = 0;
        let over5DaysCount = 0;
        Object.values(stats.staffStats).forEach(s => {
            const maxC = Math.max(...(s.consecutive.length > 0 ? s.consecutive : [0]));
            if (maxC > maxAll) maxAll = maxC;
            if (maxC > 5) over5DaysCount++;
        });

        let score2 = 100;
        if (over5DaysCount === 0) score2 = 100;
        else if (maxAll <= 6) score2 = 90;
        else if (maxAll <= 7) score2 = 70;
        else if (maxAll <= 9) score2 = 50;
        else score2 = 20;

        const weighted = (score1 * 0.6) + (score2 * 0.4);
        return { score: weighted, maxConsecutive: maxAll };
    }

    // 4. 排班效率 (20%) - 覆蓋率
    static calcEfficiency(stats, config, rules, daysInMonth) {
        if (!config.enabled) return { score: 100 };

        let totalRequired = 0;
        let totalFilled = 0;
        const req = rules.staffRequirements || { D:{}, E:{}, N:{} };

        for(let d=1; d<=daysInMonth; d++) {
            // 注意：這裡假設 2025 年，實務上應傳入正確年份
            // 由於 weekDay 計算依賴日期，若無 year 資訊會有誤差，暫用 generic
            const w = (d % 7); // 粗略估計，或需由外部傳入 weekday map
            const reqD = (req.D?.[w]||0) + (req.E?.[w]||0) + (req.N?.[w]||0);
            totalRequired += reqD;
            totalFilled += stats.dailyStats[d].total;
        }

        // 避免除以零
        const coverage = totalRequired > 0 ? (totalFilled / totalRequired) * 100 : 100;
        // 分級：100=100, 98-99=90, 95-97=80, 90-94=60, <90=40
        let score = 0;
        if (coverage >= 100) score = 100;
        else if (coverage >= 98) score = 90;
        else if (coverage >= 95) score = 80;
        else if (coverage >= 90) score = 60;
        else score = 40;

        return { score, coverage: coverage.toFixed(1) + '%' };
    }

    // 5. 健康安全 (15%)
    static calcHealth(stats, config) {
        if (!config.enabled) return { score: 100 };

        const nonBatchStaff = Object.values(stats.staffStats).filter(s => !s.isBatch);
        
        // 4.1 夜班頻率 (8%)
        let nightViolations = 0;
        nonBatchStaff.forEach(s => {
            const avg = s.nightShifts / 4; // 週均
            if (avg > 3) nightViolations++;
        });
        
        let score1 = 100;
        if (nightViolations > 0) score1 = 50; // 簡易扣分

        // 4.2 早晚交替 (5%)
        let quickReturnCount = 0;
        Object.values(stats.staffStats).forEach(s => quickReturnCount += s.quickReturns);
        let score2 = this.mapScore(quickReturnCount, [0, 1, 3, 5], [100, 90, 70, 30, 0]);

        // 4.3 休假達標 (2%)
        // 假設都達標
        let score3 = 100;

        const weighted = (score1 * 0.53) + (score2 * 0.33) + (score3 * 0.14);
        return { score: weighted, violations: nightViolations + quickReturnCount };
    }

    // 6. 品質 (10%) - 經驗分布
    static calcQuality(stats, config, daysInMonth) {
        if (!config.enabled) return { score: 100 };

        let seniorShifts = 0;
        let juniorShifts = 0; // 此處需定義好 junior 指標
        
        for(let d=1; d<=daysInMonth; d++) {
            const ds = stats.dailyStats[d];
            // 優秀：100% 班次有 >=1 資深
            if (ds.senior >= 1) seniorShifts++;
        }
        
        const ratio = (seniorShifts / daysInMonth) * 100;
        let score = 0;
        if (ratio >= 100) score = 100;
        else if (ratio >= 95) score = 90;
        else if (ratio >= 90) score = 80;
        else if (ratio >= 80) score = 60;
        else score = 40;

        // 加分項：每班2名以上資深 (略)

        return { score, ratio: ratio.toFixed(1) + '%' };
    }

    // 7. 成本 (10%) - 加班費
    static calcCost(stats, config, daysInMonth, staffCount) {
        if (!config.enabled) return { score: 100 };

        const requiredOff = 8; // 假設月休8天
        const expectedWorkDays = daysInMonth - requiredOff;
        let overtimeDays = 0;

        Object.values(stats.staffStats).forEach(s => {
            const workDays = daysInMonth - s.offDays;
            if (workDays > expectedWorkDays) overtimeDays += (workDays - expectedWorkDays);
        });

        const score = this.mapScore(overtimeDays, [0, 5, 10, 15], [100, 90, 75, 50, 0]);
        return { score, overtimeDays };
    }

    // 工具：分數映射 (值 <= 門檻 給分)
    static mapScore(val, thresholds, scores) {
        for (let i = 0; i < thresholds.length; i++) {
            if (val <= thresholds[i]) return scores[i];
        }
        return scores[scores.length - 1];
    }

    static getDefaultConfig() {
        return {
            hard: { enabled: true, weight: 0 },
            fairness: { enabled: true, weight: 30 },
            satisfaction: { enabled: true, weight: 25 },
            efficiency: { enabled: true, weight: 20 },
            health: { enabled: true, weight: 15 },
            quality: { enabled: true, weight: 10 },
            cost: { enabled: true, weight: 10 }
        };
    }
}
