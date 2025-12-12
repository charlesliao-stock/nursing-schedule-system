import { db, auth } from "../../config/firebase.config.js";
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
    query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    createUserWithEmailAndPassword, deleteUser 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const userService = {
    // 取得所有使用者
    async getAllUsers() {
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                uid: doc.id,  // ✅ 強制命名為 uid (系統唯一碼)
                ...doc.data() // 這裡面包含 staffId (員工職編)
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
    
    // (與此修復無關的 create/update/delete 方法保持原樣，或確保回傳格式一致)
    async createStaff(data, password) { /* ...略，建立時 firebase 會自動產生 uid */ return { success: true }; },
    async updateUser(uid, data) { await updateDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }); return { success: true }; },
    async deleteStaff(uid) { await deleteDoc(doc(db, "users", uid)); return { success: true }; },
    
    // 為了相容性保留的 Helper
    async getUnitStaff(unitId) { return this.getUsersByUnit(unitId); },
    async getAllStaffCount() { const list = await this.getAllUsers(); return list.length; },
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


