import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = user || { name: '使用者', role: 'user' }; // 預設角色
        this.autoHideTimer = null;
    }

    // 定義不同角色的選單設定
    getMenus() {
        const commonMenus = [
            { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: '儀表板' }
        ];

        const adminMenus = [
            { path: '/system/units/list', icon: 'fas fa-building', label: '單位管理' },
            { path: '/system/settings', icon: 'fas fa-cogs', label: '系統設定' },
            { path: '/system/logs', icon: 'fas fa-list-alt', label: '操作日誌' }
        ];

        const managerMenus = [
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' },
            { path: '/unit/settings/shifts', icon: 'fas fa-clock', label: '班別設定' },
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班管理' }
        ];

        const userMenus = [
            { path: '/my-schedule', icon: 'fas fa-calendar-check', label: '我的班表' },
            { path: '/requests', icon: 'fas fa-exchange-alt', label: '換班申請' }
        ];

        // 根據角色回傳對應選單
        // 注意：system_admin 擁有最高權限，這裡示範分開顯示，你也可以合併
        switch (this.user.role) {
            case 'system_admin':
                return [...commonMenus, ...adminMenus];
            case 'unit_manager':
                return [...commonMenus, ...managerMenus];
            case 'unit_scheduler':
                return [...commonMenus, ...managerMenus]; // 排班者通常與管理者相似
            default:
                return [...commonMenus, ...userMenus];
        }
    }

    render() {
        // 動態生成選單 HTML
        const menus = this.getMenus();
        const menuHtml = menus.map(item => `
            <div class="menu-item" data-path="${item.path}">
                <i class="${item.icon}"></i> ${item.label}
            </div>
        `).join('');

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
                        ${menuHtml}
                    </nav>
                </aside>

                <header class="layout-header" id="layout-header">
                    <div class="brand-logo" id="header-logo">
                        <span id="page-title">儀表板</span>
                    </div>
                    <div class="user-info">
                        <span class="status-badge status-draft" style="margin-right:10px;">
                            ${this.getRoleName(this.user.role)}
                        </span>
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${this.user.name}</span>
                        </span>
                        <button id="layout-logout-btn" class="btn-logout" title="登出">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </header>

                <main id="main-view" class="layout-content">
                    </main>
            </div>
        `;
    }

    // 輔助方法：顯示中文角色名稱
    getRoleName(role) {
        const map = {
            'system_admin': '系統管理員',
            'unit_manager': '單位護理長',
            'unit_scheduler': '排班人員',
            'user': '護理人員'
        };
        return map[role] || '訪客';
    }

    async afterRender() {
        // ... (保持原本的 afterRender 邏輯不變) ...
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

        // 側邊欄收折邏輯
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');

        const toggleSidebar = (forceState = null) => {
            const shouldCollapse = forceState !== null ? forceState : !sidebar.classList.contains('collapsed');
            if (shouldCollapse) {
                sidebar.classList.add('collapsed');
                header.classList.add('expanded');
                content.classList.add('expanded');
                toggleIcon.classList.remove('fa-chevron-left');
                toggleIcon.classList.add('fa-chevron-right');
            } else {
                sidebar.classList.remove('collapsed');
                header.classList.remove('expanded');
                content.classList.remove('expanded');
                toggleIcon.classList.remove('fa-chevron-right');
                toggleIcon.classList.add('fa-chevron-left');
            }
        };

        toggleBtn.addEventListener('click', () => {
            if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
            toggleSidebar();
        });

        // 5秒後自動收折
        this.autoHideTimer = setTimeout(() => {
            toggleSidebar(true);
        }, 5000);
    }

    async refreshUserName() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                // 這裡可以選擇是否再次從 Firestore 拉取最新資料
                // 為了效能，通常依賴 App.js 傳進來的 this.user 即可
                // 如果需要即時更新，可再呼叫 userService.getUserData
            }
        } catch (error) { console.error(error); }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        // 簡單的標題對應
        const menus = this.getMenus();
        const currentMenu = menus.find(m => path.includes(m.path));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = currentMenu ? currentMenu.label : '系統作業';
    }
}
