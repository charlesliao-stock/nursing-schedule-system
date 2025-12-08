import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        
        // 1. 鎖定原始身分 (System Admin 模擬功能用)
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user);
        }
        
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;
        this.autoHideTimer = null;
    }

    /**
     * 定義選單項目
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
        
        // 角色切換器 (僅 Admin 且保持 originalRole 為 admin 時顯示)
        const showSwitcher = (this.realRole === 'system_admin');
        const roleSwitcherHtml = showSwitcher ? `
            <div class="me-3 d-flex align-items-center bg-white rounded px-2 border shadow-sm" style="height: 32px;">
                <i class="fas fa-random text-primary me-2" title="視角切換"></i>
                <select id="role-switcher" class="form-select form-select-sm border-0 bg-transparent p-0 shadow-none" style="width: auto; cursor: pointer; font-weight: bold; color: #333; -webkit-appearance: none;">
                    <option value="system_admin" ${this.currentRole === 'system_admin' ? 'selected' : ''}>👁️ 系統管理員</option>
                    <option disabled>──────────</option>
                    <option value="unit_manager" ${this.currentRole === 'unit_manager' ? 'selected' : ''}>👁️ 模擬：單位管理者</option>
                    <option value="unit_scheduler" ${this.currentRole === 'unit_scheduler' ? 'selected' : ''}>👁️ 模擬：排班者</option>
                    <option value="user" ${this.currentRole === 'user' ? 'selected' : ''}>👁️ 模擬：一般使用者</option>
                </select>
                <i class="fas fa-caret-down text-muted ms-2" style="font-size: 0.8rem; pointer-events:none;"></i>
            </div>` : '';

        // ✅ 使用您的 main.css 定義的結構 (.app-layout)
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
                    <div class="brand-logo">
                        <span id="page-title">儀表板</span>
                    </div>
                    <div class="user-info">
                        ${roleSwitcherHtml}
                        <span id="user-role-badge" class="badge bg-primary me-2" style="font-size:0.85rem;">${displayRoleName}</span>
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

    /**
     * 產生選單 HTML (配合 .menu-item 樣式)
     */
    buildMenuHtml(menus) {
        return menus.map(item => {
            if (item.isHeader) {
                // 選單分隔標題
                return `
                    <div style="padding: 15px 20px 5px 20px; font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">
                        ${item.label}
                    </div>
                `;
            }
            // 選單連結
            return `
                <a href="#${item.path}" class="menu-item" data-path="${item.path}">
                    <i class="${item.icon}" style="width:20px; text-align:center;"></i> 
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
        document.getElementById('layout-logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
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

        // Sidebar Toggle (配合 CSS 的 .collapsed / .expanded)
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
                    header.classList.add('expanded');
                    content.classList.add('expanded');
                    toggleIcon.className = 'fas fa-chevron-right'; // 縮進去後箭頭向右
                } else {
                    sidebar.classList.remove('collapsed');
                    header.classList.remove('expanded');
                    content.classList.remove('expanded');
                    toggleIcon.className = 'fas fa-chevron-left'; // 展開後箭頭向左
                }
            };
            toggleBtn.addEventListener('click', () => {
                if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
                toggleSidebar();
            });
            // 手機版自動收合邏輯可在此擴充
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        
        // 尋找對應連結
        let target = document.querySelector(`.menu-item[data-path="${path}"]`);
        
        // 模糊比對 (處理 /edit/ 等子頁面)
        if (!target && path.includes('/edit/')) {
            // 嘗試找上一層列表頁
            const listPath = path.substring(0, path.lastIndexOf('/')); // 粗略處理
            // 更精確： /system/units/edit/123 -> /system/units/list
            const mappingPath = path.replace('edit', 'list').split('/').slice(0, 4).join('/');
            target = document.querySelector(`.menu-item[data-path^="${mappingPath}"]`);
        }
        
        if (target) {
            target.classList.add('active');
            const titleEl = document.getElementById('page-title');
            if(titleEl) titleEl.textContent = target.querySelector('span').textContent;
        }
    }
}
