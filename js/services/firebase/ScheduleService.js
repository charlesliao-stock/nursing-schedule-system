import { firebaseService } from "./FirebaseService.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    static async getSchedule(unitId, year, month) {
        /* ... 保持原樣 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) { throw error; }
    }

    static async createEmptySchedule(unitId, year, month, staffList = []) {
        /* ... 保持原樣 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const assignments = {};
            staffList.forEach(staffId => { assignments[staffId] = {}; });
            const initData = {
                unitId, year, month, status: "draft", assignments: assignments,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            };
            await setDoc(docRef, initData);
            return initData;
        } catch (error) { throw error; }
    }

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        /* ... 保持原樣 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            await updateDoc(docRef, { [fieldPath]: shiftCode, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    /**
     * 【Phase 3.3 新增】批次更新整個月的排班資料
     * 用於 AI 自動排班或重置時
     */
    static async updateAllAssignments(unitId, year, month, assignments) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);

            // 直接覆蓋整個 assignments 物件
            await updateDoc(docRef, {
                assignments: assignments,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("批次更新班表失敗", error);
            throw error;
        }
    }
}
