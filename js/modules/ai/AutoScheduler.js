import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 執行公平性優先的自動排班
     */
    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 初始化與深拷貝
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        
        // 建立統計物件，用來即時追蹤每個人的負載 (為了公平性運算)
        const staffStats = {}; 
        staffList.forEach(s => {
            if (!assignments[s.id]) assignments[s.id] = {};
            staffStats[s.id] = {
                uid: s.id,
                name: s.name,
                totalShifts: 0,
                nightShifts: 0,   // E + N
                holidayShifts: 0, // 六日上班數
                consecutive: 0,   // 目前連續上班天數
                currentShift: null, // 昨天上的班
                canBatch: s.constraints?.canBatch || false, // 是否願意包班
                isPregnant: s.constraints?.isPregnant || false
            };
        });

        const year = currentSchedule.year;
        const month = currentSchedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const rules = unitSettings.rules || {};
        const staffReq = unitSettings.staffRequirements || { D: {}, E: {}, N: {} };
        const shiftDefs = unitSettings.settings?.shifts || [];

        // ----------------------------------------------------
        // Step 1: 鎖定預班 (Wishes) 並初始化統計數據
        // ----------------------------------------------------
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (sub.wishes && assignments[uid]) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        if (wish === 'OFF') {
                            assignments[uid][day] = 'OFF';
                        } else {
                            // 如果有預填班別 (例如預填 D)，也要算入統計
                            assignments[uid][day] = wish;
                        }
                    });
                }
            });
            logs.push("✅ 已鎖定預班需求");
        }

        // ----------------------------------------------------
        // Step 2: 逐日排班 (Day 1 -> Day 30)
        // ----------------------------------------------------
        // 優先順序：大夜(N) -> 小夜(E) -> 白班(D) (越難排的越先排)
        const shiftPriority = ['N', 'E', 'D'];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekDay = date.getDay(); // 0(日)..6(六)
            const isHoliday = (weekDay === 0 || weekDay === 6);

            // 在每一天開始前，先更新大家昨天的狀態到 stats (計算連續天數用)
            this.updateDailyStats(staffStats, assignments, day - 1);

            shiftPriority.forEach(shiftCode => {
                // 取得當日該班別的需求人數
                const needed = (staffReq[shiftCode] && staffReq[shiftCode][weekDay]) || 0;
                
                // 計算目前已排人數 (包含預班已填的)
                let currentCount = this.countStaff(assignments, day, shiftCode);

                if (currentCount < needed) {
                    const neededCount = needed - currentCount;

                    // A. 找出所有「硬規則」合格的候選人
                    const candidates = this.findValidCandidates(
                        assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs
                    );

                    // B. 計算分數 (核心：公平性演算法)
                    candidates.forEach(staff => {
                        staff.score = this.calculateScore(staffStats[staff.uid], shiftCode, isHoliday, day, assignments);
                    });

                    // C. 排序：分數越低越優先 (Score Ascending)
                    // 若分數相同，則隨機排序 (避免死板)
                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

                    // D. 填入班表
                    let filled = 0;
                    for (const staff of candidates) {
                        if (filled >= neededCount) break;
                        assignments[staff.uid][day] = shiftCode;
                        
                        // 立即更新該員的暫時統計 (讓下一輪排班知道他已經多了一班)
                        this.updateTempStats(staffStats[staff.uid], shiftCode, isHoliday);
                        
                        currentCount++;
                        filled++;
                    }

                    if (currentCount < needed) {
                        logs.push(`⚠️ ${day}日 ${shiftCode}班: 缺 ${needed - currentCount} 人`);
                    }
                }
            });
        }

        return { assignments, logs };
    }

    // ---------------------------------------------------------
    // 核心演算法：計算「適合度分數」 (越低越好)
    // ---------------------------------------------------------
    static calculateScore(stats, shiftCode, isHoliday, day, assignments) {
        let score = 0;

        // 1. 公平性權重 (Base Weights)
        // 讓班數少的人分數低 -> 優先被選
        score += stats.totalShifts * 100;       // 最重要的平衡指標
        score += stats.nightShifts * 50;        // 夜班盡量平均
        score += stats.holidayShifts * 200;     // 假日班最討厭，懲罰最重

        // 2. 包班 vs 散班邏輯 (Batching Logic)
        const isNight = (shiftCode === 'E' || shiftCode === 'N');
        const yesterdayShift = assignments[stats.uid][day - 1];

        if (isNight) {
            if (stats.canBatch) {
                // 如果他願意包班，且昨天也是同種夜班，給予極大獎勵 (扣分)
                if (yesterdayShift === shiftCode) {
                    score -= 5000; // 超級優先：讓他連下去
                } 
                // 如果昨天是 D 或 OFF，想切換進夜班，正常排
            } else {
                // 如果他不願包班，且昨天是夜班，給予懲罰 (加分)
                if (yesterdayShift === shiftCode) {
                    score += 500; // 讓他盡量跳開，不要連續
                }
            }
        }

        // 3. 連續上班疲劳度 (Fatigue)
        // 連續上班天數越多，分數越高 (越不想排他)
        score += Math.pow(stats.consecutive, 2) * 50; 

        // 4. 隨機擾動 (Random Noise)
        // 避免數值完全一樣時僵化
        score += Math.random() * 10;

        return score;
    }

    // ---------------------------------------------------------
    // 輔助函式
    // ---------------------------------------------------------

    // 當排入一班後，立即更新該員的「暫時統計」，確保同一天的下一個班別判斷準確
    static updateTempStats(stats, shiftCode, isHoliday) {
        stats.totalShifts++;
        if (shiftCode === 'E' || shiftCode === 'N') stats.nightShifts++;
        if (isHoliday) stats.holidayShifts++;
        stats.consecutive++; 
    }

    // 每天開始前，真正更新連續天數與昨天班別
    static updateDailyStats(staffStats, assignments, prevDay) {
        if (prevDay < 1) return;
        Object.values(staffStats).forEach(stat => {
            const code = assignments[stat.uid][prevDay];
            stat.currentShift = code;
            if (code && code !== 'OFF') {
                // consecutive 已經在 updateTempStats 加過了，這裡主要是校正斷班
            } else {
                stat.consecutive = 0; // 斷班，歸零
            }
        });
    }

    static countStaff(assignments, day, shiftCode) {
        let count = 0;
        Object.values(assignments).forEach(sch => {
            if (sch[day] === shiftCode) count++;
        });
        return count;
    }

    static findValidCandidates(assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs) {
        const qualified = [];
        for (const staff of staffList) {
            const uid = staff.id;
            // 1. 已有班跳過
            if (assignments[uid][day]) continue;

            // 2. 模擬並檢查硬規則 (RuleEngine)
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            // 為了效能，這裡假設 validateStaff 可以只檢查該天前後
            // 若 RuleEngine 尚未優化，這裡會檢查整個月，速度稍慢但準確
            const validation = RuleEngine.validateStaff(mockAssignments, daysInMonth, shiftDefs, rules);
            
            if (!validation.errors[day]) {
                qualified.push(staff);
            }
        }
        return qualified;
    }
}
