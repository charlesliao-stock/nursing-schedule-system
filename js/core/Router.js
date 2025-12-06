import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            // 功能頁面
            '/dashboard': new SystemAdminDashboard(), // 預設空殼，會由 App.js 注入正確的實例
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),
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

        // 2. 取得最新的使用者資料 (優先取用 AuthService 的快取 Profile)
        const profile = authService.getProfile();
        const currentUser = profile || authService.getCurrentUser();

        if (!currentUser) {
            // 未登入，導向登入頁
            this.navigate('/login');
            return;
        }

        // 3. 處理 Layout (MainLayout)
        // 關鍵修正：如果 Layout 已存在，但 User 資料過舊 (例如原本沒 role 現在有了)，則重新建立 Layout
        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            
            // 只有當我們真的有 profile 時，才更新 layout 的 user，避免畫面跳動
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            
            this.currentLayout = new MainLayout(userToPass);
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
                // 如果是 Dashboard，確保它拿到最新的 user 資料 (如果是 SystemAdminDashboard)
                if (page instanceof SystemAdminDashboard && profile) {
                    page.user = profile;
                }

                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error(error);
                viewContainer.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
            }
        } else {
             if(viewContainer) viewContainer.innerHTML = `<div class="p-5 text-center"><h1>404</h1><p>找不到頁面: ${path}</p></div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
