import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 執行公平性優先的自動排班
     */
    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        
        const rules = unitSettings.rules || {};
        const weights = rules.scoringConfig ? this.convertScoringToWeights(rules.scoringConfig) : {
            fairness: 100, night: 50, holiday: 200, batch: 5000    
        };

        const groupConstraints = preScheduleData?.settings?.groupConstraints || {};

        const staffStats = {}; 
        staffList.forEach(s => {
            const uid = s.uid; 
            if (!assignments[uid]) assignments[uid] = {};
            
            staffStats[uid] = {
                uid: uid,
                name: s.name,
                group: s.group || '',
                totalShifts: 0,
                nightShifts: 0,   
                holidayShifts: 0, 
                consecutive: 0,   
                canBatch: s.constraints?.canBatch || false, 
                constraints: s.constraints || {}
            };
        });

        const year = currentSchedule.year;
        const month = currentSchedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const staffReq = unitSettings.staffRequirements || { D: {}, E: {}, N: {} };
        const shiftDefs = unitSettings.settings?.shifts || [];

        // 1. 鎖定預班
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (!assignments[uid]) assignments[uid] = {};
                if (sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        if (wish === 'OFF' || wish === 'M_OFF') {
                            assignments[uid][day] = 'OFF';
                        } else {
                            assignments[uid][day] = wish;
                            if(staffStats[uid]) {
                                this.updateTempStats(staffStats[uid], wish, this.isHoliday(year, month, day));
                            }
                        }
                    });
                }
            });
            logs.push("✅ 已鎖定預班需求");
        }

        // 2. 逐日排班
        // 優先順序：大夜 -> 小夜 -> 白班
        const shiftPriority = ['N', 'E', 'D']; 

        for (let day = 1; day <= daysInMonth; day++) {
            const isHol = this.isHoliday(year, month, day);
            const weekDay = new Date(year, month - 1, day).getDay();

            this.updateDailyStats(staffStats, assignments, day - 1);

            shiftPriority.forEach(shiftCode => {
                const needed = (staffReq[shiftCode] && staffReq[shiftCode][weekDay]) || 0;
                let currentCount = this.countStaff(assignments, day, shiftCode);

                if (currentCount < needed) {
                    const neededCount = needed - currentCount;

                    // A. 找出候選人
                    const candidates = this.findValidCandidates(
                        assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs, 
                        groupConstraints, staffStats
                    );

                    // B. 計算分數
                    candidates.forEach(staff => {
                        staff.score = this.calculateScore(
                            staffStats[staff.uid], shiftCode, isHol, day, assignments, weights, rules.constraints
                        );
                    });

                    // C. 排序
                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

                    // D. 填入
                    let filled = 0;
                    for (const staff of candidates) {
                        if (filled >= neededCount) break;
                        
                        assignments[staff.uid][day] = shiftCode;
                        this.updateTempStats(staffStats[staff.uid], shiftCode, isHol);
                        
                        currentCount++;
                        filled++;
                    }
                }
            });
        }

        return { assignments, logs };
    }

    static isHoliday(year, month, day) {
        const date = new Date(year, month - 1, day);
        const d = date.getDay();
        return d === 0 || d === 6;
    }

    static convertScoringToWeights(config) {
        return {
            fairness: (config.fairness?.subs?.hours?.weight || 15) * 10,
            night: (config.health?.subs?.night?.weight || 8) * 10,
            holiday: (config.fairness?.subs?.shifts?.weight || 15) * 10,
            batch: 5000 
        };
    }

    static calculateScore(stats, shiftCode, isHoliday, day, assignments, weights, constraints) {
        if (!stats) return 999999;
        let score = 0;

        // 1. 公平性
        score += stats.totalShifts * weights.fairness;
        score += stats.nightShifts * weights.night;
        score += stats.holidayShifts * weights.holiday;

        // 2. 滿足連續性原則 (Min Consecutive)
        // 若昨日是同班別，給予極大獎勵 (降低分數)，促使形成連續班
        const minConsecutive = constraints?.minConsecutiveSame || 2;
        const yesterdayShift = assignments[stats.uid][day - 1];
        
        if (yesterdayShift === shiftCode) {
            // 已經開始連續了，鼓勵繼續
            score -= 1000;
        } else if (yesterdayShift && yesterdayShift !== 'OFF' && yesterdayShift !== 'M_OFF') {
            // 昨日是別的班，今天要換班 -> 檢查昨日是否已滿足最小連續
            // 這比較複雜，AI 簡化處理：盡量不換班
            score += 500; 
        }

        // 3. 包班邏輯
        const isNight = (shiftCode === 'E' || shiftCode === 'N');
        if (isNight) {
            if (stats.canBatch) {
                if (yesterdayShift === shiftCode) score -= weights.batch; 
            } else {
                if (yesterdayShift === shiftCode) score += 500; 
            }
        }

        // 4. 疲勞度
        score += Math.pow(stats.consecutive, 2) * 50; 
        score += Math.random() * 10;

        return score;
    }

    static updateTempStats(stats, shiftCode, isHoliday) {
        if(!stats) return;
        stats.totalShifts++;
        if (shiftCode === 'E' || shiftCode === 'N') stats.nightShifts++;
        if (isHoliday) stats.holidayShifts++;
        stats.consecutive++; 
    }

    static updateDailyStats(staffStats, assignments, prevDay) {
        if (prevDay < 1) return;
        Object.values(staffStats).forEach(stat => {
            const code = assignments[stat.uid][prevDay];
            if (!code || code === 'OFF' || code === 'M_OFF') {
                stat.consecutive = 0;
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

    static findValidCandidates(assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs, groupConstraints, staffStats) {
        const qualified = [];
        const currentGroupCounts = {}; 
        
        Object.values(staffStats).forEach(stat => {
            const assigned = assignments[stat.uid][day];
            if (assigned === shiftCode && stat.group) {
                currentGroupCounts[stat.group] = (currentGroupCounts[stat.group] || 0) + 1;
            }
        });

        for (const staff of staffList) {
            const uid = staff.uid;
            if (assignments[uid][day]) continue;

            // 組別上限檢查
            const group = staff.group;
            if (group && groupConstraints[group]) {
                const limit = this.getGroupMaxLimit(groupConstraints[group], shiftCode);
                const current = currentGroupCounts[group] || 0;
                if (limit !== null && current >= limit) continue;
            }

            // 規則檢查 (RuleEngine)
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            const validation = RuleEngine.validateStaff(
                mockAssignments, daysInMonth, shiftDefs, rules, staff.constraints
            );
            
            if (!validation.errors[day]) {
                qualified.push(staff);
            }
        }
        return qualified;
    }

    static getGroupMaxLimit(constraints, shift) {
        if (shift === 'E' && constraints.maxE !== undefined && constraints.maxE !== '') return constraints.maxE;
        if (shift === 'N' && constraints.maxN !== undefined && constraints.maxN !== '') return constraints.maxN;
        return null;
    }
}
