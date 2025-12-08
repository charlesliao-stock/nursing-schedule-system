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

            if (staffData.unitId) {
                const unitRef = doc(db, 'units', staffData.unitId);
                if (role === 'unit_manager') await updateDoc(unitRef, { managers: arrayUnion(uid), schedulers: arrayUnion(uid) });
                else if (role === 'unit_scheduler') await updateDoc(unitRef, { schedulers: arrayUnion(uid) });
            }

            return { success: true, id: uid };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // ==========================================
    //  2. 讀取資料
    // ==========================================

    async getUserData(uid) {
        try {
            const db = firebaseService.getDb();
            const userDoc = await getDoc(doc(db, this.collectionName, uid));
            if (userDoc.exists()) return { uid: userDoc.id, ...userDoc.data() };
            return null;
        } catch (error) { throw error; }
    }

    // UI 相容性方法
    async getAllUsers() { return this.getAllStaff(); }
    async getUsersByUnit(unitId) { return this.getUnitStaff(unitId); }

    // 原始實作
    async getAllStaff() {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

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

    // ✅ 新增：修復 Dashboard 錯誤的方法
    async getAllStaffCount() {
        try {
            const db = firebaseService.getDb();
            // 計算所有非系統管理員的人數
            const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
            
            // 使用 getCountFromServer 更高效 (如果 SDK 版本支援)，否則用 getDocs.size
            // 為了最大相容性，這裡先用 getDocs (若您的 Firestore 資料量很大，建議改用 getCountFromServer)
            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) {
            console.error("取得總人數失敗:", error);
            return 0;
        }
    }

    async searchUsers(keyword) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, this.collectionName),
                where("name", ">=", keyword),
                where("name", "<=", keyword + '\uf8ff')
            );
            const snap = await getDocs(q);
            const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            
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

    async updateUser(uid, updateData) { return this.updateStaff(uid, updateData); }

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
        } catch (e) {}
    }

    // ==========================================
    //  4. 批次操作
    // ==========================================

    async batchDeleteUsers(uids) { return this.batchDeleteStaff(uids); }

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
        const db = firebaseService.getDb();
        
        // Dynamic import
        const UnitServiceClass = await import('./UnitService.js').then(m => m.UnitService);
        const units = await UnitServiceClass.getAllUnits();
        const unitMap = {}; 
        units.forEach(u => { if (u.unitCode) unitMap[u.unitCode] = u.unitId; });

        const results = { success: 0, failed: 0, errors: [] };

        for (const staff of staffList) {
            if (!staff.name || !staff.email || !staff.unitCode || !staff.password) {
                results.failed++; results.errors.push(`資料不全: ${staff.name}`); continue;
            }

             try {
                const authRes = await this.createAuthUser(staff.email, staff.password);
                if (!authRes.success) throw new Error(authRes.error);
                
                let targetUnitId = unitMap[staff.unitCode];
                if (!targetUnitId) {
                     const createRes = await UnitServiceClass.createUnit({
                        unitCode: staff.unitCode, unitName: `${staff.unitCode}病房`
                     });
                     if (createRes.success) targetUnitId = createRes.unitId;
                }

                await setDoc(doc(db, this.collectionName, authRes.uid), {
                    uid: authRes.uid,
                    name: staff.name,
                    email: staff.email,
                    unitId: targetUnitId,
                    role: 'user', 
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
