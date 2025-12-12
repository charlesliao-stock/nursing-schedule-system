import { firebaseService } from "../services/firebase/FirebaseService.js";
import { authService } from "../services/firebase/AuthService.js";
import { userService } from "../services/firebase/UserService.js";
import { router } from "./Router.js";

class App {
    constructor() {
        this.version = "1.0.5"; // 版本更新
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
                    // 1. 讀取使用者資料
                    const userData = await userService.getUserData(firebaseUser.uid);
                    
                    if (userData) {
                        this.currentUserData = userData;
                        
                        // ✨ 關鍵：將資料存入 AuthService 快取，讓 Router 可以讀取
                        authService.setProfile(userData);

                        // 更新最後登入時間
                        userService.updateLastLogin(firebaseUser.uid);
                        
                        console.log(`👤 讀取成功: ${userData.name} (${userData.role})`);
                        
                        // 2. 導向儀表板 (修正點：不再手動指定 Dashboard Class，交給 Router 處理)
                        router.navigate('/dashboard');

                    } else {
                        console.warn("⚠️ 帳號未初始化 (Firestore 無資料)");
                        router.appElement.innerHTML = `
                            <div class="alert alert-danger m-5">
                                <h3>帳號資料異常</h3>
                                <p>您的帳號已建立，但尚未建立個人檔案資料。</p>
                            </div>`;
                    }
                } catch (error) {
                    console.error("❌ 讀取使用者資料失敗:", error);
                    alert("讀取資料失敗，請查看 Console");
                } finally {
                    if (loading) loading.style.display = 'none';
                }
            } else {
                console.log("使用者未登入");
                authService.setProfile(null);
                router.navigate('/login');
                if (loading) loading.style.display = 'none';
            }
        });
    }
}

export const app = new App();
