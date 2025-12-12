import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動");

        // --- 1. 資料清洗與 ID 校正 ---
        staffList.forEach(s => {
            if (!s.uid) {
                if (s.id) s.uid = s.id;
                else console.error("⚠️ 人員缺少 uid:", s);
            }
        });
        const validStaffList = staffList.filter(s => s.uid);
        console.log(`📋 有效排班人員: ${validStaffList.length} 人`);

        // 深拷貝目前的排班表
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        
        const rules = unitSettings.rules || {};
        
        // --- 2. 關鍵修正：確保 shiftDefs 存在 ---
        // 如果單位設定沒有班別定義，AI 自動補上預設值，避免 RuleEngine 全部判死刑
        let shiftDefs = unitSettings.settings?.shifts || [];
        if (!shiftDefs || shiftDefs.length === 0) {
            console.warn("⚠️ 警告：找不到單位班別定義，使用系統預設值 (D/E/N/OFF)。");
            shiftDefs = [
                { code: 'D', name: '白班', hours: 8 },
                { code: 'E', name: '小夜', hours: 8 },
                { code: 'N', name: '大夜', hours: 8 },
                { code: 'OFF', name: '休假', hours: 0 }
            ];
        }

        // 轉換權重
        const weights = rules.scoringConfig ? this.convertScoringToWeights(rules.scoringConfig) : {
            fairness: 100, night: 50, holiday: 200, batch: 5000    
        };

        const groupConstraints = preScheduleData?.settings?.groupConstraints || {};

        // 初始化人員統計
        const staffStats = {}; 
        validStaffList.forEach(s => {
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

        // 3. 鎖定預班
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (staffStats[uid]) {
                    if (sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            const day = parseInt(d);
                            assignments[uid][day] = wish;
                            if (wish !== 'OFF' && wish !== 'M_OFF') {
                                this.updateTempStats(staffStats[uid], wish, this.isHoliday(year, month, day));
                            }
                        });
                    }
                }
            });
        }

        // 4. 逐日排班
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

                    // 尋找候選人
                    const candidates = this.findValidCandidates(
                        assignments, validStaffList, day, shiftCode, rules, daysInMonth, shiftDefs, 
                        groupConstraints, staffStats
                    );
                    
                    // --- 除錯 Log: 如果缺人但找不到候選人 ---
                    if (candidates.length === 0 && neededCount > 0) {
                        // 只在第一天印，避免洗版
                        if (day === 1) console.warn(`⚠️ Day ${day} ${shiftCode}班 缺人，但無合格候選人！可能是規則太嚴。`);
                    }

                    // 計算分數
                    candidates.forEach(staff => {
                        staff.score = this.calculateScore(
                            staffStats[staff.uid], shiftCode, isHol, day, assignments, weights, rules.constraints
                        );
                    });

                    // 排序
                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

                    // 填入
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

        console.log("🏁 AI 排班結束");
        return { assignments, logs };
    }

    // --- 輔助方法 ---

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
        score += stats.totalShifts * weights.fairness;
        score += stats.nightShifts * weights.night;
        score += stats.holidayShifts * weights.holiday;

        const yesterdayShift = assignments[stats.uid][day - 1];
        if (yesterdayShift === shiftCode) score -= 1000;
        else if (yesterdayShift && yesterdayShift !== 'OFF' && yesterdayShift !== 'M_OFF') score += 500;

        const isNight = (shiftCode === 'E' || shiftCode === 'N');
        if (isNight) {
            if (stats.canBatch) {
                if (yesterdayShift === shiftCode) score -= weights.batch; 
            } else {
                if (yesterdayShift === shiftCode) score += 500; 
            }
        }
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
        
        // 取得當前該組別的人數
        const currentGroupCounts = {}; 
        Object.values(staffStats).forEach(stat => {
            const assigned = assignments[stat.uid][day];
            if (assigned === shiftCode && stat.group) {
                currentGroupCounts[stat.group] = (currentGroupCounts[stat.group] || 0) + 1;
            }
        });

        for (const staff of staffList) {
            const uid = staff.uid;
            if (assignments[uid][day]) continue; // 已經有班

            // 組別限制
            const group = staff.group;
            if (group && groupConstraints[group]) {
                const limit = this.getGroupMaxLimit(groupConstraints[group], shiftCode);
                const current = currentGroupCounts[group] || 0;
                if (limit !== null && current >= limit) continue;
            }

            // --- 規則引擎驗證 ---
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            // 這裡如果 shiftDefs 是空的，RuleEngine 可能會報錯或全部不通過
            const validation = RuleEngine.validateStaff(
                mockAssignments, daysInMonth, shiftDefs, rules, staff.constraints
            );
            
            if (!validation.errors[day]) {
                qualified.push(staff);
            } else {
                // 除錯：如果您在 Console 看到這個，就知道是被哪條規則擋掉
                // if (day === 1) console.log(`Staff ${staff.name} 被刷掉原因:`, validation.errors[day]);
            }
        }
        return qualified;
    }

    static getGroupMaxLimit(constraints, shift) {
        if (shift === 'E' && constraints.maxE !== undefined && constraints.maxE !== '') return parseInt(constraints.maxE);
        if (shift === 'N' && constraints.maxN !== undefined && constraints.maxN !== '') return parseInt(constraints.maxN);
        return null;
    }
}
