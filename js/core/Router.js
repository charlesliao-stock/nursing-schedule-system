import { loginPage } from "../modules/auth/LoginPage.js";
// 確保引用了 CreatePage (如果有的話)
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js"; 

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null, // 預設是 null，等待 App.js 填入
            '/system/units/create': new UnitCreatePage()
        };
        this.appElement = document.getElementById('app');
    }

    async navigate(path) {
        console.log(`導航至: ${path}`);
        
        // 【關鍵修正】這裡絕對不能加 || this.routes['/']
        // 否則當 dashboard 為 null 時，它會騙你說導航成功，但其實是渲染登入頁
        const page = this.routes[path];

        if (page) {
            this.appElement.innerHTML = page.render();
            if (page.afterRender) {
                page.afterRender();
            }
            window.history.pushState({}, path, window.location.origin + path);
        } else {
            // 讓錯誤顯現出來，而不是默默跳回登入頁
            console.error(`❌ Router 錯誤: 找不到路徑 ${path} 的頁面組件`);
            this.appElement.innerHTML = `
                <div style="padding: 2rem; text-align: center;">
                    <h1>404 找不到頁面</h1>
                    <p>路徑: ${path}</p>
                    <p>這代表路由沒有正確註冊，或權限載入較慢。</p>
                    <button onclick="window.location.reload()" style="padding:10px; cursor:pointer;">重新整理嘗試載入</button>
                </div>
            `;
        }
    }
}

export const router = new Router();
