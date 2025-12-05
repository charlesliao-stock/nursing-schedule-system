import { db } from "../../config/firebase.config.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"; // 請確認版本號與你專案一致

export class ScheduleService {

    /**
     * 產生 Document ID Helper
     */
    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    /**
     * 取得指定單位、月份的班表
     * 如果不存在，是否要自動初始化？(看需求，這裡先單純回傳)
     */
    static async getSchedule(unitId, year, month) {
        const scheduleId = this.getScheduleId(unitId, year, month);
        const docRef = doc(db, "schedules", scheduleId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return null; // 或者回傳 null 讓 UI 決定是否要建立新表
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
    }

    /**
     * 更新單一格班別 (最核心的功能)
     * 使用 updateDoc + Dot Notation 只更新該欄位，節省流量並避免衝突
     */
    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        const scheduleId = this.getScheduleId(unitId, year, month);
        const docRef = doc(db, "schedules", scheduleId);

        // Firestore 巢狀更新語法: "assignments.staff_001.5": "D"
        const fieldPath = `assignments.${staffId}.${day}`;

        try {
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
