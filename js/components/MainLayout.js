import { router } from "../core/Router.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";

export class MainLayout {
    constructor(user) {
        // 預設給予 user 角色，避免 undefined 錯誤
        this.user = user || { name: '載入中...', role: 'user' };
        this.autoHideTimer = null;
    }

    /**
     * 核心邏輯：根據角色回傳選單 HTML
     */
    getMenuByRole(role) {
        // 定義共用選單項目
        const dashboard = `<div class="menu-item" data-path="/dashboard"><i class="fas fa-tachometer-alt"></i> 儀表板</div>`;
        
        // 1. 系統管理者 (System Admin)
        if (role === 'system_admin') {
            return `
                ${dashboard}
                <div class="menu-label">系統管理</div>
                <div class="menu-item" data-path="/system/units/list"><i class="fas fa-building"></i> 單位列表</div>
                <div class="menu-item" data-path="/system/units/create"><i class="fas fa-plus-circle"></i> 建立單位</div>
                <div class="menu-item" data-path="/system/settings"><i class="fas fa-cogs"></i> 系統全域設定</div>
                <div class="menu-label">監控</div>
                <div class="menu-item" data-path="/system/logs"><i class="fas fa-history"></i> 操作日誌</div>
            `;
        }

        // 2. 單位管理者 (Unit Manager)
        if (role === 'unit_manager') {
            return `
                ${dashboard}
                <div class="menu-label">單位管理</div>
                <div class="menu-item" data-path="/unit/staff/list"><i class="fas fa-users-cog"></i> 人員管理</div>
                <div class="menu-item" data-path="/unit/settings/shifts"><i class="fas fa-clock"></i> 班別設定</div>
                <div class="menu-item" data-path="/unit/settings/rules"><i class="fas fa-ruler-combined"></i> 排班規則</div>
                
                <div class="menu-label">排班作業</div>
                <div class="menu-item" data-path="/schedule/manual"><i class="fas fa-calendar-alt"></i> 排班管理</div>
                <div class="menu-item" data-path="/schedule/approval"><i class="fas fa-check-double"></i> 換班審核</div>
                <div class="menu-item" data-path="/schedule/reports"><i class="fas fa-chart-bar"></i> 統計報表</div>
            `;
        }

        // 3. 單位排班者 (Unit Scheduler)
        if (role === 'unit_scheduler') {
            return `
                ${dashboard}
                <div class="menu-label">排班作業</div>
                <div class="menu-item" data-path="/schedule/manual"><i class="fas fa-calendar-alt"></i> 排班管理</div>
                <div class="menu-item" data-path="/schedule/pre-schedule"><i class="fas fa-clipboard-list"></i> 預班管理</div>
                <div class="menu-item" data-path="/schedule/approval"><i class="fas fa-check-double"></i> 換班審核</div>
                
                <div class="menu-label">個人專區</div>
                <div class="menu-item" data-path="/my-schedule"><i class="fas fa-user-clock"></i> 我的班表</div>
            `;
        }

        // 4. 一般使用者 (User) - 預設
        return `
            <div class="menu-item" data-path="/dashboard"><i class="fas fa-home"></i> 個人首頁</div>
            <div class="menu-label">個人專區</div>
            <div class="menu-item" data-path="/my-schedule"><i class="fas fa-calendar-check"></i> 我的班表</div>
            <div class="menu-item" data-path="/pre-schedule/submit"><i class="fas fa-edit"></i> 提交預班</div>
            <div class="menu-item" data-path="/swap/request"><i class="fas fa-exchange-alt"></i> 申請換班</div>
        `;
    }

