import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, writeBatch, arrayUnion, arrayRemove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { User } from "../../models/User.js";

class UserService {
    constructor() { this.collectionName = 'users'; }

    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            if (userDoc.exists()) return new User({ uid: userDoc.id, ...userDoc.data() });
            return null;
        } catch (error) { throw error; }
    }

    async setUserData(uid, userData) {
        try {
            const db = firebaseService.getDb();
            await setDoc(doc(db, this.collectionName, uid), { ...userData, updatedAt: serverTimestamp() }, { merge: true });
            return true;
        } catch (error) { throw error; }
    }

    async createStaff(staffData) {
        try {
            const db = firebaseService.getDb();
            const newStaffRef = doc(collection(db, this.collectionName));
            await setDoc(newStaffRef, {
                ...staffData, uid: newStaffRef.id, role: 'user', status: 'active',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                permissions: { canViewSchedule: true, canEditSchedule: false, canManageUnit: false, canManageSystem: false },
                profile: { avatar: '' }
            });
            return { success: true, id: newStaffRef.id };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async updateStaff(staffId, updateData) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, staffId), { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 【修正】加入防呆機制，禁止刪除系統管理員
    async deleteStaff(staffId) {
        try {
            const db = firebaseService.getDb();
            const staffDoc = await getDoc(doc(db, this.collectionName, staffId));
            
            if (staffDoc.exists()) {
                const staffData = staffDoc.data();
                if (staffData.role === 'system_admin') {
                    throw new Error("安全警告：無法刪除系統管理者帳號！");
                }
            }

            await deleteDoc(doc(db, this.collectionName, staffId));
            return { success: true };
        } catch (error) {
            console.error("刪除員工失敗:", error);
            return { success: false, error: error.message };
        }
    }

    async getUnitStaff(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
            const querySnapshot = await getDocs(q);
            const staff = [];
            querySnapshot.forEach((doc) => staff.push({ id: doc.id, ...doc.data() }));
            return staff;
        } catch (error) { return []; }
    }

    async getAllStaff() {
        try {
            const db = firebaseService.getDb();
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

    // 【修正】計算邏輯：只要不是 system_admin 都算入人員總數
    async getAllStaffCount() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) { 
            console.error("計數失敗:", error);
            return 0; 
        }
    }

    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch (e) {}
    }

    async toggleUnitManager(staffId, unitId, isManager) {
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

    // 【新增】切換排班者權限
    async toggleUnitScheduler(staffId, unitId, isScheduler) {
        try {
            const db = firebaseService.getDb();
            const batch = writeBatch(db);
            const staffRef = doc(db, this.collectionName, staffId);
            const unitRef = doc(db, 'units', unitId);

            if (isScheduler) {
                // 若已經是 manager，保持 manager 角色，但開啟排班權限
                // 若是 user，則升級為 unit_scheduler
                // 這裡簡化邏輯：我們主要透過 permissions 來判斷功能
                batch.update(staffRef, { "permissions.canEditSchedule": true });
                batch.update(unitRef, { schedulers: arrayUnion(staffId) });
            } else {
                batch.update(staffRef, { "permissions.canEditSchedule": false });
                batch.update(unitRef, { schedulers: arrayRemove(staffId) });
            }
            await batch.commit();
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 【新增】從單位介面批次更新人員角色 (用於 UnitListPage)
    async batchUpdateRoles(unitId, managerIds, schedulerIds) {
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        const unitRef = doc(db, 'units', unitId);
        
        // 1. 更新 Unit 的名單
        batch.update(unitRef, { 
            managers: managerIds,
            schedulers: schedulerIds
        });

        // 2. 取得該單位所有人員
        const staffList = await this.getUnitStaff(unitId);
        
        // 3. 逐一更新人員權限
        staffList.forEach(staff => {
            const staffRef = doc(db, this.collectionName, staff.id);
            const isManager = managerIds.includes(staff.id);
            const isScheduler = schedulerIds.includes(staff.id);
            
            let newRole = 'user';
            if (isManager) newRole = 'unit_manager';
            else if (isScheduler) newRole = 'unit_scheduler';

            const updates = {
                role: newRole,
                "permissions.canManageUnit": isManager,
                "permissions.canEditSchedule": isScheduler || isManager // 管理者通常也能排班
            };
            
            batch.update(staffRef, updates);
        });

        try {
            await batch.commit();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async importStaff(staffList) { /* ...保持原樣... */
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        const results = { success: 0, failed: 0, errors: [] };
        const units = await import('./UnitService.js').then(m => m.unitService.getAllUnits());
        const unitMap = {}; 
        units.forEach(u => { if (u.unitCode) unitMap[u.unitCode] = u.unitId; });

        for (const staff of staffList) {
            if (!staff.name || !staff.email || !staff.unitCode) {
                results.failed++; results.errors.push(`資料不全: ${staff.name}`); continue;
            }
            const targetUnitId = unitMap[staff.unitCode];
            if (!targetUnitId) {
                results.failed++; results.errors.push(`單位不存在: ${staff.unitCode}`); continue;
            }
            const newStaffRef = doc(collection(db, this.collectionName));
            batch.set(newStaffRef, {
                uid: newStaffRef.id, staffId: staff.staffId || '', name: staff.name, email: staff.email,
                unitId: targetUnitId, level: staff.level || 'N0', role: 'user', status: 'active',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                permissions: { canViewSchedule: true, canEditSchedule: false, canManageUnit: false },
                profile: { avatar: '' }
            });
            results.success++;
        }
        try { await batch.commit(); return results; } 
        catch (error) { return { success: 0, failed: staffList.length, errors: [error.message] }; }
    }
}
export const userService = new UserService();
