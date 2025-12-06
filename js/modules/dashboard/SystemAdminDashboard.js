import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    // constructor(user) 此參數在新的 Layout 架構下可能用不到，或由 App 傳入
    
    render() {
        // 只保留主要內容，移除 Navbar
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
                    <div class="stat-card" style="cursor:pointer">
                        <div class="stat-icon" style="background:#fff7ed; color:#f59e0b;"><i class="fas fa-calendar-check"></i></div>
                        <div class="stat-info">
                            <h3>本月排班</h3>
                            <p class="stat-value">進行中</p>
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
            const units = await UnitService.getAllUnits();
            const elUnit = document.getElementById('unit-count-display');
            if(elUnit) elUnit.textContent = units.length;
            
            const staffCount = await userService.getAllStaffCount();
            const elStaff = document.getElementById('staff-count-display');
            if(elStaff) elStaff.textContent = staffCount;
        } catch (e) {
            console.error("更新儀表板數據失敗:", e);
        }
    }
}
