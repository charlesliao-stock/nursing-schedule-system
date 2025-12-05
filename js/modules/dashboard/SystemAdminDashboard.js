import { authService } from "../../services/firebase/AuthService.js";

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
                        <span>${this.user.name} (${this.user.email})</span>
                        <button id="logout-btn" class="btn-logout">登出</button>
                    </div>
                </nav>

                <main class="main-content">
                    <h1>儀表板概覽</h1>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-building"></i></div>
                            <div class="stat-info">
                                <h3>單位總數</h3>
                                <p class="stat-value">0</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-user-nurse"></i></div>
                            <div class="stat-info">
                                <h3>人員總數</h3>
                                <p class="stat-value">1</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
                            <div class="stat-info">
                                <h3>系統狀態</h3>
                                <p class="stat-value" style="color: green;">正常</p>
                            </div>
                        </div>
                    </div>

                    <div class="empty-state-demo" style="margin-top: 2rem; padding: 2rem; background: white; border-radius: 8px; text-align: center;">
                        <i class="fas fa-tools fa-3x" style="color: #ccc;"></i>
                        <h2>功能開發中</h2>
                        <p>目前您已成功完成：認證系統、資料庫連線、使用者資料讀取。</p>
                        <p>下一步：建立第一個護理單位 (Unit)。</p>
                    </div>
                </main>
            </div>
        `;
    }

    afterRender() {
        // 綁定登出按鈕
        document.getElementById('logout-btn').addEventListener('click', async () => {
            if (confirm('確定要登出嗎？')) {
                await authService.logout();
                window.location.reload();
            }
        });
    }
}