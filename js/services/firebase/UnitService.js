import { 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    updateDoc,
    getDocs, 
    query, 
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
            const newUnitRef = doc(collection(db, this.collectionName));
            
            const dataToSave = {
                ...unitData,
                unitId: newUnitRef.id,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: 'active',
                managers: [],
                schedulers: [],
                settings: {
                    shifts: [], // 初始化空的班別列表
                    rules: {}
                }
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

    /**
     * 取得單一單位資料
     * @param {string} unitId 
     */
    async getUnitById(unitId) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.collectionName, unitId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            } else {
                return null;
            }
        } catch (error) {
            console.error("讀取單位失敗:", error);
            throw error;
        }
    }

    /**
     * 更新單位的班別設定
     * @param {string} unitId 
     * @param {Array} shifts 班別陣列
     */
    async updateUnitShifts(unitId, shifts) {
        try {
            const db = firebaseService.getDb();
            const unitRef = doc(db, this.collectionName, unitId);
            
            // 更新 settings.shifts 欄位
            await updateDoc(unitRef, {
                "settings.shifts": shifts,
                updatedAt: serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            console.error("更新班別失敗:", error);
            return { success: false, error: error.message };
        }
    }
}

export const unitService = new UnitService();
