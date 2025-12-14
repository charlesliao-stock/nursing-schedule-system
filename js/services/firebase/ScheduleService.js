import { firebaseService } from "./FirebaseService.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    // 產生班表 ID（保持與預班表不同的格式）
    static getScheduleId(unitId, year, month) {
        if (!unitId || !year || !month) {
            throw new Error('產生班表 ID 失敗：參數不完整');
        }
        // 月份補零，與預班表區別
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }
    
    static async getSchedule(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                return null;
            }
            
            const data = docSnap.data();
            
            // ⭐ 確保 assignments 存在且為物件
            if (!data.assignments || typeof data.assignments !== 'object') {
                data.assignments = {};
            }
            
            return data;
        } catch (error) { 
            console.error('Error getting schedule:', error);
            throw error; 
        }
    }

    static async createEmptySchedule(unitId, year, month, staffList = []) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const assignments = {};
            staffList.forEach(staffId => { assignments[staffId] = {}; });
            
            const initData = {
                unitId, 
                year, 
                month, 
                status: "draft", 
                assignments: assignments,
                createdAt: serverTimestamp(), 
                updatedAt: serverTimestamp()
            };
            
            await setDoc(docRef, initData, { merge: true });
            return initData;
        } catch (error) { 
            console.error('Error creating schedule:', error);
            throw error; 
        }
    }

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            
            // 使用 setDoc + merge 確保文件存在
            await setDoc(docRef, { 
                [fieldPath]: shiftCode, 
                updatedAt: serverTimestamp() 
            }, { merge: true });
            
            return true;
        } catch (error) { 
            console.error('Error updating shift:', error);
            throw error; 
        }
    }

    static async updateAllAssignments(unitId, year, month, assignments) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            await setDoc(docRef, { 
                unitId, 
                year, 
                month,
                assignments: assignments, 
                updatedAt: serverTimestamp() 
            }, { merge: true });
            
            return true;
        } catch (error) { 
            console.error("Update Assignments Error:", error);
            throw error; 
        }
    }

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
