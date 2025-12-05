import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

class UnitService {
    constructor() {
        this.collectionName = 'units';
    }

    async createUnit(unitData) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const newUnitRef = doc(collection(db, this.collectionName));
            // 確保 unitCode 唯一 (簡單檢查)
            const existing = await this.getUnitByCode(unitData.unitCode);
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

    // 【新增】更新單位
    async updateUnit(unitId, updateData) {
        try {
            const db = firebaseService.getDb();
            const unitRef = doc(db, this.collectionName, unitId);
            await updateDoc(unitRef, { ...updateData, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 【新增】刪除單位
    async deleteUnit(unitId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.collectionName, unitId));
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    async getAllUnits() { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName));
            const querySnapshot = await getDocs(q);
            const units = [];
            querySnapshot.forEach((doc) => units.push(doc.data()));
            return units;
        } catch (error) { return []; }
    }

    async getUnitById(unitId) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            const docSnap = await getDoc(doc(db, this.collectionName, unitId));
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) { return null; }
    }

    async updateUnitShifts(unitId, shifts) { /* ...保持原樣... */
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.collectionName, unitId), { "settings.shifts": shifts, updatedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 【新增】透過代號找單位 (匯入用)
    async getUnitByCode(code) {
        const db = firebaseService.getDb();
        const q = query(collection(db, this.collectionName), where("unitCode", "==", code));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { unitId: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        return null;
    }

    // 【新增】批次匯入單位
    async importUnits(unitsData) {
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
            // 檢查重複
            const existing = await this.getUnitByCode(unit.unitCode);
            if (existing) {
                results.failed++;
                results.errors.push(`單位代號重複: ${unit.unitCode}`);
                continue;
            }

            const newUnitRef = doc(collection(db, this.collectionName));
            batch.set(newUnitRef, {
                unitId: newUnitRef.id,
                unitCode: unit.unitCode,
                unitName: unit.unitName,
                description: unit.description || '',
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                managers: [], // 匯入初期先不綁定管理者，避免 ID 對不上的問題
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

export const unitService = new UnitService();
