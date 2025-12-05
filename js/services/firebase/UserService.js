import { getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { User } from "../../models/User.js";

class UserService {
    constructor() {
        this.collectionName = 'users';
    }

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

    // 【新增】更新員工資料
    async updateStaff(staffId, updateData) {
        try {
            const db = firebaseService.getDb();
            const staffRef = doc(db, this.collectionName, staffId);
            await updateDoc(staffRef, { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) {
            console.error("更新員工失敗:", error);
            return { success: false, error: error.message };
        }
    }

    // 【新增】刪除員工資料
    async deleteStaff(staffId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.collectionName, staffId));
            return { success: true };
        } catch (error) {
            console.error("刪除員工失敗:", error);
            return { success: false, error: error.message };
        }
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
}

export const userService = new UserService();
