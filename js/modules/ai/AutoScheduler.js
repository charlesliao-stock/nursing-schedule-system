import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 啟動排班引擎 (v3.2 除錯診斷版)
     */
    static async run(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.time("AI_Run_Time");
        console.log("🚀 AI 排班引擎啟動 (v3.2 除錯診斷版)");

        try {
            // --- 1. 上下文準備 (含詳細資料檢查) ---
            const context = this.prepareContext(currentSchedule, staffList, unitSettings, preScheduleData);
            
            // --- 2. 包班預填 ---
            console.log("🔹 執行包班預填...");
            this.prefillBatchShifts(context);

            // --- 3. 步進式排班 ---
            console.log("🔹 開始每日步進排班...");
            const success = await this.solveDay(1, context);

            console.timeEnd("AI_Run_Time");
            if (success) {
                console.log("✅ 排班成功！總回溯次數:", context.backtrackCount);
                return { assignments: context.assignments, logs: context.logs };
            } else {
                console.warn(`⚠️ 排班完成 (達回溯上限 ${context.maxBacktrack})，結果可能不完美`);
                console.warn("❌ 最後停留在 Day:", context.maxReachedDay);
                return { assignments: context.assignments, logs: context.logs }; 
            }

        } catch (e) {
            console.error("❌ 排班引擎崩潰:", e);
            return { assignments: {}, logs: [`Critical Error: ${e.message}`] };
        }
    }

    // ============================================================
    //  核心邏輯 1: 上下文準備 (加入詳細 Log)
    // ============================================================
    static prepareContext(currentSchedule, staffList, unitSettings, preScheduleData) {
        console.group("📋 [AI Debug] 資料讀取檢查");

        // 1. 基礎物件
        currentSchedule = currentSchedule || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        unitSettings = unitSettings || {};
        preScheduleData = preScheduleData || {}; 
        
        const rules = unitSettings.rules || {};
        const settings = unitSettings.settings || {};
        const submissions = preScheduleData.submissions || {};
        const historyData = preScheduleData.history || {};

        console.log(`📅 目標月份: ${currentSchedule.year}-${currentSchedule.month}`);
        
        // 2. 人員清洗
        const validStaffList = (staffList || [])
            .filter(s => s && (s.uid || s.id))
            .map(s => {
                const newS = { ...s };
                newS.uid = s.uid || s.id;
                newS.constraints = s.constraints || {};
                // 補足預設值
                if (newS.constraints.maxConsecutive === undefined) newS.constraints.maxConsecutive = 7;
                if (newS.constraints.maxConsecutiveNights === undefined) newS.constraints.maxConsecutiveNights = 4;
                return newS;
            });

        console.log(`👥 有效人員數: ${validStaffList.length}`);
        if (validStaffList.length > 0) {
            console.log(`   └─ 範例人員: ${validStaffList[0].name} (UID: ${validStaffList[0].uid})`);
        } else {
            console.error("❌ 錯誤: 沒有有效的人員名單！");
        }

        // 3. 規則檢查
        console.log(`⚖️ 排班規則:`, rules.constraints || "無限制");
        
        // 4. 人力需求檢查
        const rawReq = unitSettings.staffRequirements || {};
        const staffReq = { D: rawReq.D || {}, E: rawReq.E || {}, N: rawReq.N || {} };
        console.log(`🔢 人力需求 (範例週一): D=${staffReq.D[1]||0}, E=${staffReq.E[1]||0}, N=${staffReq.N[1]||0}`);

        // 5. 容器初始化
        const assignments = {};
        const wishes = {}; 
        const lastMonthShifts = {}; 

        validStaffList.forEach(s => {
            assignments[s.uid] = {};
            wishes[s.uid] = {};
            lastMonthShifts[s.uid] = 'OFF'; 
        });

        // 6. 預班載入
        let wishCount = 0;
        try {
            Object.entries(submissions || {}).forEach(([uid, sub]) => {
                if (assignments[uid] && sub && sub.wishes) {
                    Object.entries(sub.wishes || {}).forEach(([d, wish]) => {
                        const day = parseInt(d);
                        wishes[uid][day] = wish;
                        assignments[uid][day] = wish; 
                        wishCount++;
                    });
                }
            });
        } catch(e) { console.warn("預班讀取警告:", e); }
        console.log(`✨ 載入預班總數: ${wishCount}`);

        // 7. 歷史資料載入
        let historyCount = 0;
        try {
            Object.entries(historyData || {}).forEach(([uid, history]) => {
                if (assignments[uid] && history) {
                    const days = Object.keys(history || {}).map(k => parseInt(k)).sort((a,b)=>b-a);
                    if (days.length > 0) {
                        const lastDay = days[0];
                        const lastShift = history[lastDay];
                        if (lastShift && lastShift.trim() !== '') {
                            lastMonthShifts[uid] = lastShift;
                            historyCount++;
                        }
                    }
                }
            });
        } catch(e) { console.warn("歷史資料讀取警告:", e); }
        console.log(`📚 載入上月歷史: ${historyCount} 筆`);
        console.groupEnd();

        let shiftDefs = settings.shifts || [
            { code: 'D', name: '白班' }, { code: 'E', name: '小夜' }, { code: 'N', name: '大夜' }, { code: 'OFF', name: '休假' }
        ];

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
            maxBacktrack: 30000, 
            backtrackCount: 0,
            maxReachedDay: 0 // 用於追蹤排到第幾天失敗
        };
    }

    // ============================================================
    //  核心邏輯 2: 包班預填
    // ============================================================
    static prefillBatchShifts(context) {
        let batchCount = 0;
        context.staffList.forEach(staff => {
            const batchType = staff.constraints?.batchPref; 
            if (staff.constraints?.canBatch && batchType) {
                batchCount++;
                for (let day = 1; day <= context.daysInMonth; day++) {
                    const existing = context.assignments[staff.uid][day];
                    if (!existing) {
                        context.assignments[staff.uid][day] = batchType;
                    }
                }
            }
        });
        console.log(`📦 包班人員處理: ${batchCount} 人`);
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
                // 除錯：只在回溯次數較少時印出，避免洗版
                if (context.backtrackCount < 50) {
                    console.log(`⚠️ Day ${day} 人力不足: ${check.missing} -> 回溯`);
                }
            }
        }

        this.rollbackDay(day, pendingStaff, context);
        return false;
    }

    // ============================================================
    //  核心邏輯 4: 單人決策
    // ============================================================
    static async solveStaffForDay(day, staffList, index, context) {
        if (index >= staffList.length) return true;

        context.backtrackCount++;
        // 每 5000 次回溯印一次 Log，確保還在跑
        if (context.backtrackCount % 5000 === 0) {
            console.log(`⏳ 計算中... 回溯次數: ${context.backtrackCount}, 目前在 Day ${day}`);
        }
        
        if (context.backtrackCount > context.maxBacktrack) return false;

        const staff = staffList[index];
        let candidates = [...context.shiftPriority];

        // --- 前一天判斷 ---
        let prevAssignment = 'OFF';
        let prevWish = null;

        if (day === 1) {
            prevAssignment = context.lastMonthShifts[staff.uid] || 'OFF';
        } else {
            prevAssignment = context.assignments[staff.uid][day - 1] || 'OFF';
            prevWish = context.wishes[staff.uid][day - 1];
        }

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
            if (context.rules.constraints?.minInterval11h) {
                if (prevAssignment === 'E' && shift === 'D') hardCheckPassed = false;
                if (prevAssignment === 'D' && shift === 'N') hardCheckPassed = false;
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
                }
            }
        }

        delete context.assignments[staff.uid][day];
        return false;
    }

    // ============================================================
    //  輔助方法
    // ============================================================
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
            const reqObj = context.staffReq[s] || {};
            const req = reqObj[w] || 0;
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
