// js/modules/ai/AutoScheduler.js
import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 執行公平性優先的自動排班
     */
    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 初始化與深拷貝
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        
        // 讀取權重設定 (若無則使用預設值)
        const rules = unitSettings.rules || {};
        const weights = rules.weights || {
            fairness: 100, // 總班數
            night: 50,     // 夜班數
            holiday: 200,  // 假日班
            batch: 5000    // 包班獎勵
        };

        // 建立統計物件，用來即時追蹤每個人的負載
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
                canBatch: s.constraints?.canBatch || false, 
                constraints: s.constraints || {} // 傳遞給 RuleEngine 用
            };
        });

        const year = currentSchedule.year;
        const month = currentSchedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const staffReq = unitSettings.staffRequirements || { D: {}, E: {}, N: {} };
        const shiftDefs = unitSettings.settings?.shifts || [];


        // ----------------------------------------------------
        // Step 1: 鎖定預班 (Wishes) 並初始化統計
        // ----------------------------------------------------
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (sub.wishes && assignments[uid]) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        
                        // ✅ 修正點：支援 M_OFF
                        if (wish === 'OFF' || wish === 'M_OFF') {
                            assignments[uid][day] = 'OFF';
                        } else {
                            // 預填班別也要算入
                            assignments[uid][day] = wish;
                        }
                    });
                }
            });
            logs.push("✅ 已鎖定預班需求");
        }
// ... (後續代碼不變，請保留完整的 Class)

        // ----------------------------------------------------
        // Step 2: 逐日排班 (Day 1 -> Day 30)
        // ----------------------------------------------------
        const shiftPriority = ['N', 'E', 'D']; // 夜班優先

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekDay = date.getDay(); 
            const isHoliday = (weekDay === 0 || weekDay === 6);

            // 更新昨天的狀態 (計算連續天數用)
            this.updateDailyStats(staffStats, assignments, day - 1);

            shiftPriority.forEach(shiftCode => {
                // 取得當日需求
                const needed = (staffReq[shiftCode] && staffReq[shiftCode][weekDay]) || 0;
                
                // 計算目前已排人數
                let currentCount = this.countStaff(assignments, day, shiftCode);

                if (currentCount < needed) {
                    const neededCount = needed - currentCount;

                    // A. 找出候選人 (硬規則篩選)
                    const candidates = this.findValidCandidates(
                        assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs
                    );

                    // B. 計算分數 (軟規則加權)
                    candidates.forEach(staff => {
                        staff.score = this.calculateScore(
                            staffStats[staff.id], shiftCode, isHoliday, day, assignments, weights
                        );
                    });

                    // C. 排序：分數低者優先
                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

                    // D. 填入
                    let filled = 0;
                    for (const staff of candidates) {
                        if (filled >= neededCount) break;
                        assignments[staff.id][day] = shiftCode;
                        
                        // 立即更新暫時統計
                        this.updateTempStats(staffStats[staff.id], shiftCode, isHoliday);
                        
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
    static calculateScore(stats, shiftCode, isHoliday, day, assignments, weights) {
        let score = 0;

        // 1. 公平性權重 (從 Settings 讀取)
        score += stats.totalShifts * weights.fairness;
        score += stats.nightShifts * weights.night;
        score += stats.holidayShifts * weights.holiday;

        // 2. 包班 vs 散班邏輯
        const isNight = (shiftCode === 'E' || shiftCode === 'N');
        const yesterdayShift = assignments[stats.uid][day - 1];

        if (isNight) {
            if (stats.canBatch) {
                // 願意包班且昨天同班 -> 大幅獎勵 (扣分)
                if (yesterdayShift === shiftCode) {
                    score -= weights.batch; 
                } 
            } else {
                // 不願包班且昨天同班 -> 懲罰 (加分)
                if (yesterdayShift === shiftCode) {
                    score += 500; 
                }
            }
        }

        // 3. 疲勞度 (連續上班天數平方)
        score += Math.pow(stats.consecutive, 2) * 50; 

        // 4. 隨機擾動
        score += Math.random() * 10;

        return score;
    }

    static updateTempStats(stats, shiftCode, isHoliday) {
        stats.totalShifts++;
        if (shiftCode === 'E' || shiftCode === 'N') stats.nightShifts++;
        if (isHoliday) stats.holidayShifts++;
        stats.consecutive++; 
    }

    static updateDailyStats(staffStats, assignments, prevDay) {
        if (prevDay < 1) return;
        Object.values(staffStats).forEach(stat => {
            const code = assignments[stat.uid][prevDay];
            if (code && code !== 'OFF') {
                // consecutive 已在 tempStats 更新
            } else {
                stat.consecutive = 0; // 斷班歸零
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
            if (assignments[uid][day]) continue;

            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            // ✅ 將人員個別限制傳入 RuleEngine
            const validation = RuleEngine.validateStaff(
                mockAssignments, daysInMonth, shiftDefs, rules, staff.constraints
            );
            
            if (!validation.errors[day]) {
                qualified.push(staff);
            }
        }
        return qualified;
    }
}
