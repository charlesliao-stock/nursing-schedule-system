import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        
        // 1. 鎖定原始身分：如果是系統管理員，記錄下來
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user);
        }
        
        // 判斷真實身分 (用於顯示 Badge) 與 當前扮演身分 (用於選單)
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;
        this.autoHideTimer = null;
    }

    /**
     * 定義各角色的選單結構
     */
    getMenus(role) {
        const dashboard = { path: '/dashboard', icon: 'fas fa-fw fa-tachometer-alt', label: '儀表板' };

        // 1. 系統管理者
        const adminMenus = [
            dashboard,
            { header: '管理功能' },
            { path: '/unit/staff/list', icon: 'fas fa-fw fa-users', label: '人員管理' },
            { path: '/system/units/list', icon: 'fas fa-fw fa-building', label: '單位管理' },
            { path: '/system/settings', icon: 'fas fa-fw fa-cogs', label: '系統設定' },
            
            { header: '參數設定' },
            { path: '/unit/settings/shifts', icon: 'fas fa-fw fa-clock', label: '班別設定' },
            { path: '/unit/settings/groups', icon: 'fas fa-fw fa-layer-group', label: '組別設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-fw fa-ruler-combined', label: '排班規則' },
            
            { header: '紀錄' },
            { path: '/system/logs', icon: 'fas fa-fw fa-list-alt', label: '操作日誌' }
        ];

        // 2. 單位管理者
        const managerMenus = [
            dashboard,
            { header: '單位管理' },
            { path: '/unit/staff/list', icon: 'fas fa-fw fa-users', label: '人員管理' },
            { path: '/pre-schedule/manage', icon: 'fas fa-fw fa-clipboard-list', label: '預班管理' },
            { path: '/schedule/manual', icon: 'fas fa-fw fa-calendar-alt', label: '排班作業' },
            
            { header: '參數設定' },
            { path: '/unit/settings/shifts', icon: 'fas fa-fw fa-clock', label: '班別設定' },
            { path: '/unit/settings/groups', icon: 'fas fa-fw fa-layer-group', label: '組別設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-fw fa-ruler-combined', label: '排班規則' },
            
            { header: '審核與統計' },
            { path: '/swaps/review', icon: 'fas fa-fw fa-exchange-alt', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-fw fa-chart-bar', label: '單位統計' }
        ];

        // 3. 單位排班者
        const schedulerMenus = [
            dashboard,
            { header: '排班作業' },
            { path: '/unit/staff/list', icon: 'fas fa-fw fa-users', label: '人員檢視' },
            { path: '/pre-schedule/manage', icon: 'fas fa-fw fa-clipboard-list', label: '預班管理' },
            { path: '/schedule/manual', icon: 'fas fa-fw fa-calendar-alt', label: '排班作業' },
            
            { header: '參數設定' },
            { path: '/unit/settings/rules', icon: 'fas fa-fw fa-ruler-combined', label: '排班規則' },
            
            { header: '其他' },
            { path: '/swaps/review', icon: 'fas fa-fw fa-exchange-alt', label: '換班審核' },
            { path: '/stats/unit', icon: 'fas fa-fw fa-chart-bar', label: '單位統計' }
        ];

        // 4. 一般使用者
        const userMenus = [
            dashboard,
            { header: '個人作業' },
            { path: '/pre-schedule/submit', icon: 'fas fa-fw fa-edit', label: '提交預班' },
            { path: '/schedule/my', icon: 'fas fa-fw fa-calendar-check', label: '我的班表' },
            { path: '/swaps/apply', icon: 'fas fa-fw fa-exchange-alt', label: '申請換班' },
            { path: '/stats/personal', icon: 'fas fa-fw fa-chart-pie', label: '個人統計' }
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
        
        // 系統管理員的視角切換器
        const showSwitcher = (this.realRole === 'system_admin');
        const roleSwitcherHtml = showSwitcher ? `
            <li class="nav-item dropdown no-arrow mx-1">
                <select id="role-switcher" class="form-select form-select-sm shadow-none border-0 bg-light fw-bold" style="cursor: pointer; width: auto;">
                    <option value="system_admin" ${this.currentRole === 'system_admin' ? 'selected' : ''}>👁️ 系統管理員</option>
                    <option disabled>──────────</option>
                    <option value="unit_manager" ${this.currentRole === 'unit_manager' ? 'selected' : ''}>👁️ 模擬：單位管理者</option>
                    <option value="unit_scheduler" ${this.currentRole === 'unit_scheduler' ? 'selected' : ''}>👁️ 模擬：排班者</option>
                    <option value="user" ${this.currentRole === 'user' ? 'selected' : ''}>👁️ 模擬：一般使用者</option>
                </select>
            </li>` : '';

        // ✅ 使用標準 SB Admin 2 結構 (#wrapper)
        return `
            <div id="wrapper">
                <ul class="navbar-nav bg-gradient-primary sidebar sidebar-dark accordion" id="accordionSidebar">
                    <a class="sidebar-brand d-flex align-items-center justify-content-center" href="#/dashboard">
                        <div class="sidebar-brand-icon rotate-n-15"><i class="fas fa-hospital-user"></i></div>
                        <div class="sidebar-brand-text mx-3">護理排班系統</div>
                    </a>
                    <hr class="sidebar-divider my-0">
                    
                    ${menuHtml}
                    
                    <hr class="sidebar-divider d-none d-md-block">
                    <div class="text-center d-none d-md-inline">
                        <button class="rounded-circle border-0" id="sidebarToggle"></button>
                    </div>
                </ul>

                <div id="content-wrapper" class="d-flex flex-column">
                    <div id="content">
                        <nav class="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
                            <button id="sidebarToggleTop" class="btn btn-link d-md-none rounded-circle mr-3">
                                <i class="fa fa-bars"></i>
                            </button>
                            
                            <h5 class="m-0 font-weight-bold text-primary ms-3" id="page-title">儀表板</h5>

                            <ul class="navbar-nav ms-auto">
                                ${roleSwitcherHtml}
                                <div class="topbar-divider d-none d-sm-block"></div>
                                <li class="nav-item dropdown no-arrow">
                                    <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown">
                                        <span class="mr-2 d-none d-lg-inline text-gray-600 small">${displayName}</span>
                                        <span class="badge bg-danger me-2">${displayRoleName}</span>
                                        <img class="img-profile rounded-circle" src="https://source.unsplash.com/QAB-WJcbgJk/60x60">
                                    </a>
                                    <div class="dropdown-menu dropdown-menu-end shadow animated--grow-in">
                                        <a class="dropdown-item" href="#" id="logout-btn">
                                            <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-gray-400"></i> 登出
                                        </a>
                                    </div>
                                </li>
                            </ul>
                        </nav>
                        
                        <div id="main-view"></div> 
                    </div>
                    
                    <footer class="sticky-footer bg-white">
                        <div class="container my-auto">
                            <div class="copyright text-center my-auto">
                                <span>Copyright &copy; Nursing Schedule System 2025</span>
                            </div>
                        </div>
                    </footer>
                </div>
            </div>
        `;
    }

    buildMenuHtml(menus) {
        return menus.map(item => {
            if (item.header) {
                return `
                    <hr class="sidebar-divider">
                    <div class="sidebar-heading">${item.header}</div>
                `;
            }
            return `
                <li class="nav-item">
                    <a class="nav-link menu-item" href="#${item.path}" data-path="${item.path}">
                        <i class="${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                </li>
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
    }

    bindEvents() {
        // 登出
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
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
                // 重整以套用新選單
                router.currentLayout = null; 
                router.handleRoute();
            });
        }

        // Sidebar Toggle (SB Admin 2 原生行為)
        const toggleBtn = document.getElementById('sidebarToggle');
        const toggleBtnTop = document.getElementById('sidebarToggleTop');
        const sidebar = document.querySelector('.sidebar');
        
        const handleToggle = () => {
            document.body.classList.toggle('sidebar-toggled');
            sidebar.classList.toggle('toggled');
        };

        if(toggleBtn) toggleBtn.addEventListener('click', handleToggle);
        if(toggleBtnTop) toggleBtnTop.addEventListener('click', handleToggle);
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        
        // 尋找對應的連結
        const link = document.querySelector(`.menu-item[data-path="${path}"]`);
        if (link) {
            const navItem = link.closest('.nav-item');
            if (navItem) navItem.classList.add('active');
            
            // 更新上方標題
            const titleEl = document.getElementById('page-title');
            if(titleEl) titleEl.textContent = link.querySelector('span').textContent;
        }
    }
}
