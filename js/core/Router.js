import { loginPage } from "../modules/auth/LoginPage.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null // 動態載入
        };
        this.appElement = document.getElementById('app');
    }

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