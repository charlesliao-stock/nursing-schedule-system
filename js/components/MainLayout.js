import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        // 優先使用 AuthService 的快取資料
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        this.autoHideTimer = null;
    }

    getMenus(role) {
        const commonMenus = [
            { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: '儀表板' }
        ];

        const adminMenus = [
            { path: '/system/units/list', icon: 'fas fa-building', label: '單位管理' },
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' },
            { path: '/system/settings', icon: 'fas fa-cogs', label: '系統設定' }
        ];

        const managerMenus = [
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' },
            { path: '/unit/settings/shifts', icon: 'fas fa-clock', label: '班別設定' },
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班管理' }
        ];

        const userMenus = [
            { path: '/schedule/my', icon: 'fas fa-calendar-check', label: '我的班表' },
            { path: '/requests', icon: 'fas fa-exchange-alt', label: '換班申請' }
        ];

        const currentRole = role || 'user';
        
        if (currentRole === 'system_admin') return [...commonMenus, ...adminMenus];
        if (currentRole === 'unit_manager') return [...commonMenus, ...managerMenus];
        if (currentRole === 'unit_scheduler') return [...commonMenus, ...managerMenus];
        
        return [...commonMenus, ...userMenus];
    }

    render() {
        const menus = this.getMenus(this.user.role);
        const menuHtml = this.buildMenuHtml(menus);
        
        // 防呆：如果名字還沒載入，使用 role 名稱或 '使用者'
        const displayName = this.user.name || this.user.displayName || '使用者';
        const displayRole = this.getRoleName(this.user.role);

        return `
            <div class="app-layout">
                <aside class="layout-sidebar" id="layout-sidebar">
                    <div class="sidebar-toggle-tab" id="sidebar-toggle-btn" title="切換選單">
                        <i class="fas fa-chevron-left" id="sidebar-toggle-icon"></i>
                    </div>

                    <div class="sidebar-header" style="cursor:pointer;" onclick="window.location.hash='/dashboard'">
                        <i class="fas fa-hospital-alt" style="margin-right:10px;"></i> 護理排班系統
                    </div>
                    
                    <nav class="sidebar-menu" id="sidebar-menu-container">
                        ${menuHtml}
                    </nav>
                </aside>

                <header class="layout-header" id="layout-header">
                    <div class="brand-logo" id="header-logo">
                        <span id="page-title">儀表板</span>
                    </div>
                    <div class="user-info">
                        <span id="user-role-badge" class="badge bg-secondary me-2">
                            ${displayRole}
                        </span>
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${displayName}</span>
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

    buildMenuHtml(menus) {
        return menus.map(item => `
            <a href="#${item.path}" class="menu-item" data-path="${item.path}" style="text-decoration:none;">
                <i class="${item.icon}" style="width:25px; text-align:center;"></i> 
                <span>${item.label}</span>
            </a>
        `).join('');
    }

    getRoleName(role) {
        if (!role) return ''; // 修正：如果 role 是 undefined，回傳空字串，不要回傳 undefined
        
        const map = {
            'system_admin': '系統管理員',
            'unit_manager': '護理長',
            'unit_scheduler': '排班人員',
            'user': '護理師',
            'guest': '訪客'
        };
        return map[role] || role; // 如果找不到對應，就顯示原始代碼
    }

    async afterRender() {
        this.bindEvents();
        const currentPath = window.location.hash.slice(1) || '/dashboard';
        this.updateActiveMenu(currentPath);
        
        // 更新 Badge 顏色
        const badgeEl = document.getElementById('user-role-badge');
        if (badgeEl && this.user.role === 'system_admin') {
            badgeEl.className = 'badge bg-danger me-2';
        }
    }

    bindEvents() {
        const logo = document.getElementById('header-logo');
        if(logo) logo.addEventListener('click', () => router.navigate('/dashboard'));

        const logoutBtn = document.getElementById('layout-logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', async () => {
            if (confirm('確定登出？')) { await authService.logout(); window.location.reload(); }
        });

        // 側邊欄收折邏輯
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');

        if(toggleBtn && sidebar) {
            const toggleSidebar = (forceState = null) => {
                const shouldCollapse = forceState !== null ? forceState : !sidebar.classList.contains('collapsed');
                if (shouldCollapse) {
                    sidebar.classList.add('collapsed');
                    if(header) header.classList.add('expanded');
                    if(content) content.classList.add('expanded');
                    if(toggleIcon) { toggleIcon.classList.remove('fa-chevron-left'); toggleIcon.classList.add('fa-chevron-right'); }
                } else {
                    sidebar.classList.remove('collapsed');
                    if(header) header.classList.remove('expanded');
                    if(content) content.classList.remove('expanded');
                    if(toggleIcon) { toggleIcon.classList.remove('fa-chevron-right'); toggleIcon.classList.add('fa-chevron-left'); }
                }
            };

            toggleBtn.addEventListener('click', () => {
                if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
                toggleSidebar();
            });

            this.autoHideTimer = setTimeout(() => {
                toggleSidebar(true);
            }, 5000);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        const menus = this.getMenus(this.user.role);
        const currentMenu = menus.find(m => path.includes(m.path));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = currentMenu ? currentMenu.label : '系統作業';
    }
}
