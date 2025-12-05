import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js"; // 【新增】
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            '/dashboard': null,
            '/system/units/list': new UnitListPage(), // 【新增】單位管理列表
            '/system/units/create': new UnitCreatePage(),
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage()
        };
        this.appElement = document.getElementById('app');
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
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                this.appElement.innerHTML = content;
                if (page.afterRender) page.afterRender();
            } catch (error) {
                console.error(error);
                this.appElement.innerHTML = `<div style="color:red">Error: ${error.message}</div>`;
            }
        } else {
            if (path === '/dashboard' && !page) { this.navigate('/login'); return; }
            this.appElement.innerHTML = `<h1>404</h1><p>${path}</p>`;
        }
    }

    navigate(path) { window.location.hash = path; }
}

export const router = new Router();
