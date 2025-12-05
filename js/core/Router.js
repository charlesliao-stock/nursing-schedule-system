import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js"; // 新增引用

class Router {
    constructor() {
        // 定義路由表
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null, // 動態載入
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage() // 新增路由
        };
        this.appElement = document.getElementById('app');
    }

    /**
     * 導航到指定路徑
     * @param {string} path 
     */
    async navigate(path) {
        console.log(`導航至: ${path}`);
        
        const page = this.routes[path];

        if (page) {
            try {
                let content;
                // 支援非同步 render
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }

                this.appElement.innerHTML = content;
                
                // 執行渲染後邏輯
                if (page.afterRender) {
                    page.afterRender();
                }
                
                window.history.pushState({}, path, window.location.origin + path);

            } catch (error) {
                console.error("頁面渲染錯誤:", error);
                this.appElement.innerHTML = `<div style="padding:2rem; text-align:center; color:red;"><h3>頁面載入失敗</h3><p>${error.message}</p></div>`;
            }
        } else {
            console.error(`❌ Router 錯誤: 找不到路徑 ${path} 的頁面組件`);
            this.appElement.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <h1>404 找不到頁面</h1>
                    <p>路徑: ${path}</p>
                    <button onclick="window.history.back()" style="padding:10px; cursor:pointer;">返回上一頁</button>
                    <button onclick="window.location.href='/dashboard'" style="padding:10px; cursor:pointer;">回儀表板</button>
                </div>
            `;
        }
    }
}

export const router = new Router();
