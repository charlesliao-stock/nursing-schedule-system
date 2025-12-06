// 修改重點：從 FirebaseService 取得 db，而非從 config 直接 import
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
        // 【修正】透過 Service 取得 db 實例
        const db = firebaseService.getDb();
        const scheduleId = this.getScheduleId(unitId, year, month);
        const docRef = doc(db, "schedules", scheduleId);
        
        try {
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

    static async createEmptySchedule(unitId, year, month, staffList = []) {
        const db = firebaseService.getDb(); // 【修正】
        const scheduleId = this.getScheduleId(unitId, year, month);
        const docRef = doc(db, "schedules", scheduleId);

        const assignments = {};
        staffList.forEach(staffId => {
            // 注意：這裡是使用 staffId (doc id) 作為 key
            assignments[staffId] = {}; 
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

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        const db = firebaseService.getDb(); // 【修正】
        const scheduleId = this.getScheduleId(unitId, year, month);
        const docRef = doc(db, "schedules", scheduleId);

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
