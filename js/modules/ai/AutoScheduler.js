import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v3.4 偏好與拒絕原因診斷版)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.log("🚀 AI 排班引擎啟動 (v3.4 診斷版)");

        try {
            // --- 1. 上下文準備 (含詳細人員偏好檢查) ---
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // --- 2. 包班預填 ---
            this.prefillBatchShifts(context);

            // --- 3. 步進式排班 ---
            console.log("🔹 開始每日步進排班...");
            const success = await this.solveDay(1, context);

            if (success) {
                console.log("✅ 排班成功！");
                return { assignments: context.assignments, logs: context.logs };
            } else {
                console.warn(`⚠️ 排班失敗，最後停留在 Day: ${context.maxReachedDay}`);
                return { assignments: context.assignments, logs: context.logs }; 
            }

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備 (新增人員偏好檢查 Log)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 基礎防呆
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

        // 容器初始化
        const assignments = {};
        const wishes = {}; 
        const lastMonthShifts = {}; 

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            lastMonthShifts[s.uid] = 'OFF'; // 預設 OFF
        });

        // 預班載入
        try {
            Object.entries(submissions || {}).forEach(([uid, sub]) => {
                if (assignments[uid] && sub && sub.wishes) {
                    Object.entries(sub.wishes || {}).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish;
                        assignments[uid][day] = wish; 
                    });
                }
            });
        } catch(e) {}

        // 歷史載入
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

        // 注入 Day 0
        validStaffList.forEach(s => {
            assignments[s.uid][0] = lastMonthShifts[s.uid];
        });

        // 🔥 [診斷 1] 列出所有人員的讀入狀態
        console.group("👥 [AI Debug] 人員資料與偏好總檢");
        validStaffList.forEach(s => {
            const sub = submissions[s.uid] || {};
            const pref = sub.preferences || {}; // 讀取 preferences 欄位
            const wishCount = Object.keys(wishes[s.uid] || {}).length;
            
            // 從 constraints 或 preferences 讀取包班
            const batch = s.constraints.batchPref || pref.batch || "無";
            const p1 = pref.priority1 || "-";
            const p2 = pref.priority2 || "-";

            console.log(`- ${s.name}: [包班:${batch}] [志願:${p1}>${p2}] [預班數:${wishCount}] [上月:${lastMonthShifts[s.uid]}]`);
        });
        console.groupEnd();

        // 人力需求
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
            lastMonthShifts: lastMonthShifts,
            rules: rules,
            staffReq: staffReq,
            shiftDefs: shiftDefs,
            shiftPriority: ['N', 'E', 'D', 'OFF'], 
            logs: [],
            maxBacktrack: 10000, 
            backtrackCount: 0,
            maxReachedDay: 0
        };
    }

    static prefillBatchShifts(context) {
        context.staffList.forEach(staff => {
            // 同步檢查 constraints 和 submissions 裡的包班設定
            const sub = (context.preScheduleData?.submissions || {})[staff.uid] || {};
            const pref = sub.preferences || {};
            const batchType = staff.constraints?.batchPref || pref.batch; 

            if ((staff.constraints?.canBatch || pref.batch) && batchType) {
                for (let day = 1; day <= context.daysInMonth; day++) {
                    if (!context.assignments[staff.uid][day]) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
    }

    // ============================================================
    //  核心邏輯 3: 每日步進
    // ============================================================
    static async solveDay(day, context) {
        if (day > context.maxReachedDay) context.maxReachedDay = day;
        if (day > context.daysInMonth) return true;

        const pendingStaff = context.staffList.filter(s => !context.assignments[s.uid][day]);
        this.shuffleArray(pendingStaff);

        if (await this.solveStaffForDay(day, pendingStaff, 0, context)) {
            const check = this.checkDailyManpower(day, context);
            if (check.isValid) {
                if (day % 3 === 0) await new Promise(r => setTimeout(r, 0));
                if (await this.solveDay(day + 1, context)) return true;
            } else {
                if (day === 1) {
                    console.warn(`❌ [Day 1] 人力不足，無法推進! 細節: ${check.missing}`);
                }
            }
        }

        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人決策 (含 Day 1 詳細拒絕原因)
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        let candidates = [...context.shiftPriority];

        const prevAssignment = context.assignments[staff.uid][day - 1] || 'OFF';
        const prevWish = context.wishes[staff.uid][day - 1]; 

        // 規則：預休 OFF 不接 N
        if (candidates.includes('N')) {
            if (day > 1 && prevAssignment === 'OFF' && (prevWish === 'OFF' || prevWish === 'M_OFF')) {
                candidates = candidates.filter(c => c !== 'N');
            }
        }

        for (const shift of candidates) {
            context.assignments[staff.uid][day] = shift;
            
            // 簡易 Hard Check
            let hardCheckPassed = true;
            let hardCheckReason = "";
            
            if (context.rules.constraints?.minInterval11h) {
                if (prevAssignment === 'E' && shift === 'D') { hardCheckPassed = false; hardCheckReason = "E接D違規"; }
                if (prevAssignment === 'D' && shift === 'N') { hardCheckPassed = false; hardCheckReason = "D接N違規"; }
            }

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
                } else {
                    // 🔥 [診斷 2] Day 1 拒絕原因
                    if (day === 1 && shift !== 'OFF') {
                        console.log(`🚫 [Day 1] ${staff.name} 試排 [${shift}] 失敗 -> ${result.errors[day]}`);
                    }
                }
            } else {
                // 🔥 [診斷 2] Day 1 硬規則拒絕
                if (day === 1 && shift !== 'OFF') {
                    console.log(`🚫 [Day 1] ${staff.name} 試排 [${shift}] 失敗 -> 硬規則: ${hardCheckReason} (昨:${prevAssignment})`);
                }
            }
        }

        delete context.assignments[staff.uid][day];
        return false;
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
