import { authService } from "../services/firebase/AuthService.js";
// Modules - Unit
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { GroupSettingsPage } from "../modules/unit/GroupSettingsPage.js";
// Modules - System
import { SystemUnitsPage } from "../modules/system/SystemUnitsPage.js";
import { SystemSettingsPage } from "../modules/system/SystemSettingsPage.js";
// Modules - Pre-Schedule
import { PreScheduleManagePage } from "../modules/pre-schedule/PreScheduleManagePage.js";
import { PreScheduleSubmitPage } from "../modules/pre-schedule/PreScheduleSubmitPage.js";
import { PreScheduleEditPage } from "../modules/pre-schedule/PreScheduleEditPage.js";
// Modules - Schedule
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
// Core
import { MainLayout } from "../components/MainLayout.js";

export class Router {
    constructor() {
        this.routes = {
            '/': () => '<h2>歡迎使用護理排班系統</h2><p>請從左側選單選擇功能。</p>',
            '/login': () => '<h2>登入頁面 (Placeholder)</h2>',
            '/dashboard': () => '<h2>儀表板</h2><p>系統概況與公告。</p>',
            
            // Unit
            '/unit/staff/list': () => new StaffListPage(),
            '/unit/settings/shifts': () => new ShiftSettingsPage(),
            '/unit/settings/groups': () => new GroupSettingsPage(),
            
            // System
            '/system/units/list': () => new SystemUnitsPage(),
            '/system/settings': () => new SystemSettingsPage(),
            
            // Pre-Schedule
            '/pre-schedule/manage': () => new PreScheduleManagePage(),
            '/pre-schedule/submit': () => new PreScheduleSubmitPage(),
            '/pre-schedule/edit': () => new PreScheduleEditPage(),

            // Schedule
            '/schedule/list': () => new PreScheduleManagePage(), // 暫時導向相同列表，或建立獨立列表
            '/schedule/edit': () => new SchedulePage(),
        };

        this.appContainer = document.getElementById('app');
        this.currentLayout = null;
        this.currentPage = null; // 追蹤當前頁面實體

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        const path = hash.split('?')[0];

        // 登入檢查
        const user = authService.getProfile();
        if (!user && path !== '/login') {
            window.location.hash = '/login';
            return;
        }

        // 1. 版面初始化 (如果尚未載入 MainLayout)
        if (!this.currentLayout && user) {
            this.currentLayout = new MainLayout(user);
            this.appContainer.innerHTML = this.currentLayout.render();
            await this.currentLayout.afterRender();
        }

        // 2. ✅ 清理舊頁面資源 (防止記憶體洩漏)
        if (this.currentPage && typeof this.currentPage.cleanup === 'function') {
            try {
                this.currentPage.cleanup();
            } catch (e) {
                console.warn("Cleanup error:", e);
            }
        }

        // 3. 路由匹配與渲染
        const handler = this.routes[path];
        const contentContainer = document.getElementById('main-view');

        if (handler) {
            const pageOrHtml = handler();
            
            if (typeof pageOrHtml === 'string') {
                contentContainer.innerHTML = pageOrHtml;
                this.currentPage = null;
            } else if (typeof pageOrHtml === 'object' && pageOrHtml.render) {
                this.currentPage = pageOrHtml; // 儲存實體
                contentContainer.innerHTML = await pageOrHtml.render();
                if (pageOrHtml.afterRender) await pageOrHtml.afterRender();
            }
        } else {
            contentContainer.innerHTML = '<h2>404 - 頁面不存在</h2>';
            this.currentPage = null;
        }

        // 更新選單狀態
        if (this.currentLayout) {
            this.currentLayout.updateActiveMenu(path);
        }
    }
}

export const router = new Router();
