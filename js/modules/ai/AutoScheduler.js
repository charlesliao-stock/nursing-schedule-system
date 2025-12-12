import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 執行公平性優先的自動排班
     */
    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 初始化與深拷貝
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];
        
        // 讀取權重設定
        const rules = unitSettings.rules || {};
        const weights = rules.scoringConfig ? this.convertScoringToWeights(rules.scoringConfig) : {
            fairness: 100, 
            night: 50,     
            holiday: 200, 
            batch: 5000    
        };

        // 讀取組別限制 (來自 PreScheduleManagePage 設定的 groupConstraints)
        const groupConstraints = preScheduleData?.settings?.groupConstraints || {};

        // 建立統計物件
        const staffStats = {}; 
        staffList.forEach(s => {
            // ✅ 修正點 1: 使用 s.uid 而非 s.id
            const uid = s.uid; 
            if (!assignments[uid]) assignments[uid] = {};
            
            staffStats[uid] = {
                uid: uid,
                name: s.name,
                group: s.group || '', // 記錄組別
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

        // ----------------------------------------------------
        // Step 1: 鎖定預班 (Wishes) 並初始化統計
        // ----------------------------------------------------
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                // ✅ 修正點 2: 確保 assignments[uid] 存在
                if (!assignments[uid]) assignments[uid] = {};

                if (sub.wishes) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        if (wish === 'OFF' || wish === 'M_OFF') {
                            assignments[uid][day] = 'OFF';
                        } else {
                            assignments[uid][day] = wish;
                            // 若預班有上班，更新統計
                            if(staffStats[uid]) {
                                this.updateTempStats(staffStats[uid], wish, this.isHoliday(year, month, day));
                            }
                        }
                    });
                }
            });
            logs.push("✅ 已鎖定預班需求");
        }

        // ----------------------------------------------------
        // Step 2: 逐日排班 (Day 1 -> Day 30)
        // ----------------------------------------------------
        // 優先順序：大夜 -> 小夜 -> 白班 (夜班通常較難排，先卡位)
        const shiftPriority = ['N', 'E', 'D']; 

        for (let day = 1; day <= daysInMonth; day++) {
            const isHol = this.isHoliday(year, month, day);
            const weekDay = new Date(year, month - 1, day).getDay();

            // 更新昨天的狀態 (計算連續天數用)
            this.updateDailyStats(staffStats, assignments, day - 1);

            shiftPriority.forEach(shiftCode => {
                // 取得當日該班別需求人數
                const needed = (staffReq[shiftCode] && staffReq[shiftCode][weekDay]) || 0;
                
                // 計算目前已排人數 (包含預班)
                let currentCount = this.countStaff(assignments, day, shiftCode);

                if (currentCount < needed) {
                    const neededCount = needed - currentCount;

                    // A. 找出候選人 (硬規則篩選 + 組別限制)
                    const candidates = this.findValidCandidates(
                        assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs, 
                        groupConstraints, staffStats // 傳入組別限制與統計
                    );

                    // B. 計算分數 (軟規則加權)
                    candidates.forEach(staff => {
                        // ✅ 修正點 3: 使用 staff.uid
                        staff.score = this.calculateScore(
                            staffStats[staff.uid], shiftCode, isHol, day, assignments, weights
                        );
                    });

                    // C. 排序：分數低者優先 (Cost Function)
                    candidates.sort((a, b) => a.score - b.score || Math.random() - 0.5);

                    // D. 填入
                    let filled = 0;
                    for (const staff of candidates) {
                        if (filled >= neededCount) break;
                        
                        // ✅ 修正點 4: 使用 staff.uid
                        assignments[staff.uid][day] = shiftCode;
                        
                        // 立即更新暫時統計
                        this.updateTempStats(staffStats[staff.uid], shiftCode, isHol);
                        
                        currentCount++;
                        filled++;
                    }

                    if (currentCount < needed) {
                        // 記錄缺班，供前端顯示缺班池
                        // logs.push(`Day ${day} ${shiftCode}: 缺 ${needed - currentCount}`);
                    }
                }
            });
        }

        return { assignments, logs };
    }

    // ---------------------------------------------------------
    // 輔助方法
    // ---------------------------------------------------------

    static isHoliday(year, month, day) {
        const date = new Date(year, month - 1, day);
        const d = date.getDay();
        return d === 0 || d === 6;
    }

    // 將 ScoringService 的複雜設定簡化為權重
    static convertScoringToWeights(config) {
        return {
            fairness: (config.fairness?.subs?.hours?.weight || 15) * 10,
            night: (config.health?.subs?.night?.weight || 8) * 10,
            holiday: (config.fairness?.subs?.shifts?.weight || 15) * 10,
            batch: 5000 // 固定獎勵
        };
    }

    static calculateScore(stats, shiftCode, isHoliday, day, assignments, weights) {
        if (!stats) return 999999;
        
        let score = 0;

        // 1. 公平性 (總班數越少越優先被選中)
        score += stats.totalShifts * weights.fairness;
        
        // 2. 夜班負載
        score += stats.nightShifts * weights.night;
        
        // 3. 假日班負載
        score += stats.holidayShifts * weights.holiday;

        // 4. 包班 vs 散班邏輯
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

        // 5. 疲勞度 (連續上班天數平方，避免連上太多天)
        score += Math.pow(stats.consecutive, 2) * 50; 

        // 6. 隨機擾動 (避免每次結果完全一樣)
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
            // 若昨天沒排班或排OFF，連續天數歸零
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

    /**
     * 找出當天可以上該班別的候選人
     */
    static findValidCandidates(assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs, groupConstraints, staffStats) {
        const qualified = [];
        
        // 1. 計算目前各組別在當天該班別已有人數 (用於組別上限檢查)
        const currentGroupCounts = {}; 
        Object.values(assignments).forEach(row => {
            const shift = row[day];
            if (shift === shiftCode) { // 只有相同班別才算
                // 這裡需要反查該人員的組別，略微複雜，我們改用簡單方式：
                // 遍歷 staffStats 找到對應 uid 的組別
                // 由於這是內層迴圈，效能要注意，但 N<100 尚可
            }
        });
        
        // 優化：直接遍歷 staffStats 建立當日當班的組別計數
        Object.values(staffStats).forEach(stat => {
            const assigned = assignments[stat.uid][day];
            if (assigned === shiftCode && stat.group) {
                currentGroupCounts[stat.group] = (currentGroupCounts[stat.group] || 0) + 1;
            }
        });

        for (const staff of staffList) {
            // ✅ 修正點 5: 使用 staff.uid
            const uid = staff.uid;
            
            // 若該員當天已有排班，跳過
            if (assignments[uid][day]) continue;

            // --- 規則檢查 A: 組別限制 (Max) ---
            const group = staff.group;
            if (group && groupConstraints[group]) {
                const limit = this.getGroupMaxLimit(groupConstraints[group], shiftCode);
                const current = currentGroupCounts[group] || 0;
                // 若已達該組別該班別上限，則該員不適合
                if (limit !== null && current >= limit) continue;
            }

            // --- 規則檢查 B: 個人與全域規則 (RuleEngine) ---
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            // 將人員個別限制傳入 RuleEngine
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
        // 對應 PreScheduleManagePage 的欄位名稱
        if (shift === 'E' && constraints.maxE !== undefined && constraints.maxE !== '') return constraints.maxE;
        if (shift === 'N' && constraints.maxN !== undefined && constraints.maxN !== '') return constraints.maxN;
        // 白班通常不限上限，或可依需求擴充
        return null;
    }
}
