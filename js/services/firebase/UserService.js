import { 
    getDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, 
    collection, query, where, getDocs, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseService } from "./FirebaseService.js";
import { firebaseConfig } from "../../config/firebase.config.js"; 

class UserService {
    constructor() { 
        this.collectionName = 'users'; 
    }

    // Auth & Create
    async createAuthUser(email, password) {
        let secondaryApp = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await signOut(secondaryAuth);
            return { success: true, uid: userCredential.user.uid };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            if (secondaryApp) deleteApp(secondaryApp);
        }
    }

    async createStaff(staffData, password) {
        try {
            const authRes = await this.createAuthUser(staffData.email, password);
            if (!authRes.success) return authRes;
            const db = firebaseService.getDb();
            const newUid = authRes.uid;
            await setDoc(doc(db, this.collectionName, newUid), {
                uid: newUid,
                name: staffData.name,
                email: staffData.email,
                unitId: staffData.unitId,
                staffId: staffData.staffId,
                rank: staffData.title || staffData.rank || 'N0',
                group: staffData.group || '',
                role: staffData.role || 'user',
                constraints: staffData.constraints || {}, 
                permissions: staffData.permissions || {},
                status: 'active',
                createdAt: serverTimestamp()
            });
            return { success: true, uid: newUid };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // ✅ 修復：增加防呆，避免 undefined 導致 crash
    async getUserData(uid) {
        if (!uid) return null; // Fix Error 2
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.collectionName, uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) {
            console.error("Get User Error:", error);
            return null;
        }
    }

    // ✅ 新增：修復儀表板 "--" 問題
    async getAllStaffCount() {
        try {
            const db = firebaseService.getDb();
            const coll = collection(db, this.collectionName);
            const snapshot = await getCountFromServer(coll);
            return snapshot.data().count;
        } catch (e) {
            return 0;
        }
    }

    async getAllUsers() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName));
            const querySnapshot = await getDocs(q);
            const users = [];
            querySnapshot.forEach((doc) => users.push(doc.data()));
            return users;
        } catch (error) { return []; }
    }

    async getUsersByUnit(unitId) {
        if(!unitId) return [];
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName), where("unitId", "==", unitId));
            const querySnapshot = await getDocs(q);
            const users = [];
            querySnapshot.forEach((doc) => users.push(doc.data()));
            return users;
        } catch (error) { return []; }
    }

    async getUnitStaff(unitId) { return this.getUsersByUnit(unitId); }

    async searchUsers(keyword) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName));
            const snapshot = await getDocs(q);
            const users = [];
            const k = keyword.toLowerCase();
            snapshot.forEach(doc => {
                const u = doc.data();
                if ((u.name && u.name.toLowerCase().includes(k)) || 
                    (u.staffId && u.staffId.includes(k)) ||
                    (u.email && u.email.toLowerCase().includes(k))) {
                    users.push(u);
                }
            });
            return users;
        } catch (error) { return []; }
    }

    async updateUser(uid, data) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.collectionName, uid);
            await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async deleteStaff(uid) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.collectionName, uid));
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async updateLastLogin(uid) {
        if(!uid) return;
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, uid), { lastLoginAt: serverTimestamp() });
        } catch(e) {}
    }
}

export const userService = new UserService();
