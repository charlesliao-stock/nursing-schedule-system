import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js"; // 【新增】

export class MainLayout {
    constructor(user) {
        this.user = user || { name: '使用者' };
    }

    render() {
        return `
            <div class="app-layout">
                <aside class="layout-sidebar">
                    <div class="sidebar-header" style="cursor:pointer;" onclick="window.location.hash='/dashboard'">
                        <i class="fas fa-hospital-alt" style="margin-right:10px;"></i> 護理排班系統
                    </div>
                    <nav class="sidebar-menu">
                        <div class="menu-item" data-path="/dashboard">
                            <i class="fas fa-tachometer-alt"></i> 儀表板
                        </div>
                        <div class="menu-item" data-path="/system/units/list">
                            <i class="fas fa-building"></i> 單位管理
                        </div>
                        <div class="menu-item" data-path="/unit/staff/list">
                            <i class="fas fa-users"></i> 人員管理
                        </div>
                        <div class="menu-item" data-path="/unit/settings/shifts">
                            <i class="fas fa-clock"></i> 班別設定
                        </div>
                        <div class="menu-item" data-path="/schedule/manual">
                            <i class="fas fa-calendar-alt"></i> 排班管理
                        </div>
                    </nav>
                </aside>

                <header class="layout-header">
                    <div class="brand-logo" id="header-logo">
                        <span id="page-title">儀表板</span>
                    </div>
                    <div class="user-info">
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${this.user.name}</span>
                        </span>
                        <button id="layout-logout-btn" class="btn-logout">登出</button>
                    </div>
                </header>

                <main id="main-view" class="layout-content">
                    </main>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('header-logo').addEventListener('click', () => {
            router.navigate('/dashboard');
        });

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                router.navigate(path);
                this.updateActiveMenu(path);
            });
        });

        document.getElementById('layout-logout-btn').addEventListener('click', async () => {
            if (confirm('確定登出？')) {
                await authService.logout();
                window.location.reload();
            }
        });

        // 【新增】主動更新使用者名稱
        this.refreshUserName();
    }

    async refreshUserName() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                // 讀取詳細資料 (包含 name)
                const userData = await userService.getUserData(currentUser.uid);
                const nameEl = document.getElementById('header-user-name');
                if (userData && nameEl) {
                    nameEl.textContent = userData.name;
                    this.user = userData; // 更新本地暫存
                }
            }
        } catch (error) {
            console.error("更新使用者名稱失敗", error);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) {
                item.classList.add('active');
            }
        });
        
        const titleMap = {
            '/dashboard': '儀表板',
            '/system/units/list': '單位管理',
            '/unit/staff/list': '人員管理',
            '/unit/settings/shifts': '班別設定',
            '/schedule/manual': '排班管理'
        };
        const key = Object.keys(titleMap).find(k => path.includes(k));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = key ? titleMap[key] : '系統作業';
    }
}
