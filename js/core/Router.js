// js/core/Router.js
import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
// 【新增】引入規則設定模組
import { RuleSettings } from "../modules/settings/RuleSettings.js"; 

import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            // 功能頁面
            '/dashboard': new SystemAdminDashboard(),
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),
            // 【新增】註冊路由
            '/unit/settings/rules': new RuleSettings(), 
            '/schedule/manual': new SchedulePage()
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null;

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        // 1. 處理 Login 頁面
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render();
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        // 2. 處理需要登入的頁面
        const user = authService.getCurrentUser();
        
        // 3. 確保 Layout 存在
        if (!this.currentLayout) {
            const currentUser = user || { name: '載入中...' }; 
            this.currentLayout = new MainLayout(currentUser);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        // 4. 渲染子頁面
        const page = this.routes[path];
        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            this.currentLayout.updateActiveMenu(path);

            try {
                let content;
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error(error);
                viewContainer.innerHTML = `<div style="color:red">Error: ${error.message}</div>`;
            }
        } else {
             if(viewContainer) viewContainer.innerHTML = `<h1>404</h1><p>${path}</p>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
