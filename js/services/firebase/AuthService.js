// js/services/firebase/AuthService.js
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";

class AuthService {
    constructor() {
        this.auth = null;
        // ✨ 新增：用來暫存「完整的」使用者資料 (含 role)
        this.currentUserProfile = null;
    }

    // ... (init, login, logout 維持不變) ...

    // ✨ 新增：設定 Profile (由 App.js 呼叫)
    setProfile(profile) {
        this.currentUserProfile = profile;
    }

    // ✨ 新增：取得 Profile (由 MainLayout 呼叫，直接拿記憶體資料，不查 DB)
    getProfile() {
        return this.currentUserProfile;
    }

    // ... (其他方法維持不變) ...
}

export const authService = new AuthService();
