import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
// ✅ 新增：系統設定頁面 (解決 404 問題)
import { SystemSettingsPage } from "../modules/system/SystemSettingsPage.js";

import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js";
// ✅ 新增：組別設定頁面
import { GroupSettingsPage } from "../modules/unit/GroupSettingsPage.js";

import { SchedulePage } from "../modules/schedule/SchedulePage.js";
// 若您還沒有 MySchedulePage，請保持註解或移除
// import { MySchedulePage } from "../modules/schedule/MySchedulePage.js"; 
import { PreScheduleManagePage } from "../modules/pre-schedule/PreScheduleManagePage.js";
import { PreScheduleSubmitPage } from "../modules/pre-schedule/PreScheduleSubmitPage.js";

import { SwapApplyPage } from "../modules/swap/SwapApplyPage.js";
import { SwapReviewPage } from "../modules/swap/SwapReviewPage.js";
import { PersonalStatsPage } from "../modules/statistics/PersonalStatsPage.js";
import { UnitStatsPage } from "../modules/statistics/UnitStatsPage.js";

// Dashboards
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { UnitManagerDashboard } from "../modules/dashboard/UnitManagerDashboard.js";
import { UserDashboard } from "../modules/dashboard/UserDashboard.js";

import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        // 定義路由表
        // 注意：除了 loginPage 是實體外，其餘建議存 Class 參照，由 handleRoute 動態 new 出來
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            
            // Dashboard (由 handleRoute 動態判斷角色)
            '/dashboard': 'DASHBOARD_HANDLER', 

            // System (系統管理員)
            '/system/units/list': UnitListPage,
            '/system/units/create': UnitCreatePage,
            '/system/settings': SystemSettingsPage, // ✅ 系統設定

            // Unit (單位管理)
            '/unit/staff/list': StaffListPage,
            '/unit/staff/create': StaffCreatePage,
            '/unit/settings/shifts': ShiftSettingsPage,
            '/unit/settings/rules': RuleSettings,
            '/unit/settings/groups': GroupSettingsPage, // ✅ 組別設定

            // Schedule (排班相關)
            '/schedule/manual': SchedulePage,
            '/pre-schedule/manage': PreScheduleManagePage,
            '/pre-schedule/submit': PreScheduleSubmitPage,
            // '/schedule/my': MySchedulePage,

            // Swap & Stats
            '/swaps/review': SwapReviewPage,
            '/swaps/apply': SwapApplyPage,
            '/stats/unit': UnitStatsPage,
            '/stats/personal': PersonalStatsPage
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; 

        // 綁定路由事件
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        // 移除 query string (例如 ?id=123)
        path = path.split('?')[0];
        
        if (path === '') path = '/';
        
        // 1. 特殊處理登入頁 (不使用 MainLayout)
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render();
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

        // 3. 載入 Layout (若使用者切換，Layout 重繪)
        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender(); 
        }

        // 4. 路由解析
        let PageClassOrInstance = this.routes[path];
        let pageInstance = null;

        // A. 處理 Dashboard 分流
        if (path === '/dashboard' || PageClassOrInstance === 'DASHBOARD_HANDLER') {
            const role = currentUser.role;
            if (role === 'system_admin') pageInstance = new SystemAdminDashboard(currentUser);
            else if (role === 'unit_manager' || role === 'unit_scheduler') pageInstance = new UnitManagerDashboard(currentUser);
            else pageInstance = new UserDashboard(currentUser);
        }
        // B. 處理動態路由 (例如編輯單位)
        else if (path.startsWith('/system/units/edit/')) {
            pageInstance = new UnitEditPage(); // 內部會自己抓 ID
        }
        // C. 處理一般頁面
        else if (PageClassOrInstance) {
            // 判斷是 Class 還是已存在的實體
            if (typeof PageClassOrInstance === 'function' && /^\s*class\s+/.test(PageClassOrInstance.toString())) {
                // 如果是 Class，每次都 new 一個新的，確保狀態重置
                pageInstance = new PageClassOrInstance();
            } else {
                // 如果是實體 (例如 loginPage)，直接使用
                pageInstance = PageClassOrInstance;
            }
        }

        // 5. 渲染頁面
        const viewContainer = document.getElementById('main-view');

        if (pageInstance && viewContainer) {
            // 更新 Sidebar 的 Active 狀態
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) menuPath = '/system/units/list';
            if (this.currentLayout) this.currentLayout.updateActiveMenu(menuPath);

            try {
                // 注入 User 資訊給頁面使用
                if (pageInstance) {
                    pageInstance.user = currentUser;
                }

                let content;
                // 支援非同步 Render
                if (pageInstance.render.constructor.name === 'AsyncFunction') {
                    content = await pageInstance.render();
                } else {
                    content = pageInstance.render();
                }
                
                viewContainer.innerHTML = content;
                
                // 執行 DOM 載入後邏輯
                if (pageInstance.afterRender) await pageInstance.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `<div class="alert alert-danger m-4">頁面載入錯誤: ${error.message}</div>`;
            }
        } else {
             // 404 處理
             if(viewContainer) viewContainer.innerHTML = `
                <div class="text-center p-5 text-muted">
                    <i class="fas fa-exclamation-circle fa-3x mb-3"></i>
                    <h3>404 Page Not Found</h3>
                    <p>找不到路徑: ${path}</p>
                </div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
