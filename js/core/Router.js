import { loginPage } from "../modules/auth/LoginPage.js";
import { UnitCreatePage } from "../modules/system/UnitCreatePage.js";
import { UnitListPage } from "../modules/system/UnitListPage.js";
import { StaffCreatePage } from "../modules/unit/StaffCreatePage.js";
import { StaffListPage } from "../modules/unit/StaffListPage.js";
import { ShiftSettingsPage } from "../modules/unit/ShiftSettingsPage.js";
import { RuleSettings } from "../modules/settings/RuleSettings.js"; // 【新增】引入規則設定模組
import { SchedulePage } from "../modules/schedule/SchedulePage.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";
import { MainLayout } from "../components/MainLayout.js";
import { authService } from "../services/firebase/AuthService.js";

class Router {
    constructor() {
        this.routes = {
            '/': loginPage,
            '/login': loginPage,
            
            // --- 儀表板 ---
            '/dashboard': new SystemAdminDashboard(),
            
            // --- 系統管理 (System Admin) ---
            '/system/units/list': new UnitListPage(),
            '/system/units/create': new UnitCreatePage(),
            
            // --- 單位管理 (Unit Manager) ---
            '/unit/staff/list': new StaffListPage(),
            '/unit/staff/create': new StaffCreatePage(),
            '/unit/settings/shifts': new ShiftSettingsPage(),
            '/unit/settings/rules': new RuleSettings(), // 【新增】註冊路由
            
            // --- 排班作業 (Scheduler) ---
            '/schedule/manual': new SchedulePage()
        };

        this.appElement = document.getElementById('app');
        this.currentLayout = null; // 用來追蹤現在是否已經載入 Layout

        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        if (path === '') path = '/';
        
        // 1. 處理 Login 頁面 (不需要 Layout)
        if (path === '/' || path === '/login') {
            this.currentLayout = null; // 重置
            this.appElement.innerHTML = await loginPage.render();
            if (loginPage.afterRender) loginPage.afterRender();
            return;
        }

        // 2. 處理需要登入的頁面
        const user = authService.getCurrentUser(); 
        // 注意：若重新整理頁面 user 可能暫時為 null，實際由 App.js 的 AuthListener 監控並導向
        
        // 3. 確保 Layout 存在
        if (!this.currentLayout) {
            // 如果還沒有 Layout，先渲染 Layout
            const currentUser = user || { name: '載入中...' }; 
            this.currentLayout = new MainLayout(currentUser);
            this.appElement.innerHTML = this.currentLayout.render();
            this.currentLayout.afterRender();
        }

        // 4. 渲染子頁面內容到 #main-view
        const page = this.routes[path];
        const viewContainer = document.getElementById('main-view');

        if (page && viewContainer) {
            // 更新 Sidebar 狀態 (HighLight 目前選單)
            this.currentLayout.updateActiveMenu(path);

            try {
                let content;
                // 支援非同步 render
                if (page.render.constructor.name === 'AsyncFunction') {
                    content = await page.render();
                } else {
                    content = page.render();
                }
                
                viewContainer.innerHTML = content;
                if (page.afterRender) page.afterRender();

            } catch (error) {
                console.error(error);
                viewContainer.innerHTML = `<div style="color:red; padding:20px;">
                    <h3><i class="fas fa-exclamation-triangle"></i> 頁面載入錯誤</h3>
                    <p>${error.message}</p>
                </div>`;
            }
        } else {
             // 404 Not Found
             if(viewContainer) viewContainer.innerHTML = `
                <div style="text-align:center; padding:50px; color:#666;">
                    <h1>404</h1>
                    <p>找不到頁面：${path}</p>
                </div>`;
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

export const router = new Router();
