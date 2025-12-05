import { authService } from "../../services/firebase/AuthService.js";
import { unitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    constructor(user) { this.user = user; }

    render() {
        return `
            <div class="dashboard-container">
                <nav class="navbar">
                    <div class="nav-brand">
                        <i class="fas fa-hospital-alt"></i> 護理站 AI 排班系統
                        <span class="badge-admin">系統管理員</span>
                    </div>
                    <div class="nav-user">
                        <span>${this.user.name}</span>
                        <button id="logout-btn" class="btn-logout">登出</button>
                    </div>
                </nav>

                <main class="main-content">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 10px;">
                        <h1>儀表板概覽</h1>
                        <div class="action-buttons">
                            <button id="btn-manage-units" class="btn-primary" style="width:auto; margin-right: 10px;">
                                <i class="fas fa-building"></i> 單位管理
                            </button>
                            <button id="btn-manage-staff" class="btn-primary" style="width:auto; background-color: #10b981; margin-right: 10px;">
                                <i class="fas fa-users-cog"></i> 人員管理
                            </button>
                            <button id="btn-shift-settings" class="btn-primary" style="width:auto; background-color: #8b5cf6;">
                                <i class="fas fa-clock"></i> 班別設定
                            </button>
                        </div>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-building"></i></div>
                            <div class="stat-info">
                                <h3>單位總數</h3>
                                <p id="unit-count-display" class="stat-value">...</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-user-nurse"></i></div>
                            <div class="stat-info">
                                <h3>人員總數</h3>
                                <p id="staff-count-display" class="stat-value">...</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('logout-btn').addEventListener('click', async () => {
            if (confirm('確定要登出嗎？')) { await authService.logout(); window.location.reload(); }
        });

        const bindNav = (id, path) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => router.navigate(path));
        };

        bindNav('btn-manage-units', '/system/units/list'); // 改為列表
        bindNav('btn-manage-staff', '/unit/staff/list');
        bindNav('btn-shift-settings', '/unit/settings/shifts');

        this.updateStats();
    }

    async updateStats() {
        try {
            const units = await unitService.getAllUnits();
            document.getElementById('unit-count-display').textContent = units.length;
            const staffCount = await userService.getAllStaffCount();
            document.getElementById('staff-count-display').textContent = staffCount;
        } catch (e) {}
    }
}
