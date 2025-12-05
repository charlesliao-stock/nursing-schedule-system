import { loginPage } from "../modules/auth/LoginPage.js";
// 新增引用
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js"; 

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null, // 動態載入
            // 新增路由
            '/system/units/create': new UnitCreatePage() 
        };
        this.appElement = document.getElementById('app');
    }
    
    // ... navigate 方法保持不變 ...
    async navigate(path) {
        console.log(`導航至: ${path}`);
        const page = this.routes[path] || this.routes['/'];

        if (page) {
            this.appElement.innerHTML = page.render();
            if (page.afterRender) page.afterRender();
            window.history.pushState({}, path, window.location.origin + path);
        } else {
            this.appElement.innerHTML = '<h1>404 Not Found</h1>';
        }
    }
}

export const router = new Router();
