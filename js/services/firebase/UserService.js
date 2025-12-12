// ✅ 改為引入 firebaseService，而不是直接引入 db
import { firebaseService } from "./FirebaseService.js";
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
    query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 輔助函式：確保 DB 已初始化
const getDb = () => firebaseService.getDb();
const getAuth = () => firebaseService.getAuth();

export const userService = {
    // 取得所有使用者
    async getAllUsers() {
        try {
            const db = getDb(); // ✅ 延遲取得 DB
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Get All Users Error:", error);
            throw error;
        }
    },

    // 取得特定單位的人員
    async getUsersByUnit(unitId) {
        try {
            const db = getDb();
            const q = query(collection(db, "users"), where("unitId", "==", unitId));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Get Users By Unit Error:", error);
            throw error;
        }
    },

    // 取得單一使用者資料
    async getUserData(uid) {
        try {
            const db = getDb(); // ✅ 這裡原本報錯，現在會確保拿到有效的 db
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { 
                    uid: docSnap.id,
                    ...docSnap.data() 
                };
            }
            return null;
        } catch (error) {
            console.error("Get User Data Error:", error);
            throw error;
        }
    },

    // 更新最後登入時間
    async updateLastLogin(uid) {
        try {
            const db = getDb();
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, {
                lastLogin: serverTimestamp()
            });
        } catch (error) {
            console.warn("更新最後登入時間失敗:", error);
        }
    },
    
    // 建立新員工
    async createStaff(data, password) {
        try {
            const db = getDb();
            const auth = getAuth();
            
            // 1. Auth 建立帳號
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, password);
            const uid = userCredential.user.uid;

            // 2. Firestore 建立資料
            await setDoc(doc(db, "users", uid), {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            return { success: true, uid: uid };
        } catch (error) {
            console.error("Create Staff Error:", error);
            return { success: false, error: error.message };
        }
    },

    // 更新使用者資料
    async updateUser(uid, data) {
        try {
            const db = getDb();
            await updateDoc(doc(db, "users", uid), {
                ...data,
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error("Update User Error:", error);
            throw error;
        }
    },

    // 刪除使用者
    async deleteStaff(uid) {
        try {
            const db = getDb();
            await deleteDoc(doc(db, "users", uid));
            return { success: true };
        } catch (error) {
            console.error("Delete Staff Error:", error);
            throw error;
        }
    },
    
    async getUnitStaff(unitId) { return this.getUsersByUnit(unitId); },
    
    async getAllStaffCount() { 
        const list = await this.getAllUsers(); 
        return list.length; 
    },
    
    async searchUsers(keyword) {
        const list = await this.getAllUsers();
        if (!keyword) return [];
        const k = keyword.toLowerCase();
        return list.filter(u => 
            (u.name && u.name.toLowerCase().includes(k)) || 
            (u.staffId && u.staffId.toLowerCase().includes(k))
        );
    }
};
