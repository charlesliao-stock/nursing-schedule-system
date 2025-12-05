import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";

class App {
    constructor() {
        this.version = "1.0.0";
        this.currentUserData = null;
    }

    async init() {
        console.log(`系統 v${this.version} 啟動中...`);
        firebaseService.init();
        this.setupAuthListener();
    }

    setupAuthListener() {
        authService.monitorAuthState(async (firebaseUser) => {
            const loading = document.getElementById('loading-screen');
            if (loading) loading.style.display = 'none';

            if (firebaseUser) {
                console.log("使用者已登入:", firebaseUser.email);
                const userData = await userService.getUserData(firebaseUser.uid);
                
                if (userData) {
                    this.currentUserData = userData;
                    userService.updateLastLogin(firebaseUser.uid);
                    this.handleRouting(userData);
                } else {
                    console.warn("⚠️ 帳號未初始化 (請執行 Console Script)");
                    router.appElement.innerHTML = `<div style="padding:2rem;text-align:center"><h1>帳號未啟用</h1><p>請管理員執行初始化腳本</p></div>`;
                }
            } else {
                console.log("使用者未登入");
                router.navigate('/login');
            }
        });
    }

    handleRouting(user) {
        if (user.role === 'system_admin') {
            router.routes['/dashboard'] = new SystemAdminDashboard(user);
            router.navigate('/dashboard');
        } else {
            router.navigate('/dashboard'); // 其他角色暫時也導向 dashboard
        }
    }
}

export const app = new App();