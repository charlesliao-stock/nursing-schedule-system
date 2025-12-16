import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";

class AuthService {
    constructor() { 
        this.currentUser = null;        // Firebase Auth User
        this.currentUserProfile = null; // 真實身分的 Firestore Profile
        this.impersonatedProfile = null; // 模擬的身分 Profile
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
            this.currentUserProfile = null;
            this.impersonatedProfile = null; // 清除模擬狀態
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
                this.currentUserProfile = null;
                this.impersonatedProfile = null;
            }
            callback(user);
        });
    }

    getCurrentUser() { return this.currentUser; }

    /**
     * 設定真實使用者的 Profile
     */
    setProfile(profile) {
        this.currentUserProfile = profile;
    }

    /**
     * [關鍵] 取得當前身分 (支援模擬)
     * 若有模擬身分，回傳模擬物件，並標記 isImpersonating
     */
    getProfile() {
        if (this.impersonatedProfile) {
            return {
                ...this.impersonatedProfile,
                isImpersonating: true,
                originalRole: this.currentUserProfile?.role // 保留原始權限
            };
        }
        return this.currentUserProfile;
    }

    /**
     * [新功能] 開始模擬
     * @param {Object} targetProfile 目標使用者的 Profile
     */
    impersonate(targetProfile) {
        this.impersonatedProfile = targetProfile;
        // 強制重新整理頁面以套用新身分
        window.location.reload();
    }

    /**
     * [新功能] 停止模擬
     */
    stopImpersonation() {
        this.impersonatedProfile = null;
        window.location.reload();
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
