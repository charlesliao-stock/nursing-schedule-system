import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
// 引入新建立的人員列表頁 (稍後會提供)
import { StaffListPage } from "../modules/unit/StaffListPage.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null,
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/staff/list': new StaffListPage(), // 新增人員列表路由
            '/unit/settings/shifts': new ShiftSettingsPage()
        };
        this.appElement = document.getElementById('app');

        // 監聽網址 Hash 變化 (處理瀏覽器上一頁/下一頁)
        window.addEventListener('hashchange', () => {
            this.handleRoute();
        });

        // 頁面初次載入時執行
        window.addEventListener('load', () => {
            this.handleRoute();
        });
    }

    // 核心路由處理邏輯
    async handleRoute() {
        // 取得 hash，去除開頭的 #，如果沒有 hash 則預設為 /
        let path = window.location.hash.slice(1) || '/';
        
        // 處理根路徑 redirect
        if (path === '') path = '/';

        console.log(`[HashRouter] 偵測到路徑: ${path}`);
        const page = this.routes[path];

        if (page) {
            try {
                let content;
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                this.appElement.innerHTML = content;
                if (page.afterRender) page.afterRender();
            } catch (error) {
                console.error("頁面渲染錯誤:", error);
                this.appElement.innerHTML = `<div style="color:red">載入失敗: ${error.message}</div>`;
            }
        } else {
            // 404 處理
            console.error(`❌ 找不到路徑: ${path}`);
            // 如果是 dashboard 但尚未初始化，可能還沒登入，導回 login
            if (path === '/dashboard' && !page) {
                this.navigate('/login');
                return;
            }
            this.appElement.innerHTML = `<h1>404 Not Found</h1><p>路徑: ${path}</p>`;
        }
    }

    // 用於程式碼主動切換頁面
    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
