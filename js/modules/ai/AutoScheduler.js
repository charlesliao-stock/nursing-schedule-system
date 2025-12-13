import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v3.7 包班自動調節版)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v3.7 包班自動調節版)");

        try {
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // 1. 先加法：包班預填 (全部填滿，不管是否爆量)
            this.prefillBatchShifts(context);

            console.log("🔹 開始每日步進排班 (含過剩調節)...");
            
            // 2. 每日排班 (含減法調節)
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
            } else {
                console.warn(`⚠️ 排班勉強完成，最後停留在 Day ${context.maxReachedDay}`);
            }
            return { assignments: context.assignments, logs: context.logs };

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  1. 上下文準備
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // ... (基礎防呆與資料讀取，保持不變) ...
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        // 人員清洗
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 7;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

        const assignments = {};
        const wishes = {}; 
        const preferences = {}; 
        const lastMonthShifts = {}; 

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            preferences[s.uid] = { p1: null, p2: null, batch: null }; 
            lastMonthShifts[s.uid] = 'OFF'; 
        });

        // 載入預班與偏好
        try {
            Object.entries(submissions || {}).forEach(([uid, sub]) => {
                if (assignments[uid]) {
                    if (sub && sub.wishes) {
                        Object.entries(sub.wishes).forEach(([d, wish]) => {
                            wishes[uid][parseInt(d)] = wish;
                            assignments[uid][parseInt(d)] = wish; 
                        });
                    }
                    if (sub && sub.preferences) {
                        preferences[uid] = {
                            p1: sub.preferences.priority1 || null,
                            p2: sub.preferences.priority2 || null,
                            batch: sub.preferences.batch || null
                        };
                    }
                }
            });
        } catch(e) {}

        // 載入歷史
        try {
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) {
                        const lastShift = history[days[0]];
                        if (lastShift && lastShift.trim() !== '') {
                            lastMonthShifts[uid] = lastShift;
                        }
                    }
                }
            });
        } catch(e) {}

        validStaffList.forEach(s => {
            assignments[s.uid][0] = lastMonthShifts[s.uid];
        });

        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { D: rawReq.D || {}, E: rawReq.E || {}, N: rawReq.N || {} };
        const shiftDefs = settings.shifts || [];

        return {
            year: currentSchedule.year,
            month: currentSchedule.month,
            daysInMonth: new Date(currentSchedule.year, currentSchedule.month, 0).getDate(),
            staffList: validStaffList,
            assignments: assignments,
            wishes: wishes,
            preferences: preferences,
            lastMonthShifts: lastMonthShifts,
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
            logs: [],
            maxBacktrack: 15000, 
            backtrackCount: 0,
            maxReachedDay: 0
        };
    }

    // ============================================================
    //  2. 包班預填 (Fill)
    // ============================================================
    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            const prefBatch = context.preferences[staff.uid]?.batch;
            const constraintBatch = staff.constraints?.batchPref;
            const batchType = constraintBatch || prefBatch;

            if ((staff.constraints?.canBatch || prefBatch) && batchType) {
                context.preferences[staff.uid].realBatch = batchType;

                for (let day = 1; day <= context.daysInMonth; day++) {
                    // 若無預班 (Wish)，則預填包班
                    if (!context.assignments[staff.uid][day]) {
                        context.assignments[staff.uid][day] = batchType;
                        // 標記這是系統自動填的，稍後可以被調節
                        if (!context.assignments[staff.uid].autoTags) context.assignments[staff.uid].autoTags = {};
                        context.assignments[staff.uid].autoTags[day] = 'batch_auto';
                    }
                }
            }
        });
    }

    // ============================================================
    //  3. 每日步進 (Solve + Prune)
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        // 🔥 新增步驟：調節包班過剩 (Prune)
        // 在排其他人之前，先檢查預填的包班是否太多了，如果是，把最累的人改成 OFF
        this.adjustBatchOverstaffing(day, context);

        // 找出還沒排班的人 (Pending)
        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        const success = await this.solveStaffForDay(day, pendingStaff, 0, context);

        // 檢查人力並推進
        const check = this.checkDailyManpower(day, context);
        if (success && check.isValid) {
            if (day % 5 === 0) await new Promise(r => setTimeout(r, 0));
            return await this.solveDay(day + 1, context);
        } else {
            console.warn(`⚠️ [Day ${day}] 人力缺口: ${check.missing} (啟用強制推進)`);
            await this.solveDay(day + 1, context);
            return true;
        }
    }

    // ============================================================
    //  3.1 包班調節邏輯 (關鍵新增)
    // ============================================================
    static adjustBatchOverstaffing(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();

        ['N', 'E', 'D'].forEach(shift => {
            const req = (context.staffReq[shift] && context.staffReq[shift][w]) || 0;
            if (req === 0) return; // 如果當天不需要這個班，全砍或保留視策略而定 (這邊假設保留)

            // 1. 找出當天被排了這個班，且是「系統自動預填 (batch_auto)」的人
            // (注意：不能動到使用者的預班 Wish)
            const assignedStaff = context.staffList.filter(s => {
                const assigned = context.assignments[s.uid][day];
                const tags = context.assignments[s.uid].autoTags || {};
                return assigned === shift && tags[day] === 'batch_auto';
            });

            // 2. 檢查總人數 (含 Wish 的人)
            let totalCount = 0;
            context.staffList.forEach(s => { if (context.assignments[s.uid][day] === shift) totalCount++; });

            // 3. 如果人數爆量 (Total > Req)，需要修剪
            if (totalCount > req) {
                const cutCount = totalCount - req;
                
                // 4. 排序：誰最該休息？ (累積上班天數多的人優先休息)
                // 我們計算截至昨天的連續上班天數
                assignedStaff.sort((a, b) => {
                    const daysA = this.calculateConsecutiveWork(a.uid, day, context);
                    const daysB = this.calculateConsecutiveWork(b.uid, day, context);
                    return daysB - daysA; // 天數多的排前面 (優先被切掉)
                });

                // 5. 執行修剪 (將多出來的人改為 OFF)
                // 注意：只修剪 assignedStaff (自動預填的人)，不會動到 Wish
                for (let i = 0; i < cutCount && i < assignedStaff.length; i++) {
                    const staffToCut = assignedStaff[i];
                    context.assignments[staffToCut.uid][day] = 'OFF';
                    // console.log(`✂️ [Day ${day}] ${staffToCut.name} 包班(${shift})過剩，調整為 OFF (已連上 ${this.calculateConsecutiveWork(staffToCut.uid, day, context)} 天)`);
                }
            }
        });
    }

    static calculateConsecutiveWork(uid, currentDay, context) {
        let count = 0;
        for (let d = currentDay - 1; d >= 0; d--) {
            const shift = context.assignments[uid][d];
            if (shift && shift !== 'OFF' && shift !== 'M_OFF') {
                count++;
            } else {
                break;
            }
        }
        return count;
    }

    // ============================================================
    //  4. 單人決策 (同 v3.6)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        let candidates = [];

        const wish = context.wishes[staff.uid][day];
        if (wish) {
            candidates = [wish];
        } else {
            const pref = context.preferences[staff.uid];
            const batchType = pref.realBatch;
            
            // 包班者：若前面沒有被修剪成 OFF，這裡不會進來 (因為已經有 assignments)
            // 但如果被修剪成 OFF，他可能還有機會排別的嗎？
            // 目前邏輯：solveDay 只跑 "pendingStaff" (沒班的人)。
            // 如果 prefill 填了班，他就不在 pendingStaff。
            // 如果 adjustBatchOverstaffing 把他改成 OFF，他就有班了 (OFF)，也不在 pendingStaff。
            // 所以包班者一旦被修剪，當天就是 OFF，這符合邏輯。

            // 一般人員候選
            if (batchType) candidates.push(batchType);
            else {
                if (pref.p1 && !candidates.includes(pref.p1)) candidates.push(pref.p1);
                if (pref.p2 && !candidates.includes(pref.p2)) candidates.push(pref.p2);
            }
            ['N', 'E', 'D'].forEach(s => { if (!candidates.includes(s)) candidates.push(s); });
            if (!candidates.includes('OFF')) candidates.push('OFF');
        }

        const prevAssignment = context.assignments[staff.uid][day - 1] || 'OFF';
        const prevWish = context.wishes[staff.uid][day - 1]; 

        if (candidates.includes('N')) {
            if (day > 1 && prevAssignment === 'OFF' && (prevWish === 'OFF' || prevWish === 'M_OFF')) {
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        for (const shift of candidates) {
            context.assignments[staff.uid][day] = shift;
            
            let hardCheckPassed = true;
            if (context.rules.constraints?.minInterval11h) {
                if (prevAssignment === 'E' && shift === 'D') hardCheckPassed = false;
                if (prevAssignment === 'D' && shift === 'N') hardCheckPassed = false;
            }
            if (staff.constraints.isPregnant && (shift === 'N' || shift === 'E')) hardCheckPassed = false;

            if (hardCheckPassed) {
                const result = RuleEngine.validateStaff(
                    context.assignments[staff.uid], 
                    context.daysInMonth, 
                    context.shiftDefs, 
                    context.rules, 
                    staff.constraints
                );

                if (!result.errors[day]) {
                    if (await this.solveStaffForDay(day, staffList, index + 1, context)) {
                        return true;
                    }
                }
            }
        }
        return await this.solveStaffForDay(day, staffList, index + 1, context);
    }

    static checkDailyManpower(day, context) {
        const date = new Date(context.year, context.month - 1, day);
        const w = date.getDay();
        const counts = { D: 0, E: 0, N: 0 };
        Object.values(context.assignments).forEach(sch => {
            const s = sch[day];
            if (counts[s] !== undefined) counts[s]++;
        });
        const missing = [];
        ['D', 'E', 'N'].forEach(s => {
            const req = (context.staffReq[s] && context.staffReq[s][w]) || 0;
            if (counts[s] < req) missing.push(`${s}: ${counts[s]}/${req}`);
        });
        return { isValid: missing.length === 0, missing: missing.join(', ') };
    }

    static rollbackDay(day, staffList, context) {
        staffList.forEach(s => delete context.assignments[s.uid][day]);
    }

    static shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
