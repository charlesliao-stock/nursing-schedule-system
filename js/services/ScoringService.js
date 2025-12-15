export class ScoringService {
    /**
     * 計算班表總分與細項 (支援動態權重)
     */
    static calculate(schedule, staffList, unitSettings, preSchedule) {
        if (!schedule || !schedule.assignments) return { totalScore: 0, details: {} };

        const assignments = schedule.assignments;
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const config = unitSettings?.scoringConfig || {};

        // 1. 讀取並計算各類別的配置權重 (Max Score)
        const weights = {
            efficiency: this.getCategoryWeight(config.efficiency),   // 對應: 人力覆蓋
            satisfaction: this.getCategoryWeight(config.satisfaction), // 對應: 個人偏好
            fairness: this.getCategoryWeight(config.fairness),       // 對應: 公平性
            health: this.getCategoryWeight(config.health)            // 對應: 健康/法規
        };

        // 2. 初始化結果物件
        // 若單位未設定或權重為 0，則該項 Max 為 0
        let scores = {
            efficiency: { score: 0, max: weights.efficiency, label: config.efficiency?.label || "效率 (人力覆蓋)", desc: "滿足每日人力需求之程度" },
            satisfaction: { score: 0, max: weights.satisfaction, label: config.satisfaction?.label || "滿意度 (偏好)", desc: "符合員工預班與志願之比例" },
            fairness: { score: 0, max: weights.fairness, label: config.fairness?.label || "公平性", desc: "休假天數與夜班分佈之平均度" },
            health: { score: 0, max: weights.health, label: config.health?.label || "健康 (班表邏輯)", desc: "避免疲勞班表與符合間隔規範" }
        };

        // 3. 執行計算 (僅當權重 > 0 時才計算，節省效能)
        if (scores.efficiency.max > 0) {
            scores.efficiency.score = this.calcCoverage(assignments, daysInMonth, unitSettings, scores.efficiency.max);
        }
        
        if (scores.satisfaction.max > 0) {
            scores.satisfaction.score = this.calcPreferences(assignments, daysInMonth, preSchedule, scores.satisfaction.max);
        }

        if (scores.fairness.max > 0) {
            scores.fairness.score = this.calcFairness(assignments, staffList, scores.fairness.max);
        }

        if (scores.health.max > 0) {
            scores.health.score = this.calcHealth(assignments, daysInMonth, scores.health.max);
        }

        // 4. 匯總總分
        const total = Object.values(scores).reduce((sum, item) => sum + item.score, 0);
        // 計算總權重 (通常應為 100，但允許使用者設定不同)
        const totalMax = Object.values(scores).reduce((sum, item) => sum + item.max, 0);

        return {
            totalScore: Math.round(total),
            totalMax: totalMax, // 實際總滿分
            passed: total >= (totalMax * 0.6), // 及格標準 60%
            details: scores
        };
    }

    /**
     * 輔助：計算該類別下所有「已啟用」細項的權重總和
     */
    static getCategoryWeight(categoryConfig) {
        if (!categoryConfig || !categoryConfig.subs) return 0;
        let total = 0;
        Object.values(categoryConfig.subs).forEach(sub => {
            if (sub.enabled) {
                total += (parseInt(sub.weight) || 0);
            }
        });
        return total;
    }

    // --- A. 效率/人力覆蓋 (Coverage) ---
    static calcCoverage(assignments, daysInMonth, unitSettings, maxScore) {
        const req = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        let totalReqPoints = 0;
        let metPoints = 0;

        // 取得所有定義的班別
        const shiftDefs = unitSettings?.settings?.shifts || [{code:'D'}, {code:'E'}, {code:'N'}];
        const shiftCodes = shiftDefs.map(s => s.code);

        for (let d = 1; d <= daysInMonth; d++) {
            // 簡易計算星期 (假設連續) - 實務上建議傳入 year/month 以精確計算
            // 這裡沿用之前的簡化邏輯，若有 Context 可優化
            const dayOfWeek = (d % 7); 

            const counts = {};
            shiftCodes.forEach(c => counts[c] = 0);

            Object.values(assignments).forEach(row => {
                const shift = row[d];
                if (counts[shift] !== undefined) counts[shift]++;
            });

            shiftCodes.forEach(shift => {
                const needed = req[shift]?.[dayOfWeek] || 0;
                if (needed > 0) {
                    totalReqPoints += needed;
                    metPoints += Math.min(counts[shift], needed);
                }
            });
        }

        if (totalReqPoints === 0) return maxScore;
        // 依照達成率給分
        return (metPoints / totalReqPoints) * maxScore;
    }

    // --- B. 滿意度/個人偏好 (Preferences) ---
    static calcPreferences(assignments, daysInMonth, preSchedule, maxScore) {
        const submissions = preSchedule?.submissions || {};
        let totalWishes = 0;
        let metWishes = 0;

        Object.keys(assignments).forEach(uid => {
            const wishes = submissions[uid]?.wishes || {};
            const actual = assignments[uid] || {};

            Object.entries(wishes).forEach(([day, wishShift]) => {
                if (wishShift === 'M_OFF') return; // 強制休假不計入(這是硬規則)
                
                totalWishes++;
                // 處理 NO_ 前綴
                if (wishShift.startsWith('NO_')) {
                    const avoid = wishShift.replace('NO_', '');
                    if (actual[day] !== avoid) metWishes++;
                } else {
                    if (actual[day] === wishShift) metWishes++;
                }
            });
        });

        if (totalWishes === 0) return maxScore;
        return (metWishes / totalWishes) * maxScore;
    }

    // --- C. 公平性 (Fairness) ---
    static calcFairness(assignments, staffList, maxScore) {
        if (staffList.length === 0) return maxScore;

        const offCounts = staffList.map(s => {
            const row = assignments[s.uid] || {};
            return Object.values(row).filter(v => v === 'OFF').length;
        });

        // 計算標準差 (Standard Deviation)
        const mean = offCounts.reduce((a,b)=>a+b, 0) / offCounts.length;
        const variance = offCounts.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / offCounts.length;
        const stdDev = Math.sqrt(variance);

        // 標準差越大扣越多
        // 假設標準差 0 (完全平均) -> 得滿分
        // 標準差每增加 0.5，扣除 20% 分數 (此為經驗參數，可調整)
        const deductionRatio = Math.min(1, stdDev / 2.5); 
        
        return maxScore * (1 - deductionRatio);
    }

    // --- D. 健康/規則 (Health) ---
    static calcHealth(assignments, daysInMonth, maxScore) {
        let violations = 0;
        let totalShifts = 0;

        Object.values(assignments).forEach(row => {
            let prev = 'OFF';
            for(let d=1; d<=daysInMonth; d++) {
                const curr = row[d] || 'OFF';
                if (curr !== 'OFF') totalShifts++;

                // 檢查 N 接 D (大夜接白班 - 嚴重疲勞)
                // 這裡做簡易字串檢查，實務可搭配 ShiftSettings 的時間
                if (prev.includes('N') && curr.includes('D')) {
                    violations++;
                }
                // 檢查 E 接 D (小夜接白班 - 間隔可能不足)
                if (prev.includes('E') && curr.includes('D')) {
                    violations++; // 視為半個違規或一個違規
                }
                
                prev = curr;
            }
        });

        if (totalShifts === 0) return maxScore;

        // 計算違規率，或是直接扣分
        // 這裡採用直接扣分法：每個違規扣總分的 10%
        const penalty = violations * (maxScore * 0.1);
        return Math.max(0, maxScore - penalty);
    }
}
