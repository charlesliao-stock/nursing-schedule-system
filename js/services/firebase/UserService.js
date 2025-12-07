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

    /**
     * 【核心功能】使用次級 App 實例建立 Auth 帳號
     * 避免將目前的管理員登出
     */
    async createAuthUser(email, password) {
        let secondaryApp = null;
        try {
            // 1. 初始化一個臨時的 Firebase App
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            
            // 2. 建立使用者
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            
            // 3. 立即登出這個臨時使用者，避免干擾主程式狀態
            await signOut(secondaryAuth);
            
            return { success: true, uid: userCredential.user.uid };
        } catch (error) {
            console.error("Auth 建立失敗:", error);
            return { success: false, error: error.code };
        } finally {
            // 4. 銷毀臨時 App
            if (secondaryApp) await deleteApp(secondaryApp);
        }
    }

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

    /**
     * 【修正】新增人員 (含 Auth 帳號建立 + 排班限制參數)
     */
    async createStaff(staffData, password) {
        try {
            // 1. 先建立 Auth 帳號
            const authResult = await this.createAuthUser(staffData.email, password);
            if (!authResult.success) {
                return { success: false, error: "帳號建立失敗: " + authResult.error };
            }
            const uid = authResult.uid;

            // 2. 準備 Firestore 資料
            const db = firebaseService.getDb();
            const newStaffRef = doc(db, this.collectionName, uid);
            
            // 權限邏輯處理
            let role = 'user';
            const permissions = { 
                canViewSchedule: true, 
                canEditSchedule: false, 
                canManageUnit: false, 
                canManageSystem: false 
            };

            if (staffData.isManager) {
                role = 'unit_manager';
                permissions.canManageUnit = true;
                permissions.canEditSchedule = true;
            } else if (staffData.isScheduler) {
                role = 'unit_scheduler';
                permissions.canEditSchedule = true;
            }

            // 3. 寫入 Firestore
            await setDoc(newStaffRef, {
                uid: uid,
                staffId: staffData.staffId || '',
                name: staffData.name,
                email: staffData.email,
                unitId: staffData.unitId,
                level: staffData.title || 'N0', 
                role: role,
                permissions: permissions,
                
                // ✨ 新增：排班限制參數 (修復語法錯誤的關鍵位置)
                constraints: staffData.constraints || { 
                    maxConsecutive: 6, 
                    canBatch: false, 
                    isPregnant: false 
                },

                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                profile: { avatar: '' }
            });

            // 4. 更新 Unit 的 managers/schedulers 陣列
            const unitRef = doc(db, 'units', staffData.unitId);
            
            if (role === 'unit_manager') {
                await updateDoc(unitRef, { 
                    managers: arrayUnion(uid),
                    schedulers: arrayUnion(uid) // 管理者預設也能排班
                });
            } else if (role === 'unit_scheduler') {
                await updateDoc(unitRef, { schedulers: arrayUnion(uid) });
            }

            return { success: true, id: uid };

        } catch (error) { 
            return { success: false, error: error.message }; 
        }
    }

    async updateStaff(staffId, updateData) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, staffId), { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

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

    async getAllStaffCount() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("role", "!=", "system_admin"));
            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) { return 0; }
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

    /**
     * 【修正】批次匯入人員 (含 Auth 建立 + 預設 constraints)
     */
    async importStaff(staffList) {
        const db = firebaseService.getDb();
        // 動態匯入 UnitService 避免循環依賴
        const units = await import('./UnitService.js').then(m => m.unitService.getAllUnits());
        const unitMap = {}; 
        units.forEach(u => { if (u.unitCode) unitMap[u.unitCode] = u.unitId; });

        const results = { success: 0, failed: 0, errors: [] };

        for (const staff of staffList) {
            if (!staff.name || !staff.email || !staff.unitCode || !staff.password) {
                results.failed++;
                results.errors.push(`資料不全 (需含密碼): ${staff.name}`);
                continue;
            }
            
            const targetUnitId = unitMap[staff.unitCode];
            if (!targetUnitId) {
                results.failed++;
                results.errors.push(`單位代號不存在: ${staff.unitCode}`);
                continue;
            }

            try {
                // 1. 建立 Auth
                const authRes = await this.createAuthUser(staff.email, staff.password);
                if (!authRes.success) throw new Error(authRes.error);

                const uid = authRes.uid;
                
                // 2. 判斷角色
                let role = 'user';
                const permissions = { canViewSchedule: true, canEditSchedule: false, canManageUnit: false };
                
                if (staff.isManager) {
                    role = 'unit_manager';
                    permissions.canManageUnit = true;
                    permissions.canEditSchedule = true;
                } else if (staff.isScheduler) {
                    role = 'unit_scheduler';
                    permissions.canEditSchedule = true;
                }

                // 3. 寫入 Firestore (加入預設 constraints)
                const newStaffRef = doc(db, this.collectionName, uid);
                await setDoc(newStaffRef, {
                    uid: uid,
                    staffId: staff.staffId || '',
                    name: staff.name,
                    email: staff.email,
                    unitId: targetUnitId,
                    level: staff.level || 'N0',
                    role: role,
                    permissions: permissions,
                    
                    // 匯入時給予預設限制
                    constraints: { 
                        maxConsecutive: 6, 
                        canBatch: false, 
                        isPregnant: false 
                    },

                    status: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    profile: { avatar: '' }
                });

                // 4. 更新 Unit 關聯
                const unitRef = doc(db, 'units', targetUnitId);
                if (staff.isManager) await updateDoc(unitRef, { managers: arrayUnion(uid), schedulers: arrayUnion(uid) });
                else if (staff.isScheduler) await updateDoc(unitRef, { schedulers: arrayUnion(uid) });

                results.success++;

            } catch (error) {
                console.error(`匯入失敗 ${staff.name}:`, error);
                results.failed++;
                results.errors.push(`${staff.name}: ${error.message}`);
            }
        }
        
        return results;
    }
}
export const userService = new UserService();
