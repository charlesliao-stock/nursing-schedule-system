import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = user || { name: '使用者' };
        this.autoHideTimer = null;
    }

    render() {
        return `
            <div class="app-layout">
                <aside class="layout-sidebar" id="layout-sidebar">
                    <div class="sidebar-toggle-tab" id="sidebar-toggle-btn" title="切換選單">
                        <i class="fas fa-chevron-left" id="sidebar-toggle-icon"></i>
                    </div>

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

                <header class="layout-header" id="layout-header">
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
        // 基本事件綁定
        document.getElementById('header-logo').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('layout-logout-btn').addEventListener('click', async () => {
            if (confirm('確定登出？')) { await authService.logout(); window.location.reload(); }
        });

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                router.navigate(path);
                this.updateActiveMenu(path);
            });
        });

        this.refreshUserName();

        // --- 側邊欄收折邏輯 ---
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');

        const toggleSidebar = (forceState = null) => {
            // 如果 forceState 為 boolean，則強制設定；否則切換
            const shouldCollapse = forceState !== null ? forceState : !sidebar.classList.contains('collapsed');

            if (shouldCollapse) {
                sidebar.classList.add('collapsed');
                header.classList.add('expanded');
                content.classList.add('expanded');
                toggleIcon.classList.remove('fa-chevron-left');
                toggleIcon.classList.add('fa-chevron-right'); // 變成向右箭頭，提示可展開
            } else {
                sidebar.classList.remove('collapsed');
                header.classList.remove('expanded');
                content.classList.remove('expanded');
                toggleIcon.classList.remove('fa-chevron-right');
                toggleIcon.classList.add('fa-chevron-left'); // 變成向左箭頭
            }
        };

        // 綁定按鈕點擊
        toggleBtn.addEventListener('click', () => {
            // 手動點擊時，清除自動隱藏的計時器 (避免干擾)
            if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
            toggleSidebar();
        });

        // 設定 5 秒後自動收折
        this.autoHideTimer = setTimeout(() => {
            toggleSidebar(true); // 強制收折
        }, 5000);
    }

    async refreshUserName() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                const userData = await userService.getUserData(currentUser.uid);
                const nameEl = document.getElementById('header-user-name');
                if (userData && nameEl) {
                    nameEl.textContent = userData.name;
                    this.user = userData;
                }
            }
        } catch (error) { console.error(error); }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        const titleMap = {
            '/dashboard': '儀表板', '/system/units/list': '單位管理',
            '/unit/staff/list': '人員管理', '/unit/settings/shifts': '班別設定',
            '/schedule/manual': '排班管理'
        };
        const key = Object.keys(titleMap).find(k => path.includes(k));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = key ? titleMap[key] : '系統作業';
    }
}
