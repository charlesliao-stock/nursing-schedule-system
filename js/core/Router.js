import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
// Phase 3 新增：排班頁面
import { SchedulePage } from "../modules/schedule/SchedulePage.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null, // Dashboard 邏輯通常在 Login 後處理，或另外獨立
            
            // Phase 1 & 2: 系統與單位設定
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),

            // Phase 3: 排班管理
            '/schedule/manual': new SchedulePage()
        };

        this.appElement = document.getElementById('app');
        
        // 綁定路由變化事件
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        console.log(`[HashRouter] 路徑: ${path}`);
        
        const page = this.routes[path];
        
        if (page) {
            try {
                let content;
                // 判斷 render 是否為非同步函數 (Async Function)
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                this.appElement.innerHTML = content;
                
                // 執行渲染後的邏輯 (如綁定事件)
                if (page.afterRender) page.afterRender();
                
            } catch (error) {
                console.error(error);
                this.appElement.innerHTML = `<div style="color:red">Error: ${error.message}</div>`;
            }
        } else {
            // 簡易的權限或重導向判斷
            if (path === '/dashboard' && !page) { 
                // 這裡可以加入檢查是否已登入的邏輯，目前先導回 login
                this.navigate('/login'); 
                return; 
            }
            this.appElement.innerHTML = `<h1>404</h1><p>Page not found: ${path}</p>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
