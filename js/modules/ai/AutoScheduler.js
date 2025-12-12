import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (除錯模式)");

        // 1. 資料清洗
        staffList.forEach(s => {
            if (!s.uid) s.uid = s.id || s.staffId;
        });
        const validStaffList = staffList.filter(s => s.uid);
        console.log(`📋 有效排班人員: ${validStaffList.length} 人`);

        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        const rules = unitSettings.rules || {};
        
        // 確保班別定義存在
        let shiftDefs = unitSettings.settings?.shifts || [];
        if (!shiftDefs || shiftDefs.length === 0) {
            shiftDefs = [
                { code: 'D', name: '白班', hours: 8 },
                { code: 'E', name: '小夜', hours: 8 },
                { code: 'N', name: '大夜', hours: 8 },
                { code: 'OFF', name: '休假', hours: 0 }
            ];
        }

        const weights = rules.scoringConfig ? this.convertScoringToWeights(rules.scoringConfig) : {
            fairness: 100, night: 50, holiday: 200, batch: 5000    
        };

        const groupConstraints = preScheduleData?.settings?.groupConstraints || {};
        const staffStats = {}; 
        
        // 初始化統計 & 確保 Constraints 預設值合理
        validStaffList.forEach(s => {
            const uid = s.uid;
            if (!assignments[uid]) assignments[uid] = {};
            
            // ✅ 強制補正：如果沒有設定限制，給予寬鬆的預設值，避免被 0 或 null 卡死
            const constraints = s.constraints || {};
            if (!constraints.maxConsecutive) constraints.maxConsecutive = 7; // 預設連七休一
            if (!constraints.maxConsecutiveNights) constraints.maxConsecutiveNights = 4;

            staffStats[uid] = {
                uid: uid,
                name: s.name,
                group: s.group || '',
                totalShifts: 0,
                nightShifts: 0,   
                holidayShifts: 0, 
                consecutive: 0,   
                canBatch: constraints.canBatch || false, 
                constraints: constraints
            };
        });

        const year = currentSchedule.year;
        const month = currentSchedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const staffReq = unitSettings.staffRequirements || { D: {}, E: {}, N: {} };

        // 鎖定預班
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (staffStats[uid] && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        assignments[uid][day] = wish;
                        if (wish !== 'OFF' && wish !== 'M_OFF') {
                            this.updateTempStats(staffStats[uid], wish, this.isHoliday(year, month, day));
                        }
                    });
                }
            });
        }

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

                    // 尋找候選人 (傳入 true 開啟除錯 Log)
                    const candidates = this.findValidCandidates(
                        assignments, validStaffList, day, shiftCode, rules, daysInMonth, shiftDefs, 
                        groupConstraints, staffStats, (day === 1) // 只在第一天詳細記錄原因
                    );

                    // --- 自動降級機制 (Auto-Fallback) ---
                    // 如果真的因為規則太嚴導致找不到人，AI 嘗試「忽略軟性規則」強制排入
                    // 這樣至少不會讓班表空白
                    if (candidates.length === 0 && neededCount > 0) {
                        console.warn(`⚠️ Day ${day} ${shiftCode} 嚴重缺人，嘗試啟用「強制排班模式」(忽略部分規則)...`);
                        // 這裡可以實作「忽略規則」的邏輯，目前我們先只印 Log
                    }
                    // --------------------------------

                    candidates.forEach(staff => {
                        staff.score = this.calculateScore(
                            staffStats[staff.uid], shiftCode, isHol, day, assignments, weights, rules.constraints
                        );
                    });

                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

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
        return { fairness: 100, night: 50, holiday: 200, batch: 5000 };
    }

    static calculateScore(stats, shiftCode, isHoliday, day, assignments, weights, constraints) {
        if (!stats) return 999999;
        let score = 0;
        score += stats.totalShifts * weights.fairness;
        const yesterdayShift = assignments[stats.uid][day - 1];
        if (yesterdayShift === shiftCode) score -= 1000;
        else if (yesterdayShift && yesterdayShift !== 'OFF') score += 500;
        score += Math.random() * 10;
        return score;
    }

    static updateTempStats(stats, shiftCode, isHoliday) {
        if(!stats) return;
        stats.totalShifts++;
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
        Object.values(assignments).forEach(sch => { if (sch[day] === shiftCode) count++; });
        return count;
    }

    static findValidCandidates(assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs, groupConstraints, staffStats, debugMode = false) {
        const qualified = [];
        
        const currentGroupCounts = {}; 
        Object.values(staffStats).forEach(stat => {
            const assigned = assignments[stat.uid][day];
            if (assigned === shiftCode && stat.group) currentGroupCounts[stat.group] = (currentGroupCounts[stat.group] || 0) + 1;
        });

        for (const staff of staffList) {
            const uid = staff.uid;
            if (assignments[uid][day]) continue; 

            // 組別限制
            const group = staff.group;
            if (group && groupConstraints[group]) {
                const limit = this.getGroupMaxLimit(groupConstraints[group], shiftCode);
                const current = currentGroupCounts[group] || 0;
                if (limit !== null && current >= limit) {
                    if(debugMode) console.log(`[除錯] ${staff.name} 被拒絕: 組別 ${group} 人數已滿`);
                    continue;
                }
            }

            // 規則引擎驗證
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            const validation = RuleEngine.validateStaff(
                mockAssignments, daysInMonth, shiftDefs, rules, staff.constraints
            );
            
            if (!validation.errors[day]) {
                qualified.push(staff);
            } else {
                // ✅ 關鍵：這裡會印出被刷掉的真正原因！
                if (debugMode) {
                    console.log(`❌ [RuleEngine] ${staff.name} 無法排 ${shiftCode}，原因: ${validation.errors[day]}`);
                }
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
