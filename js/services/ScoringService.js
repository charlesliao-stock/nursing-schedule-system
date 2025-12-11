// js/services/ScoringService.js

export class ScoringService {

    /**
     * 計算排班品質總分
     * @param {Object} scheduleData 班表資料 { assignments: { uid: { 1: 'D', ... } } }
     * @param {Array} staffList 人員列表
     * @param {Object} rules 單位規則 (含 scoringConfig)
     * @param {Object} preSchedule 預班資料 (含 preferences)
     */
    static calculate(scheduleData, staffList, rules, preSchedule) {
        const assignments = scheduleData.assignments || {};
        const daysInMonth = new Date(scheduleData.year, scheduleData.month, 0).getDate();
        
        // 預設配置 (若無設定則使用預設值)
        const config = rules.scoringConfig || this.getDefaultConfig();
        
        // 1. 基礎數據統計 (計算工時、班次、連續天數等)
        const stats = this.analyzeSchedule(assignments, staffList, daysInMonth, rules);

        // 2. 計算各項得分
        const scores = {
            hardConstraints: this.calcHardConstraints(stats, config.hard),
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

        // 硬性約束若失敗，總分直接為 0 或標記為失敗
        if (!scores.hardConstraints.passed) {
            return { totalScore: 0, details: scores, passed: false };
        }

        // 遍歷主要項目計算加權
        ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(category => {
            if (config[category].enabled) {
                totalScore += scores[category].score * (config[category].weight / 100);
                totalWeight += config[category].weight;
            }
        });

        // 正規化 (若權重加總不為 100，則按比例放大/縮小)
        const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

        return {
            totalScore: Math.round(normalizedScore * 10) / 10, // 小數點一位
            details: scores,
            passed: true
        };
    }

    // ==========================================
    //  分析與統計 (Helper)
    // ==========================================
    static analyzeSchedule(assignments, staffList, daysInMonth, rules) {
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
            const years = (new Date() - hireDate) / (1000 * 60 * 60 * 24 * 365);
            const isSenior = years >= 2;

            const s = {
                uid, name: staff.name, isBatch, isSenior,
                totalHours: 0,
                shiftCounts: { D:0, E:0, N:0, Holiday:0 },
                consecutive: [], // 紀錄連續上班段落 [3, 2, 5...]
                nightShifts: 0, // 小夜+大夜
                quickReturns: 0, // N->D, E->D
                offDays: 0,
                preferencesMet: 0,
                preferencesTotal: 0
            };

            let currentConsecutive = 0;
            let prevShift = null;

            for(let d=1; d<=daysInMonth; d++) {
                const shift = shifts[d];
                const date = new Date(new Date().getFullYear(), new Date().getMonth(), d); // 簡易日期
                const isHoliday = (d % 7 === 0 || d % 7 === 6); // 簡易假日判斷 (需優化)

                if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                    // 工時 (假設 D=8, E=8, N=8)
                    s.totalHours += 8; 
                    s.shiftCounts[shift] = (s.shiftCounts[shift] || 0) + 1;
                    if(isHoliday) s.shiftCounts.Holiday++;
                    if(shift === 'E' || shift === 'N') s.nightShifts++;

                    // 每日統計
                    dailyStats[d][shift]++;
                    dailyStats[d].total++;
                    if(isSenior) dailyStats[d].senior++;
                    else dailyStats[d].junior++;

                    currentConsecutive++;

                    // 花花班 (Quick Return)
                    if (prevShift) {
                        if ((prevShift === 'N' || prevShift === 'E') && shift === 'D') {
                            s.quickReturns++;
                        }
                        // 檢查休息時間 (簡單版：只要有班接班，假設都大於11hr，除非 N接D)
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
    //  各項指標計算
    // ==========================================

    // 1. 硬性約束
    static calcHardConstraints(stats, config) {
        let passed = true;
        const logs = [];

        // 1.1 兩週內須有2個休假 (簡化為月休 >= 4天)
        Object.values(stats.staffStats).forEach(s => {
            if (s.offDays < 4) { // 假設一個月至少4天
                passed = false;
                logs.push(`${s.name} 休假不足`);
            }
        });

        // 1.2 休息時間 (使用 Quick Return 判斷)
        Object.values(stats.staffStats).forEach(s => {
            if (s.quickReturns > 0) {
                // 若設定不可違反，則 fail
                // 這裡暫時視為扣分項，除非 rules 強制
            }
        });

        return { score: passed ? 100 : 0, passed, logs };
    }

    // 2. 公平性 (工時標準差 + 班次分配)
    static calcFairness(stats, config) {
        const staffValues = Object.values(stats.staffStats);
        
        // 2.1 工時標準差
        const hours = staffValues.map(s => s.totalHours);
        const mean = hours.reduce((a,b)=>a+b,0) / hours.length;
        const stdDev = Math.sqrt(hours.map(x => Math.pow(x - mean, 2)).reduce((a,b)=>a+b,0) / hours.length);
        
        const score1 = this.mapScore(stdDev, [2, 4, 6, 8], [100, 90, 70, 50, 20]); // <2=100, <4=90...

        // 2.2 班次均勻度 (排除包班者)
        const nonBatchStaff = staffValues.filter(s => !s.isBatch);
        let score2 = 100;
        if (nonBatchStaff.length > 0) {
            // 計算 Holiday 差異
            const holidays = nonBatchStaff.map(s => s.shiftCounts.Holiday);
            const maxH = Math.max(...holidays);
            const minH = Math.min(...holidays);
            const diffH = maxH - minH;
            const scoreH = this.mapScore(diffH, [1, 2, 3, 4], [100, 85, 60, 35, 10]);
            
            // 一般班次 (簡化：計算總班數差異)
            // 這裡可以更細算 D/E/N 各自的標準差平均
            score2 = scoreH; // 暫以假日為主
        }

        const weighted = (score1 * 0.5) + (score2 * 0.5); // 各占一半
        return { score: weighted, stdDev };
    }

    // 3. 滿意度 (偏好 + 連續工作)
    static calcSatisfaction(stats, config, preSchedule) {
        // 3.1 偏好匹配 (需比對 PreSchedule)
        let totalWishes = 0;
        let metWishes = 0;
        
        if (preSchedule && preSchedule.submissions) {
            Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                const wishes = sub.wishes || {}; // { 1:'OFF', 2:'D' }
                // TODO: 讀取 assignments 比對
            });
        }
        // 暫時模擬 80 分
        const score1 = 80;

        // 3.2 連續工作天數
        let maxConsecutive = 0;
        let over5DaysCount = 0;
        Object.values(stats.staffStats).forEach(s => {
            const maxC = Math.max(...(s.consecutive.length > 0 ? s.consecutive : [0]));
            if (maxC > maxConsecutive) maxConsecutive = maxC;
            if (maxC > 5) over5DaysCount++;
        });

        let score2 = 100;
        if (maxConsecutive > 10) score2 = 20;
        else if (maxConsecutive > 7) score2 = 50;
        else if (maxConsecutive > 5) score2 = 80;

        const weighted = (score1 * 0.6) + (score2 * 0.4);
        return { score: weighted, maxConsecutive };
    }

    // 4. 效率 (覆蓋率)
    static calcEfficiency(stats, config, rules, daysInMonth) {
        let totalRequired = 0;
        let totalFilled = 0;
        const req = rules.staffRequirements || { D:{}, E:{}, N:{} };

        for(let d=1; d<=daysInMonth; d++) {
            // 假設 2025 年
            const date = new Date(2025, 0, d); // 需傳入正確年份
            const w = date.getDay();
            const reqD = (req.D?.[w]||0) + (req.E?.[w]||0) + (req.N?.[w]||0);
            totalRequired += reqD;
            totalFilled += stats.dailyStats[d].total;
        }

        const coverage = totalRequired > 0 ? (totalFilled / totalRequired) * 100 : 100;
        const score = this.mapScore(100 - coverage, [0, 2, 5, 10], [100, 90, 75, 50, 0]); // 倒過來算缺口

        return { score, coverage: coverage.toFixed(1) + '%' };
    }

    // 5. 健康 (夜班頻率 + 交替)
    static calcHealth(stats, config) {
        let violations = 0;
        const nonBatchStaff = Object.values(stats.staffStats).filter(s => !s.isBatch);
        
        // 4.1 夜班頻率 (週均 > 3次)
        nonBatchStaff.forEach(s => {
            const avg = s.nightShifts / 4; // 假設一個月4週
            if (avg > 3) violations++;
        });

        // 4.2 早晚交替
        let quickReturnCount = 0;
        Object.values(stats.staffStats).forEach(s => quickReturnCount += s.quickReturns);

        let score = 100;
        if (violations > 0) score -= 20;
        if (quickReturnCount > 0) score -= (quickReturnCount * 5); // 每次扣5分

        return { score: Math.max(0, score), violations };
    }

    // 6. 品質 (資深/資淺比例)
    static calcQuality(stats, config, daysInMonth) {
        let goodShifts = 0;
        for(let d=1; d<=daysInMonth; d++) {
            const ds = stats.dailyStats[d];
            // 規則：至少1資深
            if (ds.senior >= 1) goodShifts++;
        }
        const ratio = (goodShifts / daysInMonth) * 100;
        const score = ratio >= 100 ? 100 : (ratio >= 90 ? 80 : 50);
        return { score, ratio: ratio.toFixed(1) + '%' };
    }

    // 7. 成本 (加班費)
    static calcCost(stats, config, daysInMonth, staffCount) {
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

    // 工具：分數映射 (值越小越好)
    // val: 實際值, thresholds: [2, 4, 6, 8], scores: [100, 80, 60, 40, 0]
    static mapScore(val, thresholds, scores) {
        for (let i = 0; i < thresholds.length; i++) {
            if (val <= thresholds[i]) return scores[i];
        }
        return scores[scores.length - 1];
    }

    static getDefaultConfig() {
        return {
            hard: { enabled: true, weight: 0 }, // 必須通過
            fairness: { enabled: true, weight: 30 },
            satisfaction: { enabled: true, weight: 25 },
            efficiency: { enabled: true, weight: 20 },
            health: { enabled: true, weight: 15 },
            quality: { enabled: true, weight: 10 },
            cost: { enabled: true, weight: 10 } // 使用者定義中加總是 110%，這裡保留彈性
        };
    }
}
