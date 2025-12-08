import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        
        // 確保 system_admin 角色狀態正確
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user);
        }
        
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;
        this.autoHideTimer = null;
    }

    render() {
        // 判斷是否為管理職 (包含系統管理員 與 單位管理者)
        const isManager = ['system_admin', 'unit_manager'].includes(this.currentRole);
        const isAdmin = this.currentRole === 'system_admin';
        
        // 角色顯示名稱
        const roleMap = { 'system_admin': '系統管理員', 'unit_manager': '單位護理長', 'unit_scheduler': '排班人員', 'user': '護理師' };
        const displayRoleName = roleMap[this.realRole] || this.realRole;
        const displayName = this.user.name || '使用者';

        // 系統管理員的視角切換器
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

        return `
            <div id="wrapper">
                <ul class="navbar-nav bg-gradient-primary sidebar sidebar-dark accordion" id="accordionSidebar">
                    <a class="sidebar-brand d-flex align-items-center justify-content-center" href="#/dashboard">
                        <div class="sidebar-brand-icon rotate-n-15"><i class="fas fa-user-nurse"></i></div>
                        <div class="sidebar-brand-text mx-3">護理排班系統</div>
                    </a>
                    <hr class="sidebar-divider my-0">

                    <li class="nav-item">
                        <a class="nav-link" href="#/dashboard"><i class="fas fa-fw fa-tachometer-alt"></i> <span>儀表板</span></a>
                    </li>
                    <hr class="sidebar-divider">

                    <div class="sidebar-heading">排班作業</div>
                    
                    ${isManager ? `
                    <li class="nav-item">
                        <a class="nav-link" href="#/schedule/manual"><i class="fas fa-fw fa-calendar-alt"></i> <span>排班表</span></a>
                    </li>
                    ` : `
                    <li class="nav-item">
                        <a class="nav-link" href="#/schedule/my"><i class="fas fa-fw fa-calendar-check"></i> <span>我的班表</span></a>
                    </li>
                    `}

                    <li class="nav-item">
                        <a class="nav-link collapsed" href="#" data-bs-toggle="collapse" data-bs-target="#collapsePre" aria-expanded="true">
                            <i class="fas fa-fw fa-edit"></i> <span>預班管理</span>
                        </a>
                        <div id="collapsePre" class="collapse" data-parent="#accordionSidebar">
                            <div class="bg-white py-2 collapse-inner rounded">
                                <a class="collapse-item" href="#/pre-schedule/submit">提交預班</a>
                                ${isManager ? '<a class="collapse-item" href="#/pre-schedule/manage">預班管理 (主管)</a>' : ''}
                            </div>
                        </div>
                    </li>

                    ${!isManager ? `
                    <li class="nav-item">
                        <a class="nav-link" href="#/swaps/apply"><i class="fas fa-fw fa-exchange-alt"></i> <span>申請換班</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/stats/personal"><i class="fas fa-fw fa-chart-pie"></i> <span>個人統計</span></a>
                    </li>
                    ` : ''}

                    ${isManager ? `
                    <hr class="sidebar-divider">
                    <div class="sidebar-heading">單位管理</div>
                    <li class="nav-item">
                        <a class="nav-link" href="#/unit/staff/list"><i class="fas fa-fw fa-users"></i> <span>人員管理</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link collapsed" href="#" data-bs-toggle="collapse" data-bs-target="#collapseSettings" aria-expanded="true">
                            <i class="fas fa-fw fa-cogs"></i> <span>參數設定</span>
                        </a>
                        <div id="collapseSettings" class="collapse" data-parent="#accordionSidebar">
                            <div class="bg-white py-2 collapse-inner rounded">
                                <h6 class="collapse-header">排班參數:</h6>
                                <a class="collapse-item" href="#/unit/settings/shifts">班別設定</a>
                                <a class="collapse-item" href="#/unit/settings/groups">組別設定</a>
                                <a class="collapse-item" href="#/unit/settings/rules">排班規則</a>
                            </div>
                        </div>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/swaps/review"><i class="fas fa-fw fa-check-double"></i> <span>換班審核</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/stats/unit"><i class="fas fa-fw fa-chart-bar"></i> <span>單位統計</span></a>
                    </li>
                    ` : ''}

                    ${isAdmin ? `
                    <hr class="sidebar-divider">
                    <div class="sidebar-heading">系統後台</div>
                    <li class="nav-item">
                        <a class="nav-link" href="#/system/units/list"><i class="fas fa-fw fa-hospital"></i> <span>單位列表</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/system/settings"><i class="fas fa-fw fa-tools"></i> <span>系統設定</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/system/logs"><i class="fas fa-fw fa-list-alt"></i> <span>操作日誌</span></a>
                    </li>
                    ` : ''}
                    
                    <hr class="sidebar-divider d-none d-md-block">
                    <div class="text-center d-none d-md-inline">
                        <button class="rounded-circle border-0" id="sidebarToggle" onclick="document.body.classList.toggle('sidebar-toggled')"></button>
                    </div>
                </ul>

                <div id="content-wrapper" class="d-flex flex-column">
                    <div id="content">
                        <nav class="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
                             <button id="sidebarToggleTop" class="btn btn-link d-md-none rounded-circle mr-3" onclick="document.body.classList.toggle('sidebar-toggled')">
                                <i class="fa fa-bars"></i>
                            </button>
                            <ul class="navbar-nav ms-auto">
                                <div class="topbar-divider d-none d-sm-block"></div>
                                <li class="nav-item dropdown no-arrow">
                                    <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown">
                                        <span class="mr-2 d-none d-lg-inline text-gray-600 small">${displayName}</span>
                                        <span class="badge bg-danger me-2">${displayRoleName}</span>
                                        <div class="bg-primary rounded-circle text-white d-flex align-items-center justify-content-center" style="width:32px; height:32px;">
                                            ${displayName.charAt(0)}
                                        </div>
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

    afterRender() {
        // 登出事件
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('確定登出系統？')) {
                await authService.logout();
                window.location.reload();
            }
        });
        
        // 角色切換器事件
        const roleSwitcher = document.getElementById('role-switcher');
        if (roleSwitcher) {
            roleSwitcher.addEventListener('change', (e) => {
                this.user.role = e.target.value;
                authService.setProfile(this.user);
                // 強制重新載入路由以更新畫面
                router.currentLayout = null; 
                router.handleRoute();
            });
        }

        // 更新目前選單狀態
        this.updateActiveMenu(window.location.hash.slice(1));
    }

    updateActiveMenu(path) {
        // 清除舊的 active 狀態
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.collapse-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.collapse').forEach(el => el.classList.remove('show'));

        // 1. 限制搜尋範圍：只在 Sidebar 內找連結，避免抓到 Topbar 或 Content 的連結
        const selector = `#accordionSidebar a[href="#${path}"]`;
        const link = document.querySelector(selector);
        
        if (link) {
            if (link.classList.contains('collapse-item')) {
                // 如果是摺疊選單內的項目
                link.classList.add('active');
                const parentCollapse = link.closest('.collapse');
                if (parentCollapse) {
                    parentCollapse.classList.add('show');
                    // 讓外層的 nav-item 也亮起 (選擇性)
                    const parentNavItem = parentCollapse.closest('.nav-item');
                    if (parentNavItem) parentNavItem.classList.add('active');
                }
            } else {
                // 如果是第一層選單
                const navItem = link.closest('.nav-item');
                // 2. 安全檢查：確認 navItem 存在才操作
                if (navItem) {
                    navItem.classList.add('active');
                }
            }
        }
    }
}
