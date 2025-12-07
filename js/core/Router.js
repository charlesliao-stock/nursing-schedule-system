import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
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

// 新增頁面
import { MySchedulePage } from "../modules/schedule/MySchedulePage.js"; 

import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            
            // Dashboard (動態處理)
            '/dashboard': null, 

            // System
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            '/system/settings': { render: () => '<div class="p-5 text-center">開發中...</div>' },
            '/system/logs': { render: () => '<div class="p-5 text-center">開發中...</div>' },

            // Unit
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),
            '/unit/settings/rules': new RuleSettings(),

            // Schedule
            '/schedule/manual': new SchedulePage(),
            '/pre-schedule/manage': new PreScheduleManagePage(),
            '/pre-schedule/submit': new PreScheduleSubmitPage(),
            '/schedule/my': new MySchedulePage(), // ✨ 使用新頁面

            // Swap & Stats
            '/swaps/review': new SwapReviewPage(),
            '/swaps/apply': new SwapApplyPage(),
            '/stats/unit': new UnitStatsPage(),
            '/stats/personal': new PersonalStatsPage()
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; 

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render();
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        const profile = authService.getProfile();
        const currentUser = profile || authService.getCurrentUser();

        if (!currentUser) {
            this.navigate('/login');
            return;
        }

        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        let page = this.routes[path];

        // ✨ Dashboard 分流邏輯
        if (path === '/dashboard') {
            const role = currentUser.role;
            if (role === 'system_admin') page = new SystemAdminDashboard(currentUser);
            else if (role === 'unit_manager' || role === 'unit_scheduler') page = new UnitManagerDashboard(currentUser);
            else page = new UserDashboard(currentUser);
        }

        // 動態路由
        if (!page) {
            if (path.startsWith('/system/units/edit/')) {
                page = new UnitEditPage();
            }
        }

        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            // 選單連動
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) menuPath = '/system/units/list';
            this.currentLayout.updateActiveMenu(menuPath);

            try {
                // 注入 user
                if (page.constructor.name.includes('Dashboard') || page.constructor.name.includes('Page')) {
                    page.user = currentUser;
                }

                let content;
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `<div class="alert alert-danger m-4">Error: ${error.message}</div>`;
            }
        } else {
             if(viewContainer) viewContainer.innerHTML = `<div class="p-5 text-center">404 Not Found</div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
