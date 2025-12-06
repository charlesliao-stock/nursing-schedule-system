import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";
import { SystemAdminDashboard } from "../modules/dashboard/SystemAdminDashboard.js";

class App {
    constructor() {
        this.version = "1.0.2"; // 版本號更新：修正 Loading 狀態與初始化順序
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
            
            // 重要修改：不要在這裡立即隱藏 loading
            // 我們要等到 User Profile 讀取完畢後才隱藏

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
                        
                        // 資料準備就緒，執行路由初始化
                        this.handleRouting(userData);

                        // ✅ 資料與介面都準備好了，現在才隱藏 Loading
                        if (loading) loading.style.display = 'none';

                    } else {
                        console.warn("⚠️ 帳號未初始化 (Firestore 無資料)");
                        // 雖然無資料，但也需要移除遮罩讓使用者看到錯誤提示
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
                // 未登入狀態，導向登入頁
                router.navigate('/login');
                // 導向後隱藏遮罩
                if (loading) loading.style.display = 'none';
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
            console.log(`ℹ️ 載入使用者儀表板 (${user.role})`);
            // 暫時也用同一個 Dashboard，但在內部顯示權限不足，或是建立一個 UserDashboard
            router.routes['/dashboard'] = new SystemAdminDashboard(user); 
        }

        // 註冊完畢後，再跳轉
        router.navigate('/dashboard');
    }
}

export const app = new App();