    render() {
        // 初次 Render 時，this.user.role 可能是預設值 'user'
        const menuHtml = this.getMenuByRole(this.user.role);

        return `
            <div class="app-layout">
                <aside class="layout-sidebar" id="layout-sidebar">
                    <div class="sidebar-toggle-tab" id="sidebar-toggle-btn" title="切換選單">
                        <i class="fas fa-chevron-left" id="sidebar-toggle-icon"></i>
                    </div>

                    <div class="sidebar-header" style="cursor:pointer;" onclick="window.location.hash='/dashboard'">
                        <i class="fas fa-hospital-alt" style="margin-right:10px;"></i> 護理排班系統
                        <span id="header-role-badge" style="font-size:0.7em; margin-left:5px; background:#475569; padding:2px 5px; border-radius:4px;">
                            ${this.getRoleName(this.user.role)}
                        </span>
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

    getRoleName(role) {
        const map = {
            'system_admin': '系統',
            'unit_manager': '主管',
            'unit_scheduler': '排班',
            'user': '人員'
        };
        return map[role] || 'User';
    }

    async afterRender() {
        // --- 基本事件綁定 ---
        const logo = document.getElementById('header-logo');
        if (logo) logo.addEventListener('click', () => router.navigate('/dashboard'));
        
        const logoutBtn = document.getElementById('layout-logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', async () => {
            if (confirm('確定登出？')) { 
                await authService.logout(); 
                window.location.hash = '/login';
                window.location.reload(); 
            }
        });

        // 綁定選單事件 (初次)
        this.bindMenuEvents();

        // 讀取並更新使用者資料 (包含角色權限)
        await this.refreshUserData();
        
        // 設定側邊欄收折邏輯
        this.setupSidebarToggle();
    }

    // 【新增】將選單點擊事件抽離，方便重繪後再次綁定
    bindMenuEvents() {
        document.querySelectorAll('.menu-item').forEach(item => {
            // 移除舊事件避免重複 (雖然 innerHTML 替換會自動清除，但保持習慣)
            const newClone = item.cloneNode(true);
            item.parentNode.replaceChild(newClone, item);
            
            newClone.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                router.navigate(path);
            });
        });
    }

    // 【修正】更新使用者資料後，強制重繪選單
    async refreshUserData() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                // 從 Firestore 讀取完整資料 (含 role)
                const userData = await userService.getUserData(currentUser.uid);
                
                if (userData) {
                    // 1. 更新記憶體中的 user
                    this.user = userData;
                    
                    // 2. 更新頂部使用者名稱
                    const nameEl = document.getElementById('header-user-name');
                    if (nameEl) nameEl.textContent = userData.name;

                    // 3. 更新左上角角色標籤
                    const roleBadge = document.getElementById('header-role-badge');
                    if (roleBadge) roleBadge.textContent = this.getRoleName(userData.role);

                    // 4. 【關鍵】根據新角色，重新產生選單 HTML
                    const menuContainer = document.getElementById('sidebar-menu-container');
                    if (menuContainer) {
                        menuContainer.innerHTML = this.getMenuByRole(userData.role);
                        // 5. 【關鍵】HTML 重寫後，必須重新綁定 click 事件
                        this.bindMenuEvents();
                    }
                }
            }
        } catch (error) { 
            console.error("更新使用者資料失敗", error); 
        }
    }

    setupSidebarToggle() {
        const sidebar = document.getElementById('layout-sidebar');
        const header = document.getElementById('layout-header');
        const content = document.getElementById('main-view');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');

        if (toggleBtn && sidebar) {
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
            this.autoHideTimer = setTimeout(() => toggleSidebar(true), 5000);
        }
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (path.startsWith(item.dataset.path)) item.classList.add('active');
        });
        
        // 簡易標題對應 (可依需求擴充)
        const titleEl = document.getElementById('page-title');
        if(titleEl) {
            if (path.includes('dashboard')) titleEl.textContent = '儀表板';
            else if (path.includes('system')) titleEl.textContent = '系統管理';
            else if (path.includes('unit')) titleEl.textContent = '單位管理';
            else if (path.includes('schedule')) titleEl.textContent = '排班作業';
            else titleEl.textContent = '系統作業';
        }
    }
}
