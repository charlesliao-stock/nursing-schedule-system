import { getDoc, setDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { User } from "../../models/User.js";

class UserService {
    constructor() { this.collectionName = 'users'; }

    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            if (userDoc.exists()) {
                return new User({ uid: userDoc.id, ...userDoc.data() });
            }
            return null;
        } catch (error) {
            console.error("讀取使用者資料失敗:", error);
            throw error;
        }
    }

    async setUserData(uid, userData) {
        try {
            const db = firebaseService.getDb();
            const dataToSave = { ...userData, updatedAt: serverTimestamp() };
            await setDoc(doc(db, this.collectionName, uid), dataToSave, { merge: true });
            return true;
        } catch (error) {
            console.error("寫入使用者資料失敗:", error);
            throw error;
        }
    }

    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch (e) { console.error("更新時間失敗", e); }
    }
}

export const userService = new UserService();