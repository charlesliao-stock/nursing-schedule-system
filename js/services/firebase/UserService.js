import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, writeBatch, arrayUnion, arrayRemove,
    getCountFromServer 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";
import { firebaseConfig } from "../../config/firebase.config.js"; 

class UserService {
    constructor() { 
        this.collectionName = 'users'; 
    }

    // ==========================================
    //  1. Auth 與 帳號建立
    // ==========================================

    async createAuthUser(email, password) {
        let secondaryApp = null;
        try {
            // 使用 Secondary App 避免將當前管理員登出
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await signOut(secondaryAuth);
            return { success: true, uid: userCredential.user.uid };
        } catch (error) {
            console.error("建立 Auth 失敗:", error);
            return { success: false, error: error.message };
        } finally {
            if (secondaryApp) deleteApp(secondaryApp);
        }
    }

    async createStaff(staffData, password) {
        try {
            const authRes = await this.createAuthUser(staffData.email, password);
            if (!authRes.success) return authRes;

            const db = firebaseService.getDb();
            const newUid = authRes.uid;

            // 寫入 Firestore
            await setDoc(doc(db, this.collectionName, newUid), {
                uid: newUid,
                name: staffData.name,
                email: staffData.email,
                unitId: staffData.unitId,
                staffId: staffData.staffId,
                rank: staffData.title || staffData.rank || 'N0', // 相容不同命名
                group: staffData.group || '',
                role: staffData.role || 'user',
                constraints: staffData.constraints || {}, // 排班限制參數
                permissions: staffData.permissions || {},
                status: 'active',
                createdAt: serverTimestamp()
            });

            return { success: true, uid: newUid };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    //  2. 資料讀取 (Fix: 確保所有查詢方法存在)
    // ==========================================

    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.collectionName, uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) {
            console.error("Get User Error:", error);
            return null;
        }
    }

    // ✅ 新增：取得所有使用者 (系統管理員用)
    async getAllUsers() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName)); // 可以加 limit
            const querySnapshot = await getDocs(q);
            const users = [];
            querySnapshot.forEach((doc) => users.push(doc.data()));
            return users;
        } catch (error) {
            console.error("Get All Users Error:", error);
            return [];
        }
    }

    // ✅ 新增：取得特定單位的使用者
    async getUsersByUnit(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
            const querySnapshot = await getDocs(q);
            const users = [];
            querySnapshot.forEach((doc) => users.push(doc.data()));
            return users;
        } catch (error) {
            console.error("Get Unit Users Error:", error);
            return [];
        }
    }

    // 相容舊方法名 (有些地方可能呼叫 getUnitStaff)
    async getUnitStaff(unitId) {
        return this.getUsersByUnit(unitId);
    }

    // ✅ 新增：搜尋使用者
    async searchUsers(keyword) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName));
            const snapshot = await getDocs(q);
            const users = [];
            const k = keyword.toLowerCase();
            
            snapshot.forEach(doc => {
                const u = doc.data();
                if ((u.name && u.name.toLowerCase().includes(k)) || 
                    (u.staffId && u.staffId.includes(k)) ||
                    (u.email && u.email.toLowerCase().includes(k))) {
                    users.push(u);
                }
            });
            return users;
        } catch (error) {
            console.error("Search Error:", error);
            return [];
        }
    }

    // ==========================================
    //  3. 更新與刪除
    // ==========================================

    async updateUser(uid, data) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.collectionName, uid);
            await updateDoc(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteStaff(uid) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.collectionName, uid));
            // 注意：Firebase Auth User 無法直接從 Client SDK 刪除 (需 Admin SDK)
            // 這裡只刪除 Firestore 資料，實際專案通常會標記 status: 'deleted'
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), {
                lastLoginAt: serverTimestamp()
            });
        } catch(e) { console.warn("Update login time failed", e); }
    }
}

export const userService = new UserService();
