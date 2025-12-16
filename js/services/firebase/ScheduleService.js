import { firebaseService } from "./FirebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ScheduleService {

    static getScheduleId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }
    
    /**
     * 獲取班表 (含自動串接上個月資料邏輯)
     */
    static async getSchedule(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // 檢查是否已存有上個月資料，若無則補抓 (為了灰色區塊顯示)
                if (!data.prevAssignments) {
                    console.log("偵測到無上月資料，嘗試補抓...");
                    const prevAssignments = await this.fetchPrevMonthAssignments(unitId, year, month);
                    data.prevAssignments = prevAssignments;
                    
                    // 補寫回資料庫，下次就不用再抓
                    await updateDoc(docRef, { prevAssignments: prevAssignments });
                }
                return data;
            }
            return null;
        } catch (error) { throw error; }
    }

    /**
     * 建立空白班表 (同時抓取上個月資料)
     */
    static async createEmptySchedule(unitId, year, month, staffList = []) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            // 初始化 assignments
            const assignments = {};
            staffList.forEach(staff => { assignments[staff.uid] = {}; });
            
            // 抓取上個月資料做為底稿
            const prevAssignments = await this.fetchPrevMonthAssignments(unitId, year, month);

            const initData = {
                unitId, year, month, 
                status: "draft", 
                assignments: assignments,
                prevAssignments: prevAssignments, // 固化上個月資料
                createdAt: serverTimestamp(), 
                updatedAt: serverTimestamp()
            };
            
            await setDoc(docRef, initData, { merge: true });
            return initData;
        } catch (error) { throw error; }
    }

    /**
     * 輔助：抓取上個月的排班資料
     */
    static async fetchPrevMonthAssignments(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            let prevYear = year;
            let prevMonth = month - 1;
            if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

            const prevId = this.getScheduleId(unitId, prevYear, prevMonth);
            const prevSnap = await getDoc(doc(db, "schedules", prevId));

            if (prevSnap.exists()) {
                return prevSnap.data().assignments || {};
            }
            return {}; // 上個月沒資料
        } catch (e) {
            console.warn("Fetch prev month failed:", e);
            return {};
        }
    }

    static async updateShift(unitId, year, month, staffId, day, shiftCode) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            const fieldPath = `assignments.${staffId}.${day}`;
            
            await updateDoc(docRef, { [fieldPath]: shiftCode, updatedAt: serverTimestamp() });
            return true;
        } catch (error) { throw error; }
    }

    // 更新時，若有傳入 prevAssignments 也要一併更新 (確保資料一致)
    static async updateAllAssignments(unitId, year, month, assignments, prevAssignments = null) {
        try {
            const db = firebaseService.getDb();
            const scheduleId = this.getScheduleId(unitId, year, month);
            const docRef = doc(db, "schedules", scheduleId);
            
            const payload = { 
                unitId, year, month,
                assignments: assignments, 
                updatedAt: serverTimestamp() 
            };

            if (prevAssignments) {
                payload.prevAssignments = prevAssignments;
            }
            
            await setDoc(docRef, payload, { merge: true });
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
