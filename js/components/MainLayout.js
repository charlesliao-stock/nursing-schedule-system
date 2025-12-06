import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        // 初始狀態：如果 user 裡沒有 role，先給一個預設值，避免報錯
        this.user = user || { name: '載入中...', role: 'guest' };
        this.autoHideTimer = null;
    }

    /**
     * 定義各角色的選單結構
     */
    getMenus(role) {
        const commonMenus = [
            { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: '儀表板' }
        ];

        const adminMenus = [
            { path: '/system/units/list', icon: 'fas fa-building', label: '單位管理' },
            { path: '/unit/staff/list', icon: 'fas fa-users', label: '人員管理' }, // Admin 也常需管理人員
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

        // 根據角色回傳對應陣列
        // 確保 role 存在，否則預設回傳 userMenus
        const currentRole = role || 'user';
        
        if (currentRole === 'system_admin') return [...commonMenus, ...adminMenus];
        if (currentRole === 'unit_manager') return [...commonMenus, ...managerMenus];
        if (currentRole === 'unit_scheduler') return [...commonMenus, ...managerMenus];
        
        return [...commonMenus, ...userMenus];
    }

    render() {
        // 初次 Render 時，可能還沒有拿到 role，所以先渲染目前的狀態
        // 等 afterRender 抓到資料後，會再更新一次 DOM
        const menus = this.getMenus(this.user.role);
        const menuHtml = this.buildMenuHtml(menus);

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
                            ${this.getRoleName(this.user.role)}
                        </span>
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${this.user.name || '使用者'}</span>
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
        const map = {
            'system_admin': '系統管理員',
            'unit_manager': '護理長',
            'unit_scheduler': '排班人員',
            'user': '護理師',
            'guest': '訪客'
        };
        return map[role] || '載入中...';
    }

    async afterRender() {
        // 1. 綁定基本事件
        this.bindEvents();

        // 2. 關鍵修正：主動去抓最新的使用者資料 (包含 Role)
        await this.refreshUserRole();

        // 3. 更新目前選單的 Active 狀態
        const currentPath = window.location.hash.slice(1) || '/dashboard';
        this.updateActiveMenu(currentPath);
    }

    bindEvents() {
        // Logo 點擊
        const logo = document.getElementById('header-logo');
        if(logo) logo.addEventListener('click', () => router.navigate('/dashboard'));

        // 登出按鈕
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

            // 5秒後自動收折
            this.autoHideTimer = setTimeout(() => {
                toggleSidebar(true);
            }, 5000);
        }
    }

    /**
     * ✨ 核心修正：重新讀取使用者資料並更新選單
     */
    async refreshUserRole() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                // 從 Firestore 讀取完整資料 (包含 role)
                const userData = await userService.getUserData(currentUser.uid);
                
                if (userData) {
                    // 更新目前的 user 物件
                    this.user = userData;
                    
                    // 1. 更新右上角名字與 Badge
                    const nameEl = document.getElementById('header-user-name');
                    const badgeEl = document.getElementById('user-role-badge');
                    if (nameEl) nameEl.textContent = userData.name;
                    if (badgeEl) {
                        badgeEl.textContent = this.getRoleName(userData.role);
                        // 根據角色給不同顏色
                        badgeEl.className = `badge me-2 ${userData.role === 'system_admin' ? 'bg-danger' : 'bg-secondary'}`;
                    }

                    // 2. 重新產生選單 HTML (這一步會讓選單變成管理員版)
                    const newMenus = this.getMenus(userData.role);
                    const menuContainer = document.getElementById('sidebar-menu-container');
                    if (menuContainer) {
                        menuContainer.innerHTML = this.buildMenuHtml(newMenus);
                        
                        // 重新綁定選單點擊事件 (因為 DOM 被換掉了)
                        // 其實直接用 href="#/..." 就不需要額外綁定 click event 來 navigate，
                        // 但為了 updateActiveMenu，我們還是可以監聽 hashchange
                    }
                    
                    console.log("選單權限已更新為:", userData.role);
                }
            }
        } catch (error) {
            console.error("更新使用者權限失敗:", error);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            // 模糊比對，例如 /system/units/create 也會讓 /system/units/list 亮起 (視需求調整)
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        // 更新標題
        const menus = this.getMenus(this.user.role);
        const currentMenu = menus.find(m => path.includes(m.path));
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = currentMenu ? currentMenu.label : '系統作業';
    }
}
