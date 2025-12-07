import { loginPage } from "../modules/auth/LoginPage.js";
// System Modules
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { UnitEditPage } from "../modules/system/UnitEditPage.js";
// Unit Modules
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
// Settings Modules
import { RuleSettings } from "../modules/settings/RuleSettings.js";
// Schedule Modules
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
// Pre-Schedule Modules
import { PreScheduleManagePage } from "../modules/pre-schedule/PreScheduleManagePage.js";
import { PreScheduleSubmitPage } from "../modules/pre-schedule/PreScheduleSubmitPage.js"; // ✨ 新增匯入
// Dashboard
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
// Core Components
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            
            // --- Dashboard ---
            '/dashboard': new SystemAdminDashboard(),

            // --- 1. 系統管理者功能 ---
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            '/system/settings': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-cogs"></i> 系統全域設定</h3><p class="text-muted">功能開發中...</p></div>' },
            '/system/logs': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-list-alt"></i> 操作日誌</h3><p class="text-muted">功能開發中...</p></div>' },

            // --- 2. 單位/人員管理 ---
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            
            // --- 3. 設定與規則 ---
            '/unit/settings/shifts': new ShiftSettingsPage(),
            '/unit/settings/rules': new RuleSettings(),

            // --- 4. 排班與預班 ---
            '/schedule/manual': new SchedulePage(),
            '/pre-schedule/manage': new PreScheduleManagePage(),
            '/pre-schedule/submit': new PreScheduleSubmitPage(), // ✨ 正式掛載
            '/schedule/my': new SchedulePage(),               // 暫用 SchedulePage

            // --- 5. 換班與統計 (Phase 4 佔位) ---
            '/swaps/review': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-exchange-alt"></i> 換班審核</h3><p class="text-muted">功能開發中...</p></div>' },
            '/swaps/apply': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-exchange-alt"></i> 申請換班</h3><p class="text-muted">功能開發中...</p></div>' },
            '/stats/unit': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-chart-bar"></i> 單位統計報表</h3><p class="text-muted">功能開發中...</p></div>' },
            '/stats/personal': { render: () => '<div class="p-5 text-center"><h3><i class="fas fa-chart-pie"></i> 個人統計</h3><p class="text-muted">功能開發中...</p></div>' }
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; 

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        if (path === '/' || path === '/login') {
            this.currentLayout = null;
            this.appElement.innerHTML = await loginPage.render();
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        const profile = authService.getProfile();
        const currentUser = profile || authService.getCurrentUser();

        if (!currentUser) {
            this.navigate('/login');
            return;
        }

        if (!this.currentLayout || (profile && this.currentLayout.user !== profile)) {
            const userToPass = profile || currentUser || { name: '載入中...', role: 'guest' };
            this.currentLayout = new MainLayout(userToPass);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        let page = this.routes[path];

        if (!page) {
            if (path.startsWith('/system/units/edit/')) {
                page = new UnitEditPage();
            }
        }

        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            let menuPath = path;
            if (path.startsWith('/system/units/edit/')) {
                menuPath = '/system/units/list';
            }
            this.currentLayout.updateActiveMenu(menuPath);

            try {
                if (page instanceof SystemAdminDashboard && profile) {
                    page.user = profile;
                }

                let content;
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error("Page Render Error:", error);
                viewContainer.innerHTML = `
                    <div class="alert alert-danger m-4">
                        <h4><i class="fas fa-exclamation-triangle"></i> 頁面載入錯誤</h4>
                        <p>${error.message}</p>
                    </div>`;
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
