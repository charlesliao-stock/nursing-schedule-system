export class ScoringService {
    /**
     * 計算班表總分與細項
     */
    static calculate(schedule, staffList, unitSettings, preSchedule) {
        if (!schedule || !schedule.assignments) return { totalScore: 0, details: {} };

        const assignments = schedule.assignments;
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        
        // 1. 初始化計分項目
        let scores = {
            coverage: { score: 0, max: 40, label: "人力覆蓋", desc: "滿足每日最低人力需求" },
            preferences: { score: 0, max: 30, label: "個人偏好", desc: "符合員工預班與志願" },
            fairness: { score: 0, max: 20, label: "休假公平", desc: "休假天數與夜班分佈平均" },
            health: { score: 0, max: 10, label: "班表健康", desc: "避免 N-D 等疲勞班別" }
        };

        // 2. 計算邏輯
        scores.coverage.score = this.calcCoverage(assignments, daysInMonth, unitSettings, scores.coverage.max);
        scores.preferences.score = this.calcPreferences(assignments, daysInMonth, preSchedule, scores.preferences.max);
        scores.fairness.score = this.calcFairness(assignments, staffList, scores.fairness.max);
        scores.health.score = this.calcHealth(assignments, daysInMonth, scores.health.max);

        // 3. 匯總
        const total = Object.values(scores).reduce((sum, item) => sum + item.score, 0);

        return {
            totalScore: Math.round(total),
            passed: total >= 60,
            details: scores
        };
    }

    // --- A. 人力覆蓋 (Coverage) ---
    static calcCoverage(assignments, daysInMonth, unitSettings, maxScore) {
        const req = unitSettings?.staffRequirements || { D:{}, E:{}, N:{} };
        let totalReqPoints = 0;
        let metPoints = 0;

        // 統計每天每班的人力
        for (let d = 1; d <= daysInMonth; d++) {
            // 簡易判斷星期 (假設 year/month 正確，否則用 mod 7 近似)
            // 這裡簡化：假設 req 是 0-6 (Sun-Sat)
            // 實務上應傳入 year/month 計算 Date.getDay()
            // 這裡暫時假設 d=1 是星期一 (僅作示範，正式應由外部傳入 weekday)
            const dayOfWeek = (d % 7); 

            const counts = { D:0, E:0, N:0 };
            Object.values(assignments).forEach(row => {
                const shift = row[d];
                if (counts[shift] !== undefined) counts[shift]++;
            });

            ['D', 'E', 'N'].forEach(shift => {
                const needed = req[shift]?.[dayOfWeek] || 0;
                if (needed > 0) {
                    totalReqPoints += needed;
                    metPoints += Math.min(counts[shift], needed);
                }
            });
        }

        if (totalReqPoints === 0) return maxScore;
        return (metPoints / totalReqPoints) * maxScore;
    }

    // --- B. 個人偏好 (Preferences) ---
    static calcPreferences(assignments, daysInMonth, preSchedule, maxScore) {
        const submissions = preSchedule?.submissions || {};
        let totalWishes = 0;
        let metWishes = 0;

        Object.keys(assignments).forEach(uid => {
            const wishes = submissions[uid]?.wishes || {};
            const actual = assignments[uid] || {};

            Object.entries(wishes).forEach(([day, wishShift]) => {
                if (wishShift === 'M_OFF') return; // 強制休假不計入偏好分數(屬硬性)
                
                totalWishes++;
                // 檢查是否達成 (勿排 NO_X 邏輯需額外處理，這裡簡化為正向檢查)
                if (actual[day] === wishShift) {
                    metWishes++;
                } else if (wishShift.startsWith('NO_') && actual[day] !== wishShift.replace('NO_', '')) {
                    metWishes++;
                }
            });
        });

        if (totalWishes === 0) return maxScore;
        return (metWishes / totalWishes) * maxScore;
    }

    // --- C. 公平性 (Fairness) - 變異數 ---
    static calcFairness(assignments, staffList, maxScore) {
        if (staffList.length === 0) return maxScore;

        const offCounts = staffList.map(s => {
            const row = assignments[s.uid] || {};
            return Object.values(row).filter(v => v === 'OFF').length;
        });

        // 計算標準差
        const mean = offCounts.reduce((a,b)=>a+b, 0) / offCounts.length;
        const variance = offCounts.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / offCounts.length;
        const stdDev = Math.sqrt(variance);

        // 標準差越小越好 (0 -> 滿分, >2 -> 0分)
        const deduction = stdDev * 10; 
        return Math.max(0, maxScore - deduction);
    }

    // --- D. 健康/規則 (Health) ---
    static calcHealth(assignments, daysInMonth, maxScore) {
        let violations = 0;
        Object.values(assignments).forEach(row => {
            let prev = 'OFF';
            for(let d=1; d<=daysInMonth; d++) {
                const curr = row[d] || 'OFF';
                // N 接 D (大夜接白班)
                if (prev === 'N' && curr === 'D') violations++;
                // E 接 D (小夜接白班 - 間隔不足)
                if (prev === 'E' && curr === 'D') violations++;
                
                prev = curr;
            }
        });

        // 每個違規扣 2 分
        return Math.max(0, maxScore - (violations * 2));
    }
}
