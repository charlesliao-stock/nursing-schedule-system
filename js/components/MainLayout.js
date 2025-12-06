import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        // 1. 取得使用者資料
        this.user = authService.getProfile() || user || { name: '載入中...', role: 'guest' };
        
        // 2. 鎖定「真實身分」 (Real Role)
        // 如果 originalRole 存在，代表正在偽裝，真實身分是 originalRole
        // 如果不存在，但當前 role 是 system_admin，代表真實身分就是 admin，並初始化 originalRole
        if (this.user.role === 'system_admin' && !this.user.originalRole) {
            this.user.originalRole = 'system_admin';
            authService.setProfile(this.user); // 更新快取
        }

        // 決定 UI 顯示邏輯：
        // realRole: 用於判斷是否有權限看到切換器、以及右上角的固定顯示
        // currentRole: 用於生成選單、儀表板內容
        this.realRole = this.user.originalRole || this.user.role; 
        this.currentRole = this.user.role;

        this.autoHideTimer = null;
    }

    getMenus(role) {
        // ... (保持原本的選單定義，內容省略以節省篇幅) ...
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

        const r = role || 'user';
        if (r === 'system_admin') return [...commonMenus, ...adminMenus];
        if (r === 'unit_manager') return [...commonMenus, ...managerMenus];
        if (r === 'unit_scheduler') return [...commonMenus, ...managerMenus];
        return [...commonMenus, ...userMenus];
    }

    render() {
        // 1. 選單生成：根據「模擬身分 (currentRole)」
        // 這樣切換成 user 時，選單才會變成 user 的樣子
        const menus = this.getMenus(this.currentRole);
        const menuHtml = this.buildMenuHtml(menus);
        
        const displayName = this.user.name || this.user.displayName || '使用者';
        
        // 2. 顯示名稱：根據「真實身分 (realRole)」(回應需求：顯示名稱仍須為系統管理員)
        const displayRoleName = this.getRoleName(this.realRole);

        // 3. 切換器顯示條件：只要「真實身分」是 admin 就顯示，不管現在模擬成什麼
        const showSwitcher = (this.realRole === 'system_admin');

        // 生成切換器 HTML
        const roleSwitcherHtml = showSwitcher ? `
            <div class="me-3 d-flex align-items-center bg-white rounded px-2 border shadow-sm" style="height: 32px;">
                <i class="fas fa-random text-primary me-2" title="視角切換"></i>
                <select id="role-switcher" class="form-select form-select-sm border-0 bg-transparent p-0 shadow-none" 
                        style="width: auto; cursor: pointer; font-weight: bold; color: #333; -webkit-appearance: none;">
                    <option value="system_admin" ${this.currentRole === 'system_admin' ? 'selected' : ''}>👁️ 系統管理員 (預設)</option>
                    <option disabled>──────────</option>
                    <option value="unit_manager" ${this.currentRole === 'unit_manager' ? 'selected' : ''}>👁️ 模擬：單位護理長</option>
                    <option value="unit_scheduler" ${this.currentRole === 'unit_scheduler' ? 'selected' : ''}>👁️ 模擬：排班人員</option>
                    <option value="user" ${this.currentRole === 'user' ? 'selected' : ''}>👁️ 模擬：一般護理師</option>
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

                        <span id="user-role-badge" class="badge bg-danger me-2">
                            ${displayRoleName}
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
        
        // 確保 Badge 樣式正確 (維持真實身分樣式)
        const badgeEl = document.getElementById('user-role-badge');
        if (badgeEl && this.realRole === 'system_admin') {
            badgeEl.className = 'badge bg-danger me-2';
            badgeEl.title = "目前登入帳號為系統管理員";
        }
    }

    bindEvents() {
        const logo = document.getElementById('header-logo');
        if(logo) logo.addEventListener('click', () => router.navigate('/dashboard'));

        const logoutBtn = document.getElementById('layout-logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', async () => {
            if (confirm('確定登出？')) { await authService.logout(); window.location.reload(); }
        });

        // 身份切換邏輯
        const roleSwitcher = document.getElementById('role-switcher');
        if (roleSwitcher) {
            roleSwitcher.addEventListener('change', (e) => {
                const newRole = e.target.value;
                console.log(`🔄 視角切換: ${this.currentRole} -> ${newRole}`);
                
                // 1. 修改當前使用者的 role (這會影響 Router 和 Dashboard 的判斷)
                this.user.role = newRole;
                
                // 2. 更新快取 (確保 Router 讀到新身分)
                authService.setProfile(this.user);

                // 3. 強制刷新 Layout (因為 Layout 的建構子會重新讀取資料並渲染)
                router.currentLayout = null; 
                router.handleRoute(); // 觸發重繪
            });
        }

        // 側邊欄收折邏輯 (保持不變)
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
            this.autoHideTimer = setTimeout(() => { toggleSidebar(true); }, 5000);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        // 標題連動
        const menus = this.getMenus(this.currentRole);
        const currentMenu = menus.find(m => path.includes(m.path));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = currentMenu ? currentMenu.label : '系統作業';
    }
}
