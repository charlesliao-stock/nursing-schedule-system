import { RuleEngine } from "./RuleEngine.js";

export class AutoScheduler {

    /**
     * 執行自動排班
     * @param {Object} currentSchedule 目前的班表物件 (assignments)
     * @param {Array} staffList 人員列表 (Array)
     * @param {Object} unitSettings 單位設定 (含 rules, staffRequirements)
     * @param {Object} preScheduleData 預班資料 (含 submissions)
     * @returns {Object} { assignments, logs }
     */
    static run(currentSchedule, staffList, unitSettings, preScheduleData) {
        // 1. 深拷貝 assignments，避免副作用
        let assignments = JSON.parse(JSON.stringify(currentSchedule.assignments || {}));
        const logs = [];

        // 初始化每個員工的空物件 (若尚未建立)
        staffList.forEach(s => {
            if (!assignments[s.id]) assignments[s.id] = {};
        });

        const year = currentSchedule.year;
        const month = currentSchedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const rules = unitSettings.rules || {};
        const staffReq = unitSettings.staffRequirements || { D: {}, E: {}, N: {} };
        const shiftDefs = unitSettings.settings?.shifts || [];

        // ----------------------------------------------------
        // Step 1: 鎖定預班 (Pre-Schedule) 的 OFF
        // ----------------------------------------------------
        if (preScheduleData && preScheduleData.submissions) {
            Object.entries(preScheduleData.submissions).forEach(([uid, sub]) => {
                if (sub.wishes && assignments[uid]) {
                    Object.entries(sub.wishes).forEach(([d, wish]) => {
                        if (wish === 'OFF') {
                            assignments[uid][d] = 'OFF';
                        }
                    });
                }
            });
            logs.push("✅ 已鎖定預班休假需求");
        }

        // ----------------------------------------------------
        // Step 2: 開始逐日排班
        // ----------------------------------------------------
        // 策略：優先排大夜(N) -> 小夜(E) -> 白班(D)，因為夜班限制最嚴格
        const shiftPriority = ['N', 'E', 'D'];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekDay = date.getDay(); // 0(日) - 6(六)

            shiftPriority.forEach(shiftCode => {
                // 取得當日該班別的需求人數
                // 注意：staffReq 結構通常是 { 'N': { '0': 2, '1': 2 ... } }
                const needed = (staffReq[shiftCode] && staffReq[shiftCode][weekDay]) || 0;

                // 計算目前已排人數 (可能包含手動排的)
                let currentCount = this.countStaff(assignments, day, shiftCode);

                // 若人數不足，開始找人
                if (currentCount < needed) {
                    const neededCount = needed - currentCount;
                    
                    // A. 找出候選人
                    const candidates = this.findCandidates(
                        assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs
                    );

                    // B. 隨機打亂 (公平性)
                    this.shuffleArray(candidates);

                    // C. 填入班表
                    let filled = 0;
                    for (const staff of candidates) {
                        if (filled >= neededCount) break;
                        
                        assignments[staff.id][day] = shiftCode;
                        currentCount++;
                        filled++;
                    }

                    if (currentCount < needed) {
                        logs.push(`⚠️ ${day}日 (${shiftCode}班): 缺 ${needed - currentCount} 人`);
                    }
                }
            });
        }

        // ----------------------------------------------------
        // Step 3: 填充其餘空位 (可選：填入 OFF 或保留空白)
        // ----------------------------------------------------
        // 這裡我們保留空白，讓使用者能看清楚哪些是系統沒填的，
        // 或者您也可以呼叫 BasicAlgorithm.fillEmptyWithOff

        return { assignments, logs };
    }

    // 計算某日某班已排人數
    static countStaff(assignments, day, shiftCode) {
        let count = 0;
        Object.values(assignments).forEach(sch => {
            if (sch[day] === shiftCode) count++;
        });
        return count;
    }

    // 尋找合格候選人
    static findCandidates(assignments, staffList, day, shiftCode, rules, daysInMonth, shiftDefs) {
        const qualified = [];

        for (const staff of staffList) {
            const uid = staff.id;

            // 1. 基本過濾：若當天已排班 (含 OFF)，跳過
            if (assignments[uid] && assignments[uid][day]) continue;

            // 2. 模擬排班：假設排下去，會不會違規？
            const mockAssignments = { ...assignments[uid] };
            mockAssignments[day] = shiftCode;

            // 3. 呼叫 RuleEngine 進行檢查
            // 這裡傳入 shiftDefs 是為了讓 RuleEngine 知道哪些是班別代號
            const validation = RuleEngine.validateStaff(
                mockAssignments, daysInMonth, shiftDefs, rules
            );

            // 4. 若該日沒有產生錯誤，則視為合格
            // 注意：validateStaff 回傳的是整個月的 errors { day: msg }
            if (!validation.errors[day]) {
                qualified.push(staff);
            }
        }
        return qualified;
    }

    // Fisher-Yates Shuffle 演算法
    static shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
