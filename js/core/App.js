import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";

class App {
    constructor() {
        this.version = "1.0.3"; // 版本號更新：實作 Profile 快取機制
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
            
            if (firebaseUser) {
                console.log("使用者已登入:", firebaseUser.email);
                
                try {
                    // 1. 這是整個生命週期「唯一一次」查詢 Firestore
                    const userData = await userService.getUserData(firebaseUser.uid);
                    
                    if (userData) {
                        this.currentUserData = userData;
                        
                        // ✨ 關鍵優化：把查到的資料存進 AuthService 的記憶體倉庫
                        authService.setProfile(userData);

                        // 更新最後登入時間
                        userService.updateLastLogin(firebaseUser.uid);
                        
                        console.log("👤 讀取到使用者資料, 角色為:", userData.role);
                        
                        // 資料準備就緒，執行路由初始化
                        this.handleRouting(userData);

                        // ✅ 資料與介面都準備好了，現在才隱藏 Loading
                        if (loading) loading.style.display = 'none';

                    } else {
                        console.warn("⚠️ 帳號未初始化 (Firestore 無資料)");
                        if (loading) loading.style.display = 'none';
                        router.appElement.innerHTML = `
                            <div class="alert alert-danger m-5">
                                <h1>帳號資料未建立</h1>
                                <p>您的帳號已建立，但尚未建立個人檔案資料 (Firestore Profile)。</p>
                                <p>請聯繫系統管理員進行初始化。</p>
                            </div>`;
                    }
                } catch (error) {
                    console.error("❌ 讀取使用者資料失敗:", error);
                    if (loading) loading.style.display = 'none';
                    alert("讀取資料失敗，請查看 Console");
                }
            } else {
                console.log("使用者未登入");
                
                // ✨ 登出或未登入時，清空 AuthService 的快取
                authService.setProfile(null);

                // 導向登入頁
                router.navigate('/login');
                if (loading) loading.style.display = 'none';
            }
        });
    }

    handleRouting(user) {
        // 根據角色載入 Dashboard
        if (user.role === 'system_admin') {
            console.log("✅ 載入系統管理員儀表板");
            router.routes['/dashboard'] = new SystemAdminDashboard(user);
        } else {
            console.log(`ℹ️ 載入使用者儀表板 (${user.role})`);
            router.routes['/dashboard'] = new SystemAdminDashboard(user); 
        }

        router.navigate('/dashboard');
    }
}

export const app = new App();
