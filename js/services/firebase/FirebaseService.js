// ✅ 1. 確保引用路徑與檔名完全正確 (使用 firebase.config.js)
// ✅ 2. 只匯入 db 和 auth，不再匯入不存在的 firebaseConfig
import { db, auth } from "../../config/firebase.config.js";

class FirebaseService {
    constructor() {
        // 直接使用從設定檔匯入的實體
        // 這樣可以確保整個應用程式都使用同一個連線，避免重複初始化錯誤
        this.db = db;
        this.auth = auth;
        this.isInitialized = true;
        console.log("FirebaseService 已載入 (使用共用實體) ✅");
    }

    /**
     * 初始化 Firebase
     * 注意：因為 firebase.config.js 已經完成了初始化，
     * 這裡的方法是為了保持程式碼相容性，實際上不做任何事。
     */
    init() {
        if (!this.isInitialized) {
            console.warn("Firebase 應該已經在設定檔中初始化完成");
        }
        return;
    }

    /**
     * 取得 Firestore 資料庫實體
     */
    getDb() {
        if (!this.db) {
            console.error("Firebase DB 尚未初始化");
            return db; // 嘗試回傳匯入的物件
        }
        return this.db;
    }

    /**
     * 取得 Auth 驗證實體
     */
    getAuth() {
        if (!this.auth) {
            console.error("Firebase Auth 尚未初始化");
            return auth; // 嘗試回傳匯入的物件
        }
        return this.auth;
    }
}

// 匯出單例模式 (Singleton)
export const firebaseService = new FirebaseService();
