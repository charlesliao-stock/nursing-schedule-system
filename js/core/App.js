import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";

class App {
    constructor() {
        this.version = "1.0.2"; // 更新版本號
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
            
            // 修正 1: 不要這在裡馬上隱藏 loading，要在資料準備好之後

            if (firebaseUser) {
                console.log("使用者已登入:", firebaseUser.email);
                
                try {
                    // 等待 Firestore 資料讀取完畢
                    const userData = await userService.getUserData(firebaseUser.uid);
                    
                    if (userData) {
                        this.currentUserData = userData;
                        // 更新最後登入時間
                        userService.updateLastLogin(firebaseUser.uid);
                        
                        console.log("👤 讀取到使用者資料, 角色為:", userData.role);
                        
                        // 修正 2: 將完整的 userData 注入到 Router 或全域狀態 (這裡先透過 handleRouting 傳遞)
                        this.handleRouting(userData);

                        // 修正 3: 資料都準備好了，現在才隱藏 Loading
                        if (loading) loading.style.display = 'none';

                    } else {
                        console.warn("⚠️ 帳號未初始化 (Firestore 無資料)");
                        // 如果無資料，也需要隱藏 loading 讓使用者看到錯誤訊息
                        if (loading) loading.style.display = 'none';
                        router.appElement.innerHTML = `<h1>帳號資料未建立</h1><p>請聯繫管理員。</p>`;
                    }
                } catch (error) {
                    console.error("❌ 讀取使用者資料失敗:", error);
                    if (loading) loading.style.display = 'none';
                    alert("讀取資料失敗，請查看 Console");
                }
            } else {
                console.log("使用者未登入");
                // 未登入狀態，直接導向 Login 並隱藏 Loading
                router.navigate('/login');
                if (loading) loading.style.display = 'none';
            }
        });
    }

    handleRouting(user) {
        // 根據權限設定 Dashboard
        if (user.role === 'system_admin') {
            console.log("✅ 載入系統管理員儀表板");
            router.routes['/dashboard'] = new SystemAdminDashboard(user);
        } else {
            // TODO: 未來可以根據不同角色載入不同 Dashboard Class
            console.log(`ℹ️ 載入使用者儀表板 (${user.role})`);
            router.routes['/dashboard'] = new SystemAdminDashboard(user); 
        }

        // 強制更新 Router 的當前 Layout 使用者，避免 MainLayout 第一次渲染拿到舊資料
        // 這需要 Router.js 支援，或者我們依賴 App.js 阻擋渲染的時間差即可解決大部分問題
        
        router.navigate('/dashboard');
    }
}

export const app = new App();
