import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, writeBatch, arrayUnion, arrayRemove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";
import { firebaseConfig } from "../../config/firebase.config.js"; 
import { User } from "../../models/User.js";

class UserService {
    constructor() { this.collectionName = 'users'; }

    // --- 1. Auth 輔助 ---

    /**
     * 使用次級 App 實例建立 Auth 帳號 (避免將管理員登出)
     */
    async createAuthUser(email, password) {
        let secondaryApp = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await signOut(secondaryAuth);
            return { success: true, uid: userCredential.user.uid };
        } catch (error) {
            return { success: false, error: error.code };
        } finally {
            if (secondaryApp) await deleteApp(secondaryApp);
        }
    }

    // --- 2. 基本 CRUD ---

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
            let role = 'user';
            const permissions = { canViewSchedule: true, canEditSchedule: false, canManageUnit: false, canManageSystem: false };
            
            if (staffData.isManager) { 
                role = 'unit_manager'; 
                permissions.canManageUnit = true; 
                permissions.canEditSchedule = true; 
            } else if (staffData.isScheduler) { 
                role = 'unit_scheduler'; 
                permissions.canEditSchedule = true; 
            }

            await setDoc(doc(db, this.collectionName, uid), {
                uid, 
                staffId: staffData.staffId || '', 
                name: staffData.name, 
                email: staffData.email,
                unitId: staffData.unitId, 
                level: staffData.title || 'N0', 
                role, 
                permissions,
                constraints: staffData.constraints || { maxConsecutive: 6, canBatch: false, isPregnant: false },
                status: 'active', 
                createdAt: serverTimestamp(), 
                updatedAt: serverTimestamp(), 
                profile: { avatar: '' }
            });

            // Update Unit relations
            const unitRef = doc(db, 'units', staffData.unitId);
            if (role === 'unit_manager') await updateDoc(unitRef, { managers: arrayUnion(uid), schedulers: arrayUnion(uid) });
            else if (role === 'unit_scheduler') await updateDoc(unitRef, { schedulers: arrayUnion(uid) });

            return { success: true, id: uid };
        } catch (error) { return { success: false, error: error.message }; }
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

    // --- 3. 查詢與統計 (補回遺失的方法) ---

    async getStaffByStaffId(staffId) {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("staffId", "==", staffId));
        const snap = await getDocs(q);
        return !snap.empty;
    }

    async getUnitStaff(unitId) {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async getAllStaff() {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * 【補回】取得總人數 (用於 Dashboard)
     */
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

    /**
     * 【補回】更新最後登入時間 (用於 App.js)
     */
    async updateLastLogin(uid) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch (e) {
            console.warn("更新登入時間失敗 (可能是權限或 ID 問題):", e);
        }
    }

    // --- 4. 權限操作 ---

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

    async toggleUnitScheduler(staffId, unitId, isScheduler) { 
        try {
            const db = firebaseService.getDb();
            const batch = writeBatch(db);
            const staffRef = doc(db, this.collectionName, staffId);
            const unitRef = doc(db, 'units', unitId);

            if (isScheduler) {
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

    // --- 5. 批次操作 ---

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

    // --- 6. 匯入功能 ---

    async importStaff(staffList) {
        const db = firebaseService.getDb();
        
        // 動態匯入 UnitService (避免循環依賴)
        const UnitServiceClass = await import('./UnitService.js').then(m => m.UnitService);
        const units = await UnitServiceClass.getAllUnits();
        const unitMap = {}; 
        units.forEach(u => { if (u.unitCode) unitMap[u.unitCode] = u.unitId; });

        const results = { success: 0, failed: 0, errors: [] };

        for (const staff of staffList) {
            if (!staff.name || !staff.email || !staff.unitCode || !staff.password) {
                results.failed++; results.errors.push(`資料不全: ${staff.name}`); continue;
            }

            if (staff.staffId) {
                const isExist = await this.getStaffByStaffId(staff.staffId);
                if (isExist) {
                    results.failed++; results.errors.push(`員工編號重複: ${staff.staffId}`); continue;
                }
            }
            
            let targetUnitId = unitMap[staff.unitCode];
            
            if (!targetUnitId) {
                try {
                    const newUnitName = `${staff.unitCode}病房`;
                    const createRes = await UnitServiceClass.createUnit({
                        unitCode: staff.unitCode, unitName: newUnitName, description: '系統自動建立'
                    });
                    if (createRes.success) {
                        targetUnitId = createRes.unitId;
                        unitMap[staff.unitCode] = targetUnitId; 
                    } else throw new Error(createRes.error);
                } catch (err) {
                    results.failed++; results.errors.push(`${staff.name}: ${err.message}`); continue;
                }
            }

            try {
                const authRes = await this.createAuthUser(staff.email, staff.password);
                if (!authRes.success) throw new Error(authRes.error);
                const uid = authRes.uid;
                
                let role = 'user';
                const permissions = { canViewSchedule: true, canEditSchedule: false, canManageUnit: false };
                if (staff.isManager) { role = 'unit_manager'; permissions.canManageUnit = true; permissions.canEditSchedule = true; } 
                else if (staff.isScheduler) { role = 'unit_scheduler'; permissions.canEditSchedule = true; }

                const newStaffRef = doc(db, this.collectionName, uid);
                await setDoc(newStaffRef, {
                    uid, staffId: staff.staffId || '', name: staff.name, email: staff.email,
                    unitId: targetUnitId, level: staff.level || 'N0', role, permissions,
                    constraints: { maxConsecutive: 6, canBatch: false, isPregnant: false },
                    status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), profile: { avatar: '' }
                });

                const unitRef = doc(db, 'units', targetUnitId);
                if (staff.isManager) await updateDoc(unitRef, { managers: arrayUnion(uid), schedulers: arrayUnion(uid) });
                else if (staff.isScheduler) await updateDoc(unitRef, { schedulers: arrayUnion(uid) });

                results.success++;
            } catch (error) {
                console.error(`匯入失敗 ${staff.name}:`, error);
                results.failed++; results.errors.push(`${staff.name}: ${error.message}`);
            }
        }
        return results;
    }
}
export const userService = new UserService();
