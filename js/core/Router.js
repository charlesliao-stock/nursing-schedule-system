import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
import { SystemSettingsPage } from "../modules/system/SystemSettingsPage.js";

import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js";
import { GroupSettingsPage } from "../modules/unit/GroupSettingsPage.js";

import { ScheduleListPage } from "../modules/schedule/ScheduleListPage.js"; 
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { MySchedulePage } from "../modules/schedule/MySchedulePage.js"; 

// ✅ 修改：拆分為列表頁與編輯頁
import { PreScheduleManagePage } from "../modules/pre-schedule/PreScheduleManagePage.js";
import { PreScheduleEditPage } from "../modules/pre-schedule/PreScheduleEditPage.js"; // 新增
import { PreScheduleSubmitPage } from "../modules/pre-schedule/PreScheduleSubmitPage.js";

import { SwapApplyPage } from "../modules/swap/SwapApplyPage.js";
import { SwapReviewPage } from "../modules/swap/SwapReviewPage.js";
import { PersonalStatsPage } from "../modules/statistics/PersonalStatsPage.js";
import { UnitStatsPage } from "../modules/statistics/UnitStatsPage.js";

import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { UnitManagerDashboard } from "../modules/dashboard/UnitManagerDashboard.js";
import { UserDashboard } from "../modules/dashboard/UserDashboard.js";

import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': 'DASHBOARD_HANDLER', 

            '/system/units/list': UnitListPage,
            '/system/units/create': UnitCreatePage,
            '/system/settings': SystemSettingsPage,

            '/unit/staff/list': StaffListPage,
            '/unit/staff/create': StaffCreatePage,
            '/unit/settings/shifts': ShiftSettingsPage,
            '/unit/settings/rules': RuleSettings,
            '/unit/settings/groups': GroupSettingsPage,

            '/schedule/list': ScheduleListPage,
            '/schedule/edit': SchedulePage,
            '/schedule/my': MySchedulePage,
            
            // ✅ 預班管理路由更新
            '/pre-schedule/manage': PreScheduleManagePage, // 列表 (選單位 -> 看月份)
            '/pre-schedule/edit': PreScheduleEditPage,     // 編輯 (大表)
            '/pre-schedule/submit': PreScheduleSubmitPage,

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
        const purePath = path.split('?')[0]; 
        
        if (purePath === '') path = '/';
        
        if (purePath === '/' || purePath === '/login') {
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

        let PageClassOrInstance = this.routes[purePath];
        let pageInstance = null;

        if (purePath === '/dashboard' || PageClassOrInstance === 'DASHBOARD_HANDLER') {
            const role = currentUser.role;
            if (role === 'system_admin') pageInstance = new SystemAdminDashboard(currentUser);
            else if (role === 'unit_manager' || role === 'unit_scheduler') pageInstance = new UnitManagerDashboard(currentUser);
            else pageInstance = new UserDashboard(currentUser);
        }
        else if (purePath.startsWith('/system/units/edit/')) {
            pageInstance = new UnitEditPage();
        }
        else if (PageClassOrInstance) {
            if (typeof PageClassOrInstance === 'function' && /^\s*class\s+/.test(PageClassOrInstance.toString())) {
                pageInstance = new PageClassOrInstance();
            } else {
                pageInstance = PageClassOrInstance;
            }
        }

        const viewContainer = document.getElementById('main-view');

        if (pageInstance && viewContainer) {
            let menuPath = purePath;
            // 讓子頁面的選單亮燈停留在父層列表
            if (purePath === '/schedule/edit') menuPath = '/schedule/list';
            if (purePath === '/pre-schedule/edit') menuPath = '/pre-schedule/manage';

            if (this.currentLayout) this.currentLayout.updateActiveMenu(menuPath);

            try {
                if (pageInstance) pageInstance.user = currentUser;

                let content;
                if (pageInstance.render.constructor.name === 'AsyncFunction') {
                    content = await pageInstance.render();
                } else {
                    content = pageInstance.render();
                }
                
                viewContainer.innerHTML = content;
                if (pageInstance.afterRender) await pageInstance.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `<div class="alert alert-danger m-4">頁面載入錯誤: ${error.message}</div>`;
            }
        } else {
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
