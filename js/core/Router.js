import { loginPage } from "../modules/auth/LoginPage.js";
// System Modules
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
// Unit Modules
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js"; // 班別設定
// Settings Modules
import { RuleSettings } from "../modules/settings/RuleSettings.js"; // 排班規則
// Schedule Modules
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
// Dashboard
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
// Core Components
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        // 定義靜態路由表
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            
            // --- Dashboard ---
            '/dashboard': new SystemAdminDashboard(),

            // --- 1. 系統管理者功能 ---
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            // '/system/units/edit': 動態路由，由 handleRoute 處理
            '/system/settings': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-cogs"></i> 系統全域設定</h3><p class="text-muted">功能開發中...</p></div>' },
            '/system/logs': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-list-alt"></i> 操作日誌</h3><p class="text-muted">功能開發中...</p></div>' },

            // --- 2. 單位/人員管理 ---
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            
            // --- 3. 設定與規則 ---
            '/unit/settings/shifts': new ShiftSettingsPage(), // 班別設定
            '/unit/settings/rules': new RuleSettings(),       // 排班規則 (整合 GAS)

            // --- 4. 排班與預班 ---
            '/schedule/manual': new SchedulePage(),           // 排班管理 (手動/AI)
            '/pre-schedule/manage': new SchedulePage(),       // 預班管理 (暫用 SchedulePage，未來可拆分)
            '/pre-schedule/submit': new SchedulePage(),       // 提交預班 (暫用 SchedulePage)
            '/schedule/my': new SchedulePage(),               // 我的班表 (暫用 SchedulePage)

            // --- 5. 換班與統計 (Phase 4 佔位) ---
            '/swaps/review': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-exchange-alt"></i> 換班審核</h3><p class="text-muted">功能開發中...</p></div>' },
            '/swaps/apply': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-exchange-alt"></i> 申請換班</h3><p class="text-muted">功能開發中...</p></div>' },
            '/stats/unit': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-chart-bar"></i> 單位統計報表</h3><p class="text-muted">功能開發中...</p></div>' },
            '/stats/personal': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-chart-pie"></i> 個人統計</h3><p class="text-muted">功能開發中...</p></div>' }
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; 

        // 監聽路由變化與頁面載入
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        // 1. 處理 Login 頁面 (不需 Layout)
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render();
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        // 2. 權限檢查：取得最新的使用者資料 (優先取用 AuthService 的快取 Profile)
        const profile = authService.getProfile();
        const currentUser = profile || authService.getCurrentUser();

        if (!currentUser) {
            // 未登入，導向登入頁
            this.navigate('/login');
            return;
        }

        // 3. 處理 Layout (MainLayout)
        // 如果 Layout 不存在，或 User 資料已更新 (例如切換身分後)，則重新建立 Layout
        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        // 4. 決定要渲染的頁面 (Page Strategy)
        let page = this.routes[path]; // 先嘗試精確比對路由表

        // ✨ 自動化處理動態路由 (Dynamic Route Handling)
        // 如果找不到精確路徑，則檢查是否為已知的前綴路徑
        if (!page) {
            if (path.startsWith('/system/units/edit/')) {
                // 遇到編輯單位頁面，建立新的實例 (Page 內部會自行解析 URL ID)
                page = new UnitEditPage();
            }
            // 未來若有其他動態路由 (如編輯人員細節)，可在此處追加 else if
        }

        // 5. 渲染子頁面
        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            // ✨ 優化選單連動 (Active Menu Highlight)
            // 如果是子頁面 (如編輯單位)，讓側邊欄對應的父選單 (單位列表) 保持亮起
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) {
                menuPath = '/system/units/list';
            }
            this.currentLayout.updateActiveMenu(menuPath);

            try {
                let content;
                // Dashboard 資料注入：確保它拿到最新的 user 資料
                if (page instanceof SystemAdminDashboard && profile) {
                    page.user = profile;
                }

                // 執行渲染 (支援同步與非同步 render)
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                
                // 執行渲染後邏輯 (事件綁定等)
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `
                    <div class="alert alert-danger m-4">
                        <h4><i class="fas fa-exclamation-triangle"></i> 頁面載入錯誤</h4>
                        <p>${error.message}</p>
                    </div>`;
            }
        } else {
             // 404 處理
             if(viewContainer) viewContainer.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center" style="height: 60vh;">
                    <div class="text-gray-300 mb-4" style="font-size: 5rem;"><i class="fas fa-ghost"></i></div>
                    <h1 class="h3 text-gray-800 mb-2">404 Page Not Found</h1>
                    <p class="text-muted mb-4">找不到頁面: ${path}</p>
                    <a href="#/dashboard" class="btn btn-primary">&larr; 返回儀表板</a>
                </div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
