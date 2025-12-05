import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";

class AuthService {
    constructor() { this.currentUser = null; }

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
            callback(user);
        });
    }

    getCurrentUser() { return this.currentUser; }

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