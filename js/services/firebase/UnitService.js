import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class UnitService {
    
    static COLLECTION_NAME = 'units';
    
    // ✅ 新增：快取容器
    static _cache = new Map();
    static CACHE_DURATION = 300000; // 5分鐘 (毫秒)

    // ✅ 新增：帶快取的讀取方法 (用於 AI 排班等頻繁讀取場景)
    static async getUnitByIdWithCache(unitId) {
        const now = Date.now();
        
        if (this._cache.has(unitId)) {
            const cached = this._cache.get(unitId);
            if (now - cached.timestamp < this.CACHE_DURATION) {
                console.log(`[UnitService] 使用快取讀取單位: ${unitId}`);
                return cached.data;
            }
        }

        // 若無快取或過期，執行正常讀取
        const data = await this.getUnitById(unitId);
        if (data) {
            this._cache.set(unitId, { data: data, timestamp: now });
        }
        return data;
    }

    // 清除快取 (例如更新設定後呼叫)
    static clearCache(unitId) {
        if(unitId) this._cache.delete(unitId);
        else this._cache.clear();
    }

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
            
            // ✅ 更新後清除該單位快取，確保下次讀到最新資料
            this.clearCache(unitId);
            
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async deleteUnit(unitId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, UnitService.COLLECTION_NAME, unitId));
            this.clearCache(unitId); // 清除快取
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    static async getAllUnits() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, UnitService.COLLECTION_NAME));
            const querySnapshot = await getDocs(q);
            const units = [];
            querySnapshot.forEach((doc) => units.push({ id: doc.id, ...doc.data() })); 
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

    static async getUnitsByManager(managerId) {
        try {
            const db = firebaseService.getDb();
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

    static async getUnitByCode(code) {
        const db = firebaseService.getDb();
        const q = query(collection(db, UnitService.COLLECTION_NAME), where("unitCode", "==", code));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { unitId: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        return null;
    }
}
