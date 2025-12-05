import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

// 修改重點 1: 加上 'export' 並移除 default export
// 修改重點 2: 將方法改為 'static'，方便直接呼叫
export class UnitService {
    
    // 定義靜態屬性，取代原本 constructor 中的 this.collectionName
    static COLLECTION_NAME = 'units';

    /**
     * 建立單位
     */
    static async createUnit(unitData) {
        try {
            const db = firebaseService.getDb();
            // 使用 UnitService.COLLECTION_NAME
            const newUnitRef = doc(collection(db, UnitService.COLLECTION_NAME));
            
            // 確保 unitCode 唯一
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
        } catch (error) { 
            return { success: false, error: error.message }; 
        }
    }

    /**
     * 更新單位
     */
    static async updateUnit(unitId, updateData) {
        try {
            const db = firebaseService.getDb();
            const unitRef = doc(db, UnitService.COLLECTION_NAME, unitId);
            await updateDoc(unitRef, { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { 
            return { success: false, error: error.message }; 
        }
    }

    /**
     * 刪除單位
     */
    static async deleteUnit(unitId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, UnitService.COLLECTION_NAME, unitId));
            return { success: true };
        } catch (error) { 
            return { success: false, error: error.message }; 
        }
    }

    /**
     * 取得所有單位
     */
    static async getAllUnits() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, UnitService.COLLECTION_NAME));
            const querySnapshot = await getDocs(q);
            const units = [];
            querySnapshot.forEach((doc) => units.push(doc.data()));
            return units;
        } catch (error) { 
            console.error("Get units failed:", error);
            return []; 
        }
    }

    /**
     * 取得單一單位 (By ID)
     */
    static async getUnitById(unitId) {
        try {
            const db = firebaseService.getDb();
            const docSnap = await getDoc(doc(db, UnitService.COLLECTION_NAME, unitId));
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) { 
            return null; 
        }
    }

    /**
     * 更新單位班別設定
     */
    static async updateUnitShifts(unitId, shifts) {
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, UnitService.COLLECTION_NAME, unitId), { 
                "settings.shifts": shifts, 
                updatedAt: serverTimestamp() 
            });
            return { success: true };
        } catch (error) { 
            return { success: false, error: error.message }; 
        }
    }

    /**
     * 透過代號找單位 (匯入用 / 內部檢查用)
     */
    static async getUnitByCode(code) {
        const db = firebaseService.getDb();
        const q = query(collection(db, UnitService.COLLECTION_NAME), where("unitCode", "==", code));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { unitId: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        return null;
    }

    /**
     * 批次匯入單位
     */
    static async importUnits(unitsData) {
        const db = firebaseService.getDb();
        const batch = writeBatch(db);
        const results = { success: 0, failed: 0, errors: [] };

        for (const unit of unitsData) {
            // 檢查必填
            if (!unit.unitCode || !unit.unitName) {
                results.failed++;
                results.errors.push(`資料不完整: ${JSON.stringify(unit)}`);
                continue;
            }
            // 檢查重複 (使用 Static Method)
            const existing = await UnitService.getUnitByCode(unit.unitCode);
            if (existing) {
                results.failed++;
                results.errors.push(`單位代號重複: ${unit.unitCode}`);
                continue;
            }

            const newUnitRef = doc(collection(db, UnitService.COLLECTION_NAME));
            batch.set(newUnitRef, {
                unitId: newUnitRef.id,
                unitCode: unit.unitCode,
                unitName: unit.unitName,
                description: unit.description || '',
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                managers: [],
                settings: { shifts: [], rules: {} }
            });
            results.success++;
        }

        try {
            await batch.commit();
            return results;
        } catch (error) {
            console.error("批次匯入失敗:", error);
            return { success: 0, failed: unitsData.length, errors: [error.message] };
        }
    }
}
