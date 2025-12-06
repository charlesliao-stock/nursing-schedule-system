import { firebaseService } from "./FirebaseService.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    /**
     * 產生 Document ID Helper
     * 格式: UnitId_Year_Month (例如: ICU-A_2025_01)
     */
    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    /**
     * 取得指定單位、月份的班表
     */
    static async getSchedule(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            } else {
                return null;
            }
        } catch (error) {
            console.error("讀取班表失敗:", error);
            throw error;
        }
    }

    /**
     * 初始化一張新的月份班表 (當該月還沒有資料時)
     * @param {string} unitId 
     * @param {number} year 
     * @param {number} month 
     * @param {Array} staffList - 該單位的所有人員 ID 列表 (預先建立空殼)
     */
    static async createEmptySchedule(unitId, year, month, staffList = []) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);

            // 建立初始 assignments 結構
            const assignments = {};
            staffList.forEach(staffId => {
                assignments[staffId] = {}; // 每個員工預設空的排班資料
            });

            const initData = {
                unitId,
                year,
                month,
                status: "draft",
                assignments: assignments,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await setDoc(docRef, initData);
            return initData;
        } catch (error) {
            console.error("建立新班表失敗:", error);
            throw error;
        }
    }

    /**
     * 更新單一格班別
     * 使用 updateDoc + Dot Notation 只更新該欄位
     */
    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);

            // Firestore 巢狀更新語法: "assignments.staff_001.5": "D"
            const fieldPath = `assignments.${staffId}.${day}`;

            await updateDoc(docRef, {
                [fieldPath]: shiftCode,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("更新班別失敗", error);
            throw error;
        }
    }
}
