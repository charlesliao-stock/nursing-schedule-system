import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        // 確保 system_admin 狀態
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user);
        }
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;
        this.autoHideTimer = null;
    }

    /**
     * 定義選單項目 (扁平化結構，適配 layout-sidebar)
     */
    getMenus(role) {
        const dashboard = { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: '儀表板' };

        // 1. 系統管理者
        const adminMenus = [
            dashboard,
            { isHeader: true, label: '管理功能' },
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' },
            { path: '/system/units/list', icon: 'fas fa-building', label: '單位管理' },
            { path: '/system/settings', icon: 'fas fa-tools', label: '系統設定' },
            
            { isHeader: true, label: '參數設定' },
            { path: '/unit/settings/shifts', icon: 'fas fa-clock', label: '班別設定' },
            { path: '/unit/settings/groups', icon: 'fas fa-layer-group', label: '組別設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-ruler-combined', label: '排班規則' },
            
            { isHeader: true, label: '紀錄' },
            { path: '/system/logs', icon: 'fas fa-list-alt', label: '操作日誌' }
        ];

        // 2. 單位管理者
        const managerMenus = [
            dashboard,
            { isHeader: true, label: '單位管理' },
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' },
            { path: '/pre-schedule/manage', icon: 'fas fa-edit', label: '預班管理' },
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班作業' },
            
            { isHeader: true, label: '參數設定' },
            { path: '/unit/settings/shifts', icon: 'fas fa-clock', label: '班別設定' },
            { path: '/unit/settings/groups', icon: 'fas fa-layer-group', label: '組別設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-ruler-combined', label: '排班規則' },
            
            { isHeader: true, label: '審核與統計' },
            { path: '/swaps/review', icon: 'fas fa-check-double', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-chart-bar', label: '單位統計' }
        ];

        // 3. 單位排班者
        const schedulerMenus = [
            dashboard,
            { isHeader: true, label: '排班作業' },
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員檢視' },
            { path: '/pre-schedule/manage', icon: 'fas fa-edit', label: '預班管理' },
            { path: '/schedule/manual', icon: 'fas fa-calendar-alt', label: '排班作業' },
            
            { isHeader: true, label: '參數設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-ruler-combined', label: '排班規則' },
            
            { isHeader: true, label: '其他' },
            { path: '/swaps/review', icon: 'fas fa-check-double', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-chart-bar', label: '單位統計' }
        ];

        // 4. 一般使用者
        const userMenus = [
            dashboard,
            { isHeader: true, label: '個人作業' },
            { path: '/pre-schedule/submit', icon: 'fas fa-pen-fancy', label: '提交預班' },
            { path: '/schedule/my', icon: 'fas fa-calendar-check', label: '我的班表' },
            { path: '/swaps/apply', icon: 'fas fa-exchange-alt', label: '申請換班' },
            { path: '/stats/personal', icon: 'fas fa-chart-pie', label: '個人統計' }
        ];

        const r = role || 'user';
        if (r === 'system_admin') return adminMenus;
        if (r === 'unit_manager') return managerMenus;
        if (r === 'unit_scheduler') return schedulerMenus;
        return userMenus;
    }

    render() {
        const menus = this.getMenus(this.currentRole);
        const menuHtml = this.buildMenuHtml(menus);
        
        const displayName = this.user.name || this.user.displayName || '使用者';
        const displayRoleName = this.getRoleName(this.realRole);
        
        // 角色切換器 (僅 Admin 可見)
        const showSwitcher = (this.realRole === 'system_admin');
        const roleSwitcherHtml = showSwitcher ? `
            <div class="me-3 d-flex align-items-center bg-white rounded px-2 border shadow-sm" style="height: 32px;">
                <i class="fas fa-user-secret text-primary me-2"></i>
                <select id="role-switcher" class="form-select form-select-sm border-0 bg-transparent p-0 shadow-none fw-bold" style="width: auto; cursor: pointer;">
                    <option value="system_admin" ${this.currentRole === 'system_admin' ? 'selected' : ''}>系統管理員</option>
                    <option disabled>────────</option>
                    <option value="unit_manager" ${this.currentRole === 'unit_manager' ? 'selected' : ''}>模擬: 單位主管</option>
                    <option value="unit_scheduler" ${this.currentRole === 'unit_scheduler' ? 'selected' : ''}>模擬: 排班者</option>
                    <option value="user" ${this.currentRole === 'user' ? 'selected' : ''}>模擬: 一般人員</option>
                </select>
            </div>` : '';

        // ✅ 使用正確的 app-layout 結構
        return `
            <div class="app-layout">
                <aside class="layout-sidebar" id="layout-sidebar">
                    <div class="sidebar-toggle-tab" id="sidebar-toggle-btn" title="縮放選單">
                        <i class="fas fa-chevron-left" id="sidebar-toggle-icon"></i>
                    </div>
                    
                    <div class="sidebar-header" style="cursor:pointer;" onclick="window.location.hash='/dashboard'">
                        <i class="fas fa-hospital-user fa-lg me-2"></i> 
                        <span class="sidebar-title">護理排班系統</span>
                    </div>
                    
                    <nav class="sidebar-menu" id="sidebar-menu-container">
                        ${menuHtml}
                    </nav>
                </aside>

                <header class="layout-header" id="layout-header">
                    <div class="brand-logo" id="header-logo">
                        <span id="page-title" class="h5 mb-0 text-gray-800">儀表板</span>
                    </div>
                    <div class="user-info">
                        ${roleSwitcherHtml}
                        <span id="user-role-badge" class="badge bg-primary me-2">${displayRoleName}</span>
                        <span class="me-3 text-gray-600 small">
                            <i class="fas fa-user-circle me-1"></i> ${displayName}
                        </span>
                        <button id="layout-logout-btn" class="btn btn-sm btn-outline-danger border-0" title="登出">
                            <i class="fas fa-sign-out-alt fa-lg"></i>
                        </button>
                    </div>
                </header>

                <main id="main-view" class="layout-content"></main>
            </div>
        `;
    }

    /**
     * 產生選單 HTML (適配 layout-sidebar 樣式)
     */
    buildMenuHtml(menus) {
        return menus.map(item => {
            // 分隔標題
            if (item.isHeader) {
                return `<div class="menu-header text-uppercase text-xs font-weight-bold text-gray-500 mt-3 mb-1 px-3">${item.label}</div>`;
            }
            // 選單連結
            return `
                <a href="#${item.path}" class="menu-item" data-path="${item.path}">
                    <i class="${item.icon} fa-fw me-2"></i> 
                    <span>${item.label}</span>
                </a>
            `;
        }).join('');
    }

    getRoleName(role) { 
        if (!role) return ''; 
        const map = { 'system_admin': '系統管理員', 'unit_manager': '單位護理長', 'unit_scheduler': '排班人員', 'user': '護理師', 'guest': '訪客' }; 
        return map[role] || role; 
    }

    async afterRender() {
        this.bindEvents();
        const currentPath = window.location.hash.slice(1) || '/dashboard';
        this.updateActiveMenu(currentPath);
        
        // Admin Badge Color
        const badgeEl = document.getElementById('user-role-badge');
        if (badgeEl && this.realRole === 'system_admin') { 
            badgeEl.className = 'badge bg-danger me-2'; 
        }
    }

    bindEvents() {
        // 登出
        document.getElementById('layout-logout-btn')?.addEventListener('click', async () => { 
            if (confirm('確定登出？')) { 
                await authService.logout(); 
                window.location.reload(); 
            } 
        });

        // 角色切換
        const roleSwitcher = document.getElementById('role-switcher');
        if (roleSwitcher) {
            roleSwitcher.addEventListener('change', (e) => {
                this.user.role = e.target.value;
                authService.setProfile(this.user);
                router.currentLayout = null; 
                router.handleRoute();
            });
        }

        // Sidebar Toggle
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');

        if(toggleBtn && sidebar) {
            const toggleSidebar = () => {
                const isCollapsed = sidebar.classList.toggle('collapsed');
                if(header) header.classList.toggle('expanded');
                if(content) content.classList.toggle('expanded');
                
                // 切換箭頭
                if(toggleIcon) {
                    toggleIcon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
                }
            };
            toggleBtn.addEventListener('click', toggleSidebar);
        }
    }

    updateActiveMenu(path) {
        // 移除舊 Active
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        
        // 尋找並加入 Active
        // 邏輯：完全符合 > 開頭符合
        let target = document.querySelector(`.menu-item[data-path="${path}"]`);
        if (!target) {
            // 嘗試前綴匹配 (例如 /system/units/edit/1 -> /system/units/list)
            if (path.includes('/edit/')) {
                const listPath = path.replace('/create', '/list').replace(/\/edit\/.*/, '/list');
                target = document.querySelector(`.menu-item[data-path="${listPath}"]`);
            }
        }
        
        if (target) {
            target.classList.add('active');
            // 更新上方標題
            const titleEl = document.getElementById('page-title');
            if(titleEl) titleEl.textContent = target.querySelector('span').textContent;
        }
    }
}
