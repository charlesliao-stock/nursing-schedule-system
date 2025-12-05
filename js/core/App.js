import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";

class App {
    constructor() {
        this.version = "1.0.1"; // 版本號更新
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
                
                try {
                    const userData = await userService.getUserData(firebaseUser.uid);
                    
                    if (userData) {
                        this.currentUserData = userData;
                        // 更新最後登入時間
                        userService.updateLastLogin(firebaseUser.uid);
                        
                        console.log("👤 讀取到使用者資料, 角色為:", userData.role); // 【新增 Log】
                        
                        this.handleRouting(userData);
                    } else {
                        console.warn("⚠️ 帳號未初始化 (Firestore 無資料)");
                        router.appElement.innerHTML = `<h1>帳號資料未建立</h1><p>請執行初始化腳本。</p>`;
                    }
                } catch (error) {
                    console.error("❌ 讀取使用者資料失敗:", error);
                    alert("讀取資料失敗，請查看 Console");
                }
            } else {
                console.log("使用者未登入");
                router.navigate('/login');
            }
        });
    }

    handleRouting(user) {
        // 為了避免路由是 null，我們先建立一個預設的 Dashboard (或根據角色建立)
        // 這裡強制註冊 /dashboard，確保 Router 不會報錯
        
        if (user.role === 'system_admin') {
            console.log("✅ 載入系統管理員儀表板");
            router.routes['/dashboard'] = new SystemAdminDashboard(user);
        } else {
            console.log("⚠️ 使用者權限非 system_admin，載入一般視圖");
            // 暫時也用同一個 Dashboard，但在內部顯示權限不足，或是建立一個 UserDashboard
            router.routes['/dashboard'] = new SystemAdminDashboard(user); 
        }

        // 註冊完畢後，再跳轉
        router.navigate('/dashboard');
    }
}

export const app = new App();
