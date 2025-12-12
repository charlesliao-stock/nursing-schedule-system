import { firebaseService } from "./FirebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }
    
    static async getSchedule(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) { throw error; }
    }

    static async createEmptySchedule(unitId, year, month, staffList = []) {
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
            
            // 使用 setDoc 確保建立
            await setDoc(docRef, initData, { merge: true });
            return initData;
        } catch (error) { throw error; }
    }

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            
            // 單一更新仍可用 updateDoc，但若擔心文件遺失，可改用 setDoc merge
            // 這裡為了效能維持 updateDoc，但前端需確保 Schedule 已初始化
            await updateDoc(docRef, { [fieldPath]: shiftCode, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    // ✅ 修正：使用 setDoc + merge 解決 "No document to update"
    static async updateAllAssignments(unitId, year, month, assignments) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            await setDoc(docRef, { 
                unitId, year, month, // 確保基本欄位存在
                assignments: assignments, 
                updatedAt: serverTimestamp() 
            }, { merge: true });
            
            return true;
        } catch (error) { 
            console.error("Update Assignments Error:", error);
            throw error; 
        }
    }

    // ✅ 修正：同樣使用 setDoc + merge
    static async updateStatus(unitId, year, month, status) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);

            await setDoc(docRef, {
                status: status,
                publishedAt: status === 'published' ? serverTimestamp() : null,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            return true;
        } catch (error) {
            console.error("Update Status Error:", error);
            throw error;
        }
    }
}
