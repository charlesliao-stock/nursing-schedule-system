import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 【新增】
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    
    render() {
        return `
            <div class="dashboard-content">
                <h2>系統概覽</h2>
                <div class="stats-grid">
                    <div class="stat-card" onclick="location.hash='/system/units/list'" style="cursor:pointer">
                        <div class="stat-icon"><i class="fas fa-building"></i></div>
                        <div class="stat-info">
                            <h3>單位總數</h3>
                            <p id="unit-count-display" class="stat-value">...</p>
                        </div>
                    </div>
                    <div class="stat-card" onclick="location.hash='/unit/staff/list'" style="cursor:pointer">
                        <div class="stat-icon"><i class="fas fa-user-nurse"></i></div>
                        <div class="stat-info">
                            <h3>人員總數</h3>
                            <p id="staff-count-display" class="stat-value">...</p>
                        </div>
                    </div>
                    
                    <div class="stat-card" onclick="location.hash='/schedule/manual'" style="cursor:pointer">
                        <div class="stat-icon" style="background:#fff7ed; color:#f59e0b;"><i class="fas fa-calendar-check"></i></div>
                        <div class="stat-info">
                            <h3>本月排班狀態</h3>
                            <p id="schedule-status-display" class="stat-value" style="font-size:1.2rem;">檢查中...</p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top:20px; padding:20px; background:white; border-radius:8px; border:1px solid #e5e7eb;">
                    <h3><i class="fas fa-bullhorn"></i> 系統公告</h3>
                    <p style="color:#666;">歡迎使用新版 AI 排班系統。左側選單可快速切換功能。</p>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.updateStats();
    }

    async updateStats() {
        try {
            // 1. 更新單位數
            const units = await UnitService.getAllUnits();
            const elUnit = document.getElementById('unit-count-display');
            if(elUnit) elUnit.textContent = units.length;
            
            // 2. 更新人員數
            const staffCount = await userService.getAllStaffCount();
            const elStaff = document.getElementById('staff-count-display');
            if(elStaff) elStaff.textContent = staffCount;

            // 3. 【新增】更新排班狀態 (以第一個單位為範例，或使用者的單位)
            this.updateScheduleStatus(units);

        } catch (e) {
            console.error("更新儀表板數據失敗:", e);
        }
    }

    async updateScheduleStatus(units) {
        const statusEl = document.getElementById('schedule-status-display');
        if (!statusEl) return;

        if (units.length === 0) {
            statusEl.textContent = "無單位";
            return;
        }

        // 策略：預設檢查列表中的第一個單位 (系統管理員視角)
        // 若是單位管理者，應檢查 user.unitId
        const targetUnit = units[0]; 
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        try {
            const schedule = await ScheduleService.getSchedule(targetUnit.unitId, year, month);
            
            if (!schedule) {
                statusEl.textContent = "未建立";
                statusEl.style.color = "#9ca3af"; // 灰色
            } else if (schedule.status === 'published') {
                statusEl.textContent = "✅ 已發布";
                statusEl.style.color = "#166534"; // 綠色
            } else {
                statusEl.textContent = "✏️ 草稿中";
                statusEl.style.color = "#d97706"; // 橘色
            }
        } catch (error) {
            statusEl.textContent = "讀取錯誤";
        }
    }
}
