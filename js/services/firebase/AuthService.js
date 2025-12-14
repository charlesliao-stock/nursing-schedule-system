import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";

class AuthService {
    constructor() { 
        this.currentUser = null;       // Firebase Auth 的基本 User 物件
        this.currentUserProfile = null; // ✨ 新增：Firestore 的完整 User Profile (含 role)
    }

    async login(email, password) {
        try {
            const auth = firebaseService.getAuth();
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            this.currentUser = userCredential.user;
            return { success: true, user: this.currentUser };
        } catch (error) {
            return { success: false, error: this._formatError(error.code) };
        }
    }

    async logout() {
        try {
            const auth = firebaseService.getAuth();
            await signOut(auth);
            this.currentUser = null;
            this.currentUserProfile = null; // ✨ 登出時記得清空 Profile
            return true;
        } catch (error) {
            console.error("登出失敗:", error);
            return false;
        }
    }

    monitorAuthState(callback) {
        const auth = firebaseService.getAuth();
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            if (!user) {
                this.currentUserProfile = null; // 確保未登入時清空
            }
            callback(user);
        });
    }

    getCurrentUser() { return this.currentUser; }

    /**
     * ✨ 新增：設定完整的使用者 Profile (由 App.js 呼叫)
     * 用來快取 Firestore 的資料，避免重複查詢
     */
    setProfile(profile) {
        this.currentUserProfile = profile;
    }

    /**
     * ✨ 新增：取得完整的使用者 Profile (由 UI 元件呼叫)
     * 直接回傳記憶體中的資料，不經過資料庫
     */
    getProfile() {
        return this.currentUserProfile;
    }

    _formatError(code) {
        switch(code) {
            case 'auth/invalid-email': return 'Email 格式不正確';
            case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': return '帳號或密碼錯誤';
            case 'auth/too-many-requests': return '登入嘗試過多，請稍後再試';
            default: return '登入發生錯誤';
        }
    }
}

export const authService = new AuthService();
