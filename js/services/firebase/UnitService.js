import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

class UnitService {
    constructor() {
        this.collectionName = 'units';
    }

    /**
     * 建立新單位
     * @param {Object} unitData 
     */
    async createUnit(unitData) {
        try {
            const db = firebaseService.getDb();
            // 使用 unitCode 當作文件 ID (例如: 9B) 方便辨識，或是自動生成
            // 這裡我們採用自動生成 ID，但確保 code 唯一
            const newUnitRef = doc(collection(db, this.collectionName));
            
            const dataToSave = {
                ...unitData,
                unitId: newUnitRef.id, // 儲存 ID 到欄位中
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: 'active',
                managers: [],   // 初始管理者清單
                schedulers: []  // 初始排班者清單
            };

            await setDoc(newUnitRef, dataToSave);
            return { success: true, unitId: newUnitRef.id };
        } catch (error) {
            console.error("建立單位失敗:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 取得所有單位列表
     */
    async getAllUnits() {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.collectionName));
            const querySnapshot = await getDocs(q);
            
            const units = [];
            querySnapshot.forEach((doc) => {
                units.push(doc.data());
            });
            return units;
        } catch (error) {
            console.error("讀取單位列表失敗:", error);
            return [];
        }
    }
}

export const unitService = new UnitService();
