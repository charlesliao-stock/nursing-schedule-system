import { firebaseService } from "./FirebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs
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

    // ✅ 新增：通用儲存方法 (Create or Update)
    static async saveSchedule(unitId, year, month, data) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            const payload = {
                ...data,
                unitId, year, month,
                updatedAt: serverTimestamp()
            };
            
            // 使用 merge: true，若文件不存在則建立，存在則更新
            await setDoc(docRef, payload, { merge: true });
            return true;
        } catch (error) { 
            console.error("Save Schedule Error:", error);
            throw error; 
        }
    }

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            // 這裡仍維持 updateDoc，因為通常是在班表已存在時操作
            // 若需防呆，可改用 setDoc merge
            await updateDoc(docRef, { [fieldPath]: shiftCode, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    static async updateAllAssignments(unitId, year, month, assignments) {
        // ✅ 改用 saveSchedule 以防止文件不存在時報錯
        return await this.saveSchedule(unitId, year, month, { assignments });
    }

    static async updateStatus(unitId, year, month, status) {
        return await this.saveSchedule(unitId, year, month, { 
            status, 
            publishedAt: status === 'published' ? serverTimestamp() : null 
        });
    }
}
