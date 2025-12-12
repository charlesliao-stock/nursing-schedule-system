import { db, auth } from "../../config/firebase.config.js";
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
    query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    createUserWithEmailAndPassword, deleteUser 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export const userService = {
    // 取得所有使用者
    async getAllUsers() {
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                uid: doc.id,  // ✅ 強制命名為 uid
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
            const q = query(collection(db, "users"), where("unitId", "==", unitId));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                uid: doc.id,  // ✅ 強制命名為 uid
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
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { 
                    uid: docSnap.id, // ✅ 強制命名為 uid
                    ...docSnap.data() 
                };
            }
            return null;
        } catch (error) {
            console.error("Get User Data Error:", error);
            throw error;
        }
    },

    // ✅ 新增：更新最後登入時間 (修復 App.js 報錯的問題)
    async updateLastLogin(uid) {
        try {
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, {
                lastLogin: serverTimestamp()
            });
        } catch (error) {
            // 登入時間更新失敗不應阻擋主程式，僅紀錄 Log
            console.warn("更新最後登入時間失敗:", error);
        }
    },
    
    // 建立新員工 (包含 Auth 與 Firestore)
    async createStaff(data, password) {
        try {
            // 1. 在 Authentication 建立帳號
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, password);
            const uid = userCredential.user.uid;

            // 2. 在 Firestore 建立使用者資料
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

    // 刪除使用者 (僅刪除 Firestore 資料，Auth 刪除需 Admin SDK 或雲端函式，前端無法直接刪除他人 Auth)
    async deleteStaff(uid) {
        try {
            await deleteDoc(doc(db, "users", uid));
            return { success: true };
        } catch (error) {
            console.error("Delete Staff Error:", error);
            throw error;
        }
    },
    
    // --- 輔助方法 ---
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
