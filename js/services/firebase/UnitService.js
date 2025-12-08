import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class UnitService {
    
    static COLLECTION_NAME = 'units';

    // ... (保留原本的 createUnit, updateUnit, deleteUnit, getAllUnits, getUnitById 等方法)
    // 請將以下內容加入或覆蓋檔案：

    static async createUnit(unitData) {
        try {
            const db = firebaseService.getDb();
            const newUnitRef = doc(collection(db, UnitService.COLLECTION_NAME));
            const existing = await UnitService.getUnitByCode(unitData.unitCode);
            if (existing) return { success: false, error: `單位代號 ${unitData.unitCode} 已存在` };

            const dataToSave = {
                ...unitData,
                unitId: newUnitRef.id,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: 'active',
                managers: unitData.managers || [],
                schedulers: [],
                settings: { shifts: [], rules: {} }
            };
            await setDoc(newUnitRef, dataToSave);
            return { success: true, unitId: newUnitRef.id };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async updateUnit(unitId, updateData) {
        try {
            const db = firebaseService.getDb();
            const unitRef = doc(db, UnitService.COLLECTION_NAME, unitId);
            await updateDoc(unitRef, { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async deleteUnit(unitId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, UnitService.COLLECTION_NAME, unitId));
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async getAllUnits() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, UnitService.COLLECTION_NAME));
            const querySnapshot = await getDocs(q);
            const units = [];
            querySnapshot.forEach((doc) => units.push({ id: doc.id, ...doc.data() })); // 確保 id 存在
            return units;
        } catch (error) { return []; }
    }

    static async getUnitById(unitId) {
        try {
            const db = firebaseService.getDb();
            const docSnap = await getDoc(doc(db, UnitService.COLLECTION_NAME, unitId));
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { return null; }
    }

    /**
     * ✅ 新增：取得特定管理者所管理的所有單位
     */
    static async getUnitsByManager(managerId) {
        try {
            const db = firebaseService.getDb();
            // 查詢 managers 陣列包含此 ID
            const q = query(
                collection(db, UnitService.COLLECTION_NAME), 
                where("managers", "array-contains", managerId)
            );
            const querySnapshot = await getDocs(q);
            const units = [];
            querySnapshot.forEach((doc) => units.push({ id: doc.id, ...doc.data() }));
            return units;
        } catch (error) {
            console.error("Get units by manager failed:", error);
            return [];
        }
    }

    static async updateUnitShifts(unitId, shifts) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, UnitService.COLLECTION_NAME, unitId), { 
                "settings.shifts": shifts, updatedAt: serverTimestamp() 
            });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async getUnitByCode(code) {
        const db = firebaseService.getDb();
        const q = query(collection(db, UnitService.COLLECTION_NAME), where("unitCode", "==", code));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { unitId: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        return null;
    }

    static async importUnits(unitsData) { /*...保留原樣...*/ }
}
