import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js"; // 【新增】引入編輯頁面
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js"; 
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        // 靜態路由表
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': new SystemAdminDashboard(),
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            // '/system/units/edit' 是動態路由，不在此定義，由 handleRoute 處理
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),
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

        // 2. 處理需要登入的頁面 (Layout 渲染)
        const user = authService.getCurrentUser();
        if (!this.currentLayout) {
            const currentUser = user || { name: '載入中...' }; 
            this.currentLayout = new MainLayout(currentUser);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        // 3. 決定要渲染的 Page
        let page = this.routes[path];

        // 【新增】動態路由處理邏輯
        if (!page) {
            // 檢查是否為單位編輯頁面 (例如 /system/units/edit/xxxxx)
            if (path.startsWith('/system/units/edit/')) {
                const parts = path.split('/');
                const unitId = parts[parts.length - 1]; // 取得最後一段 ID
                if (unitId) {
                    page = new UnitEditPage(unitId);
                }
            }
        }

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
                viewContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <h4><i class="fas fa-exclamation-triangle"></i> 頁面載入錯誤</h4>
                        <p>${error.message}</p>
                    </div>`;
            }
        } else {
             // 404
             if(viewContainer) viewContainer.innerHTML = `
                <div style="text-align:center; padding:50px; color:#666;">
                    <h1>404</h1>
                    <p>找不到頁面：${path}</p>
                </div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
