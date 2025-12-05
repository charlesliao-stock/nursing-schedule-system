import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "../../config/firebase.config.js";

class FirebaseService {
    constructor() {
        this.app = null;
        this.db = null;
        this.auth = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        try {
            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            this.isInitialized = true;
            console.log("Firebase 初始化成功 ✅");
        } catch (error) {
            console.error("Firebase 初始化失敗 ❌", error);
            throw error;
        }
    }

    getDb() { if (!this.isInitialized) this.init(); return this.db; }
    getAuth() { if (!this.isInitialized) this.init(); return this.auth; }
}

export const firebaseService = new FirebaseService();