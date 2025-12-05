import { authService } from "../../services/firebase/AuthService.js";
import { unitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    constructor(user) {
        this.user = user;
    }

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
                            <button id="btn-create-unit" class="btn-primary" style="width:auto; margin-right: 10px;">
                                <i class="fas fa-plus"></i> 建立新單位
                            </button>
                            <button id="btn-create-staff" class="btn-primary" style="width:auto; background-color: #10b981;">
                                <i class="fas fa-user-plus"></i> 新增人員
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
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-server"></i></div>
                            <div class="stat-info">
                                <h3>系統狀態</h3>
                                <p class="stat-value" style="color: green;">正常運作</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 2rem; padding: 1.5rem; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <h3><i class="fas fa-info-circle"></i> 系統公告</h3>
                        <p>歡迎使用護理站排班系統。目前已開放「單位管理」與「人員資料建立」功能。</p>
                    </div>
                </main>
            </div>
        `;
    }

    async afterRender() {
        // 1. 綁定登出
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('確定要登出嗎？')) {
                    await authService.logout();
                    window.location.reload();
                }
            });
        }

        // 2. 綁定按鈕導航
        const createUnitBtn = document.getElementById('btn-create-unit');
        if (createUnitBtn) {
            createUnitBtn.addEventListener('click', () => {
                router.navigate('/system/units/create');
            });
        }

        const createStaffBtn = document.getElementById('btn-create-staff');
        if (createStaffBtn) {
            createStaffBtn.addEventListener('click', () => {
                router.navigate('/unit/staff/create');
            });
        }

        // 3. 讀取並更新統計數據
        this.updateStats();
    }

    async updateStats() {
        try {
            // 讀取單位列表
            const units = await unitService.getAllUnits();
            const unitCountDisplay = document.getElementById('unit-count-display');
            if (unitCountDisplay) {
                unitCountDisplay.textContent = units.length;
            }

            // 讀取人員數量 (使用我們剛在 UserService 新增的方法)
            const staffCount = await userService.getAllStaffCount();
            const staffCountDisplay = document.getElementById('staff-count-display');
            if (staffCountDisplay) {
                staffCountDisplay.textContent = staffCount;
            }
        } catch (error) {
            console.error("更新統計數據失敗:", error);
        }
    }
}
