// 檔案路徑: js/components/MainLayout.js

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
     * 修正：採用「堆疊式」或「明確分級」的選單結構
     */
    getMenuByRole(role) {
        console.log("正在渲染選單，當前角色為:", role); // Debug 用

        // 0. 基礎選單 (所有人都看得到的)
        const dashboard = `<div class="menu-item" data-path="/dashboard"><i class="fas fa-tachometer-alt"></i> 儀表板</div>`;
        
        // 定義各區塊 HTML
        const personalZone = `
            <div class="menu-label">個人專區</div>
            <div class="menu-item" data-path="/my-schedule"><i class="fas fa-user-clock"></i> 我的班表</div>
            <div class="menu-item" data-path="/pre-schedule/submit"><i class="fas fa-edit"></i> 提交預班</div>
            <div class="menu-item" data-path="/swap/request"><i class="fas fa-exchange-alt"></i> 申請換班</div>
        `;

        const scheduleZone = `
            <div class="menu-label">排班作業</div>
            <div class="menu-item" data-path="/schedule/manual"><i class="fas fa-calendar-alt"></i> 排班管理</div>
            <div class="menu-item" data-path="/schedule/approval"><i class="fas fa-check-double"></i> 換班審核</div>
            <div class="menu-item" data-path="/schedule/reports"><i class="fas fa-chart-bar"></i> 統計報表</div>
        `;

        const unitManageZone = `
            <div class="menu-label">單位管理</div>
            <div class="menu-item" data-path="/unit/staff/list"><i class="fas fa-users-cog"></i> 人員管理</div>
            <div class="menu-item" data-path="/unit/settings/shifts"><i class="fas fa-clock"></i> 班別設定</div>
            <div class="menu-item" data-path="/unit/settings/rules"><i class="fas fa-ruler-combined"></i> 排班規則</div>
        `;

        const systemZone = `
            <div class="menu-label">系統管理</div>
            <div class="menu-item" data-path="/system/units/list"><i class="fas fa-building"></i> 單位列表</div>
            <div class="menu-item" data-path="/system/units/create"><i class="fas fa-plus-circle"></i> 建立單位</div>
            <div class="menu-item" data-path="/system/settings"><i class="fas fa-cogs"></i> 系統全域設定</div>
        `;

        // === 權限判斷邏輯 (4級) ===

        // Level 1: 系統管理者 (System Admin)
        if (role === 'system_admin') {
            return dashboard + systemZone; // 系統管理員通常專注於系統，或可加上 unitManageZone
        }

        // Level 2: 單位管理者 (Unit Manager)
        if (role === 'unit_manager') {
            // 管理者擁有：單位管理 + 排班作業 + 個人專區
            return dashboard + unitManageZone + scheduleZone + personalZone;
        }

        // Level 3: 單位排班者 (Unit Scheduler)
        if (role === 'unit_scheduler') {
            // 排班者擁有：排班作業 + 個人專區
            return dashboard + scheduleZone + personalZone;
        }

        // Level 4: 一般使用者 (User) - 預設
        return dashboard + personalZone;
    }

    render() {
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
        // 綁定 Header 事件
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

        // 初次綁定選單事件
        this.bindMenuEvents();

        // 【關鍵】讀取使用者詳細資料 (Role) 並重繪選單
        await this.refreshUserData();
        
        this.setupSidebarToggle();
    }

    bindMenuEvents() {
        document.querySelectorAll('.menu-item').forEach(item => {
            // 複製節點以移除舊事件，防止重複綁定
            const newClone = item.cloneNode(true);
            item.parentNode.replaceChild(newClone, item);
            
            newClone.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                router.navigate(path);
            });
        });
    }

    async refreshUserData() {
        try {
            const currentUser = authService.getCurrentUser();
            if (currentUser) {
                // 從 Firestore 讀取完整資料 (這一步才是真正拿到 role 的地方)
                const userData = await userService.getUserData(currentUser.uid);
                
                if (userData) {
                    console.log("Firestore 資料讀取成功:", userData); // Debug
                    this.user = userData;
                    
                    // 1. 更新 UI 文字
                    const nameEl = document.getElementById('header-user-name');
                    if (nameEl) nameEl.textContent = userData.name;

                    const roleBadge = document.getElementById('header-role-badge');
                    if (roleBadge) roleBadge.textContent = this.getRoleName(userData.role);

                    // 2. 【強制重繪選單】確保權限正確
                    const menuContainer = document.getElementById('sidebar-menu-container');
                    if (menuContainer) {
                        console.log("重繪選單，角色:", userData.role);
                        menuContainer.innerHTML = this.getMenuByRole(userData.role);
                        // 3. 重繪後必須重新綁定事件
                        this.bindMenuEvents();
                    }
                } else {
                    console.warn("Firestore 中找不到此 User ID 的資料");
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
