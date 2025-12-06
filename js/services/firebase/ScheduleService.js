import { firebaseService } from "./FirebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    // ... getSchedule, createEmptySchedule, updateShift, updateAllAssignments 保持原樣 ...
    // (為了節省篇幅，請保留您原本的程式碼，僅新增下方方法)
    
    static async getSchedule(unitId, year, month) {
        /* ... 請保留原有的程式碼 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) { throw error; }
    }

    static async createEmptySchedule(unitId, year, month, staffList = []) {
        /* ... 請保留原有的程式碼 ... */
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
        /* ... 請保留原有的程式碼 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            await updateDoc(docRef, { [fieldPath]: shiftCode, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    static async updateAllAssignments(unitId, year, month, assignments) {
        /* ... 請保留原有的程式碼 ... */
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            await updateDoc(docRef, { assignments: assignments, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    /**
     * 【Phase 3.4 新增】更新班表狀態 (發布/撤回)
     * @param {string} status - 'draft' | 'published'
     */
    static async updateStatus(unitId, year, month, status) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);

            await updateDoc(docRef, {
                status: status,
                publishedAt: status === 'published' ? serverTimestamp() : null,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("更新狀態失敗", error);
            throw error;
        }
    }
}
