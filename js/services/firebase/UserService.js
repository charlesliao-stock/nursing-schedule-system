import { 
    getDoc, 
    setDoc, 
    doc, 
    updateDoc, 
    serverTimestamp,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { User } from "../../models/User.js";

class UserService {
    constructor() {
        this.collectionName = 'users';
    }

    /**
     * 取得使用者資料
     * @param {string} uid 
     * @returns {Promise<User|null>}
     */
    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            
            if (userDoc.exists()) {
                return new User({ 
                    uid: userDoc.id, 
                    ...userDoc.data() 
                });
            }
            return null;
        } catch (error) {
            console.error("讀取使用者資料失敗:", error);
            throw error;
        }
    }

    /**
     * 建立或覆寫使用者資料 (通常用於 Auth 註冊後的初始化)
     * @param {string} uid 
     * @param {Object} userData 
     */
    async setUserData(uid, userData) {
        try {
            const db = firebaseService.getDb();
            const dataToSave = {
                ...userData,
                updatedAt: serverTimestamp()
            };
            
            await setDoc(doc(db, this.collectionName, uid), dataToSave, { merge: true });
            return true;
        } catch (error) {
            console.error("寫入使用者資料失敗:", error);
            throw error;
        }
    }

    /**
     * 建立一般員工資料 (不涉及 Auth 帳號，僅建立資料庫檔案)
     * @param {Object} staffData 包含 staffId, name, email, unitId, level
     */
    async createStaff(staffData) {
        try {
            const db = firebaseService.getDb();
            // 自動生成文件 ID
            const newStaffRef = doc(collection(db, this.collectionName));
            
            const dataToSave = {
                ...staffData,
                uid: newStaffRef.id, // 暫存 ID，等員工註冊後可透過 email 或 staffId 關聯
                role: 'user',        // 預設為一般使用者
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                permissions: {       // 預設權限
                    canViewSchedule: true,
                    canEditSchedule: false,
                    canManageUnit: false,
                    canManageSystem: false
                },
                profile: {
                    avatar: ''
                }
            };

            await setDoc(newStaffRef, dataToSave);
            return { success: true, id: newStaffRef.id };
        } catch (error) {
            console.error("建立員工失敗:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 取得特定單位的員工列表
     * @param {string} unitId 
     */
    async getUnitStaff(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, this.collectionName), 
                where("unitId", "==", unitId)
            );
            
            const querySnapshot = await getDocs(q);
            const staff = [];
            querySnapshot.forEach((doc) => {
                staff.push({ id: doc.id, ...doc.data() });
            });
            return staff;
        } catch (error) {
            console.error("讀取單位員工失敗:", error);
            return [];
        }
    }

    /**
     * 取得所有員工數 (僅計算非 admin) - 用於儀表板統計
     */
    async getAllStaffCount() {
        try {
            const db = firebaseService.getDb();
            // 簡單計算所有 user 角色
            const q = query(collection(db, this.collectionName), where("role", "==", "user"));
            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) {
            console.error("計算員工數失敗:", error);
            return 0;
        }
    }

    /**
     * 更新最後登入時間
     */
    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            const userRef = doc(db, this.collectionName, uid);
            await updateDoc(userRef, {
                lastLoginAt: serverTimestamp()
            });
        } catch (error) {
            console.error("更新登入時間失敗 (非致命錯誤):", error);
        }
    }
}

export const userService = new UserService();
