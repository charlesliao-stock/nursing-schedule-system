import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, writeBatch, arrayUnion, arrayRemove, Timestamp 
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
    //  1. Auth 與 帳號建立 (核心功能)
    // ==========================================

    /**
     * 使用次級 App 實例建立 Auth 帳號 (避免將當前管理員登出)
     */
    async createAuthUser(email, password) {
        let secondaryApp = null;
        try {
            // 使用完全獨立的 App 實例來操作 Auth，防止干擾主程式的登入狀態
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await signOut(secondaryAuth);
            return { success: true, uid: userCredential.user.uid };
        } catch (error) {
            console.error("建立 Auth 失敗:", error);
            return { success: false, error: error.code };
        } finally {
            if (secondaryApp) await deleteApp(secondaryApp);
        }
    }

    async createStaff(staffData, password) {
        try {
            // 檢查 staffId 是否重複
            if (staffData.staffId) {
                const existing = await this.getStaffByStaffId(staffData.staffId);
                if (existing) return { success: false, error: "員工編號已存在" };
            }

            const authRes = await this.createAuthUser(staffData.email, password);
            if (!authRes.success) return { success: false, error: authRes.error };
            const uid = authRes.uid;
            
            const db = firebaseService.getDb();
            let role = 'user'; // 對應 'staff'
            // 權限設定
            const permissions = { canViewSchedule: true, canEditSchedule: false, canManageUnit: false, canManageSystem: false };
            
            if (staffData.isManager) { 
                role = 'unit_manager'; 
                permissions.canManageUnit = true; 
                permissions.canEditSchedule = true; 
            } else if (staffData.isScheduler) { 
                role = 'unit_scheduler'; 
                permissions.canEditSchedule = true; 
            }

            // 寫入 Firestore
            await setDoc(doc(db, this.collectionName, uid), {
                uid, 
                staffId: staffData.staffId || '', 
                name: staffData.name, 
                email: staffData.email,
                unitId: staffData.unitId, 
                // 注意：UI 傳來的可能是 level 或 title，這裡做個兼容
                rank: staffData.title || staffData.level || 'N0', 
                role, 
                permissions,
                constraints: staffData.constraints || { maxConsecutive: 6, canBatch: false, isPregnant: false },
                status: 'active', 
                isActive: true,
                createdAt: serverTimestamp(), 
                updatedAt: serverTimestamp(), 
                profile: { avatar: '' }
            });

            // 更新 Unit 關聯 (Managers/Schedulers 陣列)
            if (staffData.unitId) {
                const unitRef = doc(db, 'units', staffData.unitId);
                if (role === 'unit_manager') await updateDoc(unitRef, { managers: arrayUnion(uid), schedulers: arrayUnion(uid) });
                else if (role === 'unit_scheduler') await updateDoc(unitRef, { schedulers: arrayUnion(uid) });
            }

            return { success: true, id: uid };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // ==========================================
    //  2. 讀取資料 (相容 UI 呼叫名稱)
    // ==========================================

    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            if (userDoc.exists()) return { uid: userDoc.id, ...userDoc.data() };
            return null;
        } catch (error) { throw error; }
    }

    /**
     * [相容性修復] StaffListPage 呼叫 getAllUsers
     */
    async getAllUsers() {
        return this.getAllStaff();
    }

    /**
     * [相容性修復] StaffListPage 呼叫 getUsersByUnit
     */
    async getUsersByUnit(unitId) {
        return this.getUnitStaff(unitId);
    }

    // 原始實作
    async getAllStaff() {
        const db = firebaseService.getDb();
        // 排除系統管理員，避免列出最高權限帳號
        const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // 原始實作
    async getUnitStaff(unitId) {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async getStaffByStaffId(staffId) {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("staffId", "==", staffId));
        const snap = await getDocs(q);
        return !snap.empty;
    }

    /**
     * [新增] 搜尋功能 (StaffListPage 需要)
     */
    async searchUsers(keyword) {
        try {
            const db = firebaseService.getDb();
            // Firestore 只能做簡單的前綴搜尋
            const q = query(
                collection(db, this.collectionName),
                where("name", ">=", keyword),
                where("name", "<=", keyword + '\uf8ff')
            );
            const snap = await getDocs(q);
            const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            
            // 如果名字搜不到，嘗試搜 Email (前端過濾可能更好，但這裡提供基本後端支援)
            if (users.length === 0) {
                 const qEmail = query(
                    collection(db, this.collectionName),
                    where("email", ">=", keyword),
                    where("email", "<=", keyword + '\uf8ff')
                );
                const snapEmail = await getDocs(qEmail);
                return snapEmail.docs.map(d => ({ uid: d.id, ...d.data() }));
            }
            return users;
        } catch (error) {
            console.error("Search failed:", error);
            return [];
        }
    }

    // ==========================================
    //  3. 更新與刪除
    // ==========================================

    /**
     * [相容性修復] StaffListPage 呼叫 updateUser
     */
    async updateUser(uid, updateData) {
        return this.updateStaff(uid, updateData);
    }

    async updateStaff(staffId, updateData) {
        const db = firebaseService.getDb();
        await updateDoc(doc(db, this.collectionName, staffId), { ...updateData, updatedAt: serverTimestamp() });
        return { success: true };
    }

    async deleteStaff(staffId) {
        const db = firebaseService.getDb();
        const staffDoc = await getDoc(doc(db, this.collectionName, staffId));
        if (staffDoc.exists() && staffDoc.data().role === 'system_admin') throw new Error("無法刪除系統管理員");
        await deleteDoc(doc(db, this.collectionName, staffId));
        return { success: true };
    }

    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch (e) {
            // Silently fail if user not found or permission denied
        }
    }

    // ==========================================
    //  4. 批次操作 (StaffListPage 需要)
    // ==========================================

    /**
     * [相容性修復] StaffListPage 呼叫 batchDeleteUsers
     */
    async batchDeleteUsers(uids) {
        return this.batchDeleteStaff(uids);
    }

    async batchDeleteStaff(staffIds) {
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        staffIds.forEach(id => {
            const ref = doc(db, this.collectionName, id);
            batch.delete(ref);
        });
        try {
            await batch.commit();
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async batchUpdateUnit(staffIds, newUnitId) {
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        staffIds.forEach(id => {
            const ref = doc(db, this.collectionName, id);
            batch.update(ref, { unitId: newUnitId, updatedAt: serverTimestamp() });
        });
        try {
            await batch.commit();
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // ==========================================
    //  5. 權限與匯入
    // ==========================================

    async toggleUnitManager(staffId, unitId, isManager) { 
        // ... (保持您原有的邏輯)
        try {
            const db = firebaseService.getDb();
            const batch = writeBatch(db);
            const staffRef = doc(db, this.collectionName, staffId);
            const unitRef = doc(db, 'units', unitId);

            if (isManager) {
                batch.update(staffRef, { role: 'unit_manager', "permissions.canManageUnit": true });
                batch.update(unitRef, { managers: arrayUnion(staffId) });
            } else {
                batch.update(staffRef, { role: 'user', "permissions.canManageUnit": false });
                batch.update(unitRef, { managers: arrayRemove(staffId) });
            }
            await batch.commit();
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async importStaff(staffList) {
        // ... (保持您原有的邏輯)
        const db = firebaseService.getDb();
        
        // Dynamic import to avoid circular dependency
        const UnitServiceClass = await import('./UnitService.js').then(m => m.UnitService);
        const units = await UnitServiceClass.getAllUnits();
        const unitMap = {}; 
        units.forEach(u => { if (u.unitCode) unitMap[u.unitCode] = u.unitId; });

        const results = { success: 0, failed: 0, errors: [] };

        for (const staff of staffList) {
            if (!staff.name || !staff.email || !staff.unitCode || !staff.password) {
                results.failed++; results.errors.push(`資料不全: ${staff.name}`); continue;
            }

            // ... (其餘 import 邏輯保持不變，因為這部分相對獨立)
             try {
                // 嘗試建立帳號
                const authRes = await this.createAuthUser(staff.email, staff.password);
                if (!authRes.success) throw new Error(authRes.error);
                
                // 取得 Unit ID
                let targetUnitId = unitMap[staff.unitCode];
                if (!targetUnitId) {
                     // 自動建立 Unit 的邏輯...
                     const createRes = await UnitServiceClass.createUnit({
                        unitCode: staff.unitCode, unitName: `${staff.unitCode}病房`
                     });
                     if (createRes.success) targetUnitId = createRes.unitId;
                }

                // 寫入 User Doc
                await setDoc(doc(db, this.collectionName, authRes.uid), {
                    uid: authRes.uid,
                    name: staff.name,
                    email: staff.email,
                    unitId: targetUnitId,
                    role: 'user', // 預設
                    createdAt: serverTimestamp(),
                    status: 'active'
                });
                
                results.success++;
            } catch (error) {
                results.failed++; results.errors.push(`${staff.name}: ${error.message}`);
            }
        }
        return results;
    }
}

export const userService = new UserService();
