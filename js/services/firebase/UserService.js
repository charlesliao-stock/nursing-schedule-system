import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, writeBatch, arrayUnion, arrayRemove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { User } from "../../models/User.js";
import { unitService } from "./UnitService.js"; // 引入 UnitService 以處理管理者關聯

class UserService {
    constructor() { this.collectionName = 'users'; }

    async getUserData(uid) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            if (userDoc.exists()) return new User({ uid: userDoc.id, ...userDoc.data() });
            return null;
        } catch (error) { throw error; }
    }

    async setUserData(uid, userData) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            await setDoc(doc(db, this.collectionName, uid), { ...userData, updatedAt: serverTimestamp() }, { merge: true });
            return true;
        } catch (error) { throw error; }
    }

    async createStaff(staffData) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const newStaffRef = doc(collection(db, this.collectionName));
            await setDoc(newStaffRef, {
                ...staffData, uid: newStaffRef.id, role: 'user', status: 'active',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                permissions: { canViewSchedule: true, canEditSchedule: false, canManageUnit: false }
            });
            return { success: true, id: newStaffRef.id };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async updateStaff(staffId, updateData) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, staffId), { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async deleteStaff(staffId) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.collectionName, staffId));
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async getUnitStaff(unitId) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
            const querySnapshot = await getDocs(q);
            const staff = [];
            querySnapshot.forEach((doc) => staff.push({ id: doc.id, ...doc.data() }));
            return staff;
        } catch (error) { return []; }
    }

    // 【新增】取得所有員工 (解決全部單位顯示空白問題)
    async getAllStaff() {
        try {
            const db = firebaseService.getDb();
            // 注意：資料量大時應分頁，此處為 Phase 2 簡化版
            const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
            const querySnapshot = await getDocs(q);
            const staff = [];
            querySnapshot.forEach((doc) => staff.push({ id: doc.id, ...doc.data() }));
            return staff;
        } catch (error) {
            console.error("讀取所有員工失敗:", error);
            return [];
        }
    }

    async getAllStaffCount() { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("role", "==", "user"));
            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) { return 0; }
    }

    async updateLastLogin(uid) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch (e) {}
    }

    // 【新增】切換單位管理者身份
    async toggleUnitManager(staffId, unitId, isManager) {
        try {
            const db = firebaseService.getDb();
            const batch = writeBatch(db);
            const staffRef = doc(db, this.collectionName, staffId);
            const unitRef = doc(db, 'units', unitId);

            if (isManager) {
                // 設為管理者: 更新 User role, 更新 Unit managers array
                batch.update(staffRef, { 
                    role: 'unit_manager',
                    "permissions.canManageUnit": true
                });
                batch.update(unitRef, { managers: arrayUnion(staffId) });
            } else {
                // 取消管理者: 回復 User role, 移除 Unit managers array
                batch.update(staffRef, { 
                    role: 'user',
                    "permissions.canManageUnit": false
                });
                batch.update(unitRef, { managers: arrayRemove(staffId) });
            }

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error("切換管理者失敗:", error);
            return { success: false, error: error.message };
        }
    }

    // 【新增】批次匯入員工
    async importStaff(staffList) {
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        const results = { success: 0, failed: 0, errors: [] };

        // 預先快取單位代號對照表 (UnitCode -> UnitId)
        const units = await unitService.getAllUnits();
        const unitMap = {}; // { "9B": "unit_id_123" }
        units.forEach(u => {
            if (u.unitCode) unitMap[u.unitCode] = u.unitId;
        });

        for (const staff of staffList) {
            // 必填檢查
            if (!staff.name || !staff.email || !staff.unitCode) {
                results.failed++;
                results.errors.push(`資料不全: ${staff.name || '未知'}`);
                continue;
            }

            // 單位檢查
            const targetUnitId = unitMap[staff.unitCode];
            if (!targetUnitId) {
                results.failed++;
                results.errors.push(`單位代號不存在: ${staff.unitCode} (${staff.name})`);
                continue;
            }

            const newStaffRef = doc(collection(db, this.collectionName));
            batch.set(newStaffRef, {
                uid: newStaffRef.id,
                staffId: staff.staffId || '',
                name: staff.name,
                email: staff.email,
                unitId: targetUnitId,
                level: staff.level || 'N0',
                role: 'user',
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                permissions: { canViewSchedule: true, canEditSchedule: false, canManageUnit: false },
                profile: { avatar: '' }
            });
            results.success++;
        }

        try {
            await batch.commit();
            return results;
        } catch (error) {
            return { success: 0, failed: staffList.length, errors: [error.message] };
        }
    }
}

export const userService = new UserService();
