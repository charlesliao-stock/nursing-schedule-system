import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js"; // 【新增】
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
                            <p id="schedule-status-display" class="stat-value" style="font-size:1.2rem;">...</p>
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

            // 3. 更新排班狀態 (依據角色)
            await this.updateScheduleStatus();

        } catch (e) {
            console.error("更新儀表板數據失敗:", e);
        }
    }

    async updateScheduleStatus() {
        const statusEl = document.getElementById('schedule-status-display');
        if (!statusEl) return;

        try {
            // 取得當前使用者的完整資料 (包含 role)
            const firebaseUser = authService.getCurrentUser();
            if (!firebaseUser) return;
            const user = await userService.getUserData(firebaseUser.uid);

            // 【邏輯修正】如果是系統管理員，不顯示個別單位狀態
            if (user.role === 'system_admin') {
                statusEl.textContent = "系統管理模式";
                statusEl.style.color = "#3b82f6"; // 藍色
                statusEl.style.fontSize = "1rem";
                return;
            }

            // 如果是一般使用者/單位管理者，且有綁定單位
            if (user.unitId) {
                const now = new Date();
                const schedule = await ScheduleService.getSchedule(
                    user.unitId, 
                    now.getFullYear(), 
                    now.getMonth() + 1
                );
                
                if (!schedule) {
                    statusEl.textContent = "未建立";
                    statusEl.style.color = "#9ca3af";
                } else if (schedule.status === 'published') {
                    statusEl.textContent = "✅ 已發布";
                    statusEl.style.color = "#166534";
                } else {
                    statusEl.textContent = "✏️ 草稿中";
                    statusEl.style.color = "#d97706";
                }
            } else {
                statusEl.textContent = "無所屬單位";
                statusEl.style.fontSize = "1rem";
            }
        } catch (error) {
            console.error(error);
            statusEl.textContent = "讀取錯誤";
        }
    }
}
