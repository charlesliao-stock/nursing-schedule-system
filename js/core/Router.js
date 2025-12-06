import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js"; // ✨ 新增：匯入編輯頁面
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        // 靜態路由表 (精確比對)
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            // 功能頁面
            '/dashboard': new SystemAdminDashboard(),
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            // '/system/units/edit': new UnitEditPage(), // 註：動態路由由 handleRoute 自動處理
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
            this.navigate('/login');
            return;
        }

        // 3. 處理 Layout (MainLayout)
        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        // 4. 決定要渲染的頁面 (Page Strategy)
        let page = this.routes[path]; // 先嘗試精確比對

        // ✨ 自動化處理動態路由 (Dynamic Route Handling)
        // 如果找不到精確路徑，則檢查是否為已知的前綴路徑
        if (!page) {
            if (path.startsWith('/system/units/edit/')) {
                // 遇到編輯頁面，建立新的實例 (讓 Page 內部自己去解析 URL ID)
                page = new UnitEditPage();
            }
            // 未來若有其他動態路由 (如編輯人員)，可在此處追加 else if
        }

        // 5. 渲染子頁面
        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            // ✨ 優化選單連動：如果是編輯頁面，讓側邊欄的「列表」保持亮起
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) {
                menuPath = '/system/units/list';
            }
            this.currentLayout.updateActiveMenu(menuPath);

            try {
                let content;
                // Dashboard 資料注入
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
