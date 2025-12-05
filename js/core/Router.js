import { loginPage } from "../modules/auth/LoginPage.js";
// 確保引用了 CreatePage (如果上一階段有加的話)
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js"; 

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null, // 預設是 null
            '/system/units/create': new UnitCreatePage()
        };
        this.appElement = document.getElementById('app');
    }

    async navigate(path) {
        console.log(`導航至: ${path}`);
        
        // 【修正】移除 || this.routes['/']，不要自動跳回登入頁
        const page = this.routes[path];

        if (page) {
            this.appElement.innerHTML = page.render();
            if (page.afterRender) {
                page.afterRender();
            }
            window.history.pushState({}, path, window.location.origin + path);
        } else {
            // 如果找不到頁面，顯示明確的錯誤，而不是跳回登入頁
            console.error(`❌ Router 錯誤: 找不到路徑 ${path} 的頁面組件`);
            this.appElement.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <h1>404 找不到頁面</h1>
                    <p>路徑: ${path}</p>
                    <p>可能原因：權限不足或路由未正確初始化。</p>
                    <button onclick="window.location.reload()" style="padding: 10px;">重新整理</button>
                    <button onclick="window.location.href='/'" style="padding: 10px;">回首頁</button>
                </div>
            `;
        }
    }
}

export const router = new Router();
