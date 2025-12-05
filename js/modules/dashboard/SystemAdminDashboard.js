import { authService } from "../../services/firebase/AuthService.js";
import { unitService } from "../../services/firebase/UnitService.js"; // 新增引用
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    constructor(user) {
        this.user = user;
        this.unitsCount = 0; // 暫存數量
    }

    async initData() {
        // 預先讀取數據
        const units = await unitService.getAllUnits();
        this.unitsCount = units.length;
    }

    render() {
        // 注意：這裡我們假設 render 被呼叫前 initData 已經完成，
        // 或者我們先 render 0，然後用 DOM 更新。
        // 為求簡單，我們直接 render，數字顯示 "載入中..." 或 0，稍後更新
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
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h1>儀表板概覽</h1>
                        <button id="btn-create-unit" class="btn-primary" style="width:auto;">
                            <i class="fas fa-plus"></i> 建立新單位
                        </button>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-building"></i></div>
                            <div class="stat-info">
                                <h3>單位總數</h3>
                                <p id="unit-count-display" class="stat-value">-</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-user-nurse"></i></div>
                            <div class="stat-info">
                                <h3>人員總數</h3>
                                <p class="stat-value">1</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        `;
    }

    async afterRender() {
        // 綁定登出
        document.getElementById('logout-btn').addEventListener('click', async () => {
            if (confirm('確定要登出嗎？')) {
                await authService.logout();
                window.location.reload();
            }
        });

        // 綁定建立單位按鈕
        document.getElementById('btn-create-unit').addEventListener('click', () => {
            router.navigate('/system/units/create');
        });

        // 異步讀取數據並更新 UI
        const units = await unitService.getAllUnits();
        const countDisplay = document.getElementById('unit-count-display');
        if (countDisplay) {
            countDisplay.textContent = units.length;
        }
    }
}
