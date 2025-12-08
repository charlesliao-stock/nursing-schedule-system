import { loginPage } from "../modules/auth/LoginPage.js"; // LoginPage 因為較特殊，維持單例通常沒問題，但也可改
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SwapApplyPage } from "../modules/swap/SwapApplyPage.js";
import { SwapReviewPage } from "../modules/swap/SwapReviewPage.js";
import { PersonalStatsPage } from "../modules/statistics/PersonalStatsPage.js";
import { UnitStatsPage } from "../modules/statistics/UnitStatsPage.js";

// ✅ 確保引用路徑正確 (對應 modules 資料夾)
import { PreScheduleManagePage } from "../modules/pre-schedule/PreScheduleManagePage.js";
import { PreScheduleSubmitPage } from "../modules/pre-schedule/PreScheduleSubmitPage.js";

// Dashboards
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { UnitManagerDashboard } from "../modules/dashboard/UnitManagerDashboard.js";
import { UserDashboard } from "../modules/dashboard/UserDashboard.js";

// 若您尚未建立此檔案，請先暫時註解掉，以免報錯
// import { MySchedulePage } from "../modules/schedule/MySchedulePage.js"; 

import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        // 定義路由表：只存 Class 定義，不存實體
        this.routes = {
            '/': loginPage, // LoginPage 是一個已經 new 好的實體 (因為它在 export 時就 new 了)
            '/login': loginPage,
            
            // Dashboard (動態處理)
            '/dashboard': 'DASHBOARD_HANDLER', 

            // System
            '/system/units/list': UnitListPage,
            '/system/units/create': UnitCreatePage,
            
            // Unit
            '/unit/staff/list': StaffListPage,
            '/unit/staff/create': StaffCreatePage,
            '/unit/settings/shifts': ShiftSettingsPage,
            '/unit/settings/rules': RuleSettings,

            // Schedule
            '/schedule/manual': SchedulePage,
            
            // ✅ 這裡改為存 Class
            '/pre-schedule/manage': PreScheduleManagePage,
            '/pre-schedule/submit': PreScheduleSubmitPage,
            // '/schedule/my': MySchedulePage, // 若有檔案再開啟

            // Swap & Stats
            '/swaps/review': SwapReviewPage,
            '/swaps/apply': SwapApplyPage,
            '/stats/unit': UnitStatsPage,
            '/stats/personal': PersonalStatsPage
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; 

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        // 1. 特殊處理登入頁 (因為它不使用 MainLayout)
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render(); // loginPage 是單例
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        // 2. 權限檢查
        const profile = authService.getProfile();
        const currentUser = profile || authService.getCurrentUser();

        if (!currentUser) {
            this.navigate('/login');
            return;
        }

        // 3. 載入 Layout (若使用者切換，Layout 也要重繪)
        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender(); // 綁定 Sidebar 事件
        }

        // 4. 路由解析與頁面實例化
        let PageClassOrInstance = this.routes[path];
        let pageInstance = null;

        // 處理 Dashboard 分流
        if (path === '/dashboard' || PageClassOrInstance === 'DASHBOARD_HANDLER') {
            const role = currentUser.role;
            if (role === 'system_admin') pageInstance = new SystemAdminDashboard(currentUser);
            else if (role === 'unit_manager' || role === 'unit_scheduler') pageInstance = new UnitManagerDashboard(currentUser);
            else pageInstance = new UserDashboard(currentUser);
        }
        // 處理動態路由 (Edit Page)
        else if (path.startsWith('/system/units/edit/')) {
            pageInstance = new UnitEditPage(); // 這裡也可以傳 ID 進去
        }
        // 處理一般頁面
        else if (PageClassOrInstance) {
            // 如果是 Class (函式)，就 new 出一個新實體
            if (typeof PageClassOrInstance === 'function' && /^\s*class\s+/.test(PageClassOrInstance.toString())) {
                pageInstance = new PageClassOrInstance();
            } else {
                // 如果已經是實體 (像 loginPage)，直接使用
                pageInstance = PageClassOrInstance;
            }
        }

        // 5. 渲染頁面
        const viewContainer = document.getElementById('main-view');

        if (pageInstance && viewContainer) {
            // 選單連動 (Active State)
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) menuPath = '/system/units/list';
            if (this.currentLayout) this.currentLayout.updateActiveMenu(menuPath);

            try {
                // 注入 user 資訊 (方便頁面內部使用)
                if (pageInstance) {
                    pageInstance.user = currentUser;
                }

                let content;
                // 支援非同步 render
                if (pageInstance.render.constructor.name === 'AsyncFunction') {
                    content = await pageInstance.render();
                } else {
                    content = pageInstance.render();
                }
                
                viewContainer.innerHTML = content;
                
                // 執行 DOM 載入後邏輯
                if (pageInstance.afterRender) pageInstance.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `<div class="alert alert-danger m-4">頁面載入錯誤: ${error.message}</div>`;
            }
        } else {
             if(viewContainer) viewContainer.innerHTML = `<div class="p-5 text-center text-muted">404 Page Not Found<br><small>${path}</small></div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
