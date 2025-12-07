import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        
        // 真實身分鎖定邏輯 (保持不變)
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user);
        }
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;
        this.autoHideTimer = null;
    }

    getMenus(role) {
        // 共用儀表板
        const dashboard = { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: '儀表板' };

        // 1. 系統管理者 (System Admin)
        const adminMenus = [
            dashboard,
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' }, // 含編輯個人資料
            { path: '/system/units/list', icon: 'fas fa-building', label: '單位管理' },
            { 
                path: '/system/settings', icon: 'fas fa-cogs', label: '系統設定',
                // 未來可實作子選單: 預設班別, 預設規則, 假日設定, 通知設定
            },
            { path: '/system/logs', icon: 'fas fa-list-alt', label: '操作日誌' }
        ];

        // 2. 單位管理者 (Unit Manager)
        const managerMenus = [
            dashboard,
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' }, // 含參數設定
            { path: '/pre-schedule/manage', icon: 'fas fa-clipboard-list', label: '預班管理' }, // 參數、跨單位、自動帶入
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班管理' }, // 含 AI/手動
            { path: '/unit/settings/rules', icon: 'fas fa-ruler-combined', label: '排班規則' }, // 班別與規則
            { path: '/swaps/review', icon: 'fas fa-exchange-alt', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-chart-bar', label: '統計報表' }
        ];

        // 3. 單位排班者 (Unit Scheduler)
        const schedulerMenus = [
            dashboard,
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' }, // 僅名單增減 (UI 層控制唯讀)
            { path: '/pre-schedule/manage', icon: 'fas fa-clipboard-list', label: '預班管理' },
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班管理' },
            { path: '/unit/settings/rules', icon: 'fas fa-ruler-combined', label: '排班規則' },
            { path: '/swaps/review', icon: 'fas fa-exchange-alt', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-chart-bar', label: '統計報表' }
        ];

        // 4. 一般使用者 (General User)
        const userMenus = [
            dashboard, // 個人儀表板
            { path: '/pre-schedule/submit', icon: 'fas fa-edit', label: '提交預班' }, // 進入當期，下方列出歷史
            { path: '/schedule/my', icon: 'fas fa-calendar-check', label: '我的班表' }, // 進入當期，下方列出歷史
            { path: '/swaps/apply', icon: 'fas fa-exchange-alt', label: '申請換班' }, // 進入當期，下方列出歷史
            { path: '/stats/personal', icon: 'fas fa-chart-pie', label: '個人統計' }
        ];

        const r = role || 'user';
        if (r === 'system_admin') return adminMenus;
        if (r === 'unit_manager') return managerMenus;
        if (r === 'unit_scheduler') return schedulerMenus;
        return userMenus;
    }

    render() {
        // ... (保持原本的 render 邏輯，包含身分切換器) ...
        const menus = this.getMenus(this.currentRole);
        const menuHtml = this.buildMenuHtml(menus);
        
        const displayName = this.user.name || this.user.displayName || '使用者';
        const displayRoleName = this.getRoleName(this.realRole);
        const showSwitcher = (this.realRole === 'system_admin');

        const roleSwitcherHtml = showSwitcher ? `
            <div class="me-3 d-flex align-items-center bg-white rounded px-2 border shadow-sm" style="height: 32px;">
                <i class="fas fa-random text-primary me-2" title="視角切換"></i>
                <select id="role-switcher" class="form-select form-select-sm border-0 bg-transparent p-0 shadow-none" 
                        style="width: auto; cursor: pointer; font-weight: bold; color: #333; -webkit-appearance: none;">
                    <option value="system_admin" ${this.currentRole === 'system_admin' ? 'selected' : ''}>👁️ 系統管理員 (預設)</option>
                    <option disabled>──────────</option>
                    <option value="unit_manager" ${this.currentRole === 'unit_manager' ? 'selected' : ''}>👁️ 模擬：單位管理者</option>
                    <option value="unit_scheduler" ${this.currentRole === 'unit_scheduler' ? 'selected' : ''}>👁️ 模擬：排班者</option>
                    <option value="user" ${this.currentRole === 'user' ? 'selected' : ''}>👁️ 模擬：一般使用者</option>
                </select>
                <i class="fas fa-caret-down text-muted ms-2" style="font-size: 0.8rem; pointer-events:none;"></i>
            </div>
        ` : '';

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
                        ${roleSwitcherHtml}
                        <span id="user-role-badge" class="badge bg-danger me-2">${displayRoleName}</span>
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${displayName}</span>
                        </span>
                        <button id="layout-logout-btn" class="btn-logout" title="登出">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </header>
                <main id="main-view" class="layout-content"></main>
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
        if (!role) return '';
        const map = {
            'system_admin': '系統管理員',
            'unit_manager': '單位護理長',
            'unit_scheduler': '排班人員',
            'user': '護理師',
            'guest': '訪客'
        };
        return map[role] || role;
    }

    async afterRender() {
        this.bindEvents();
        const currentPath = window.location.hash.slice(1) || '/dashboard';
        this.updateActiveMenu(currentPath);
        
        const badgeEl = document.getElementById('user-role-badge');
        if (badgeEl && this.realRole === 'system_admin') {
            badgeEl.className = 'badge bg-danger me-2';
        }
    }

    bindEvents() {
        // ... (保持原本的事件綁定邏輯) ...
        // (省略以節省篇幅，請直接沿用原本 MainLayout.js 的 bindEvents 程式碼)
        const logo = document.getElementById('header-logo');
        if(logo) logo.addEventListener('click', () => router.navigate('/dashboard'));

        const logoutBtn = document.getElementById('layout-logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', async () => {
            if (confirm('確定登出？')) { await authService.logout(); window.location.reload(); }
        });

        const roleSwitcher = document.getElementById('role-switcher');
        if (roleSwitcher) {
            roleSwitcher.addEventListener('change', (e) => {
                const newRole = e.target.value;
                console.log(`🔄 視角切換: ${this.currentRole} -> ${newRole}`);
                this.user.role = newRole;
                authService.setProfile(this.user);
                router.currentLayout = null; 
                router.handleRoute();
            });
        }

        // Sidebar Toggle Logic
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        if(toggleBtn && sidebar) {
            const toggleSidebar = (forceState = null) => {
                const shouldCollapse = forceState !== null ? forceState : !sidebar.classList.contains('collapsed');
                if (shouldCollapse) {
                    sidebar.classList.add('collapsed');
                    if(header) header.classList.add('expanded');
                    if(content) content.classList.add('expanded');
                } else {
                    sidebar.classList.remove('collapsed');
                    if(header) header.classList.remove('expanded');
                    if(content) content.classList.remove('expanded');
                }
            };
            toggleBtn.addEventListener('click', () => {
                if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
                toggleSidebar();
            });
            this.autoHideTimer = setTimeout(() => { toggleSidebar(true); }, 5000);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        const menus = this.getMenus(this.currentRole);
        const currentMenu = menus.find(m => path.includes(m.path));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = currentMenu ? currentMenu.label : '系統作業';
    }
}
