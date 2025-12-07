import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    
    static getCollectionName() { return 'pre_schedules'; }

    static getDocId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    static async getPreSchedule(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) {
            console.error("Get PreSchedule Error:", error);
            throw error;
        }
    }

    static async createPreSchedule(unitId, year, month, settings, staffList) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            const submissions = {};
            staffList.forEach(staff => {
                submissions[staff.id] = {
                    submitted: false,
                    wishes: {}, 
                    notes: '',
                    updatedAt: null
                };
            });

            const data = {
                unitId, year, month,
                status: 'draft',
                settings: {
                    isOpen: false,
                    openDate: settings.openDate || null,
                    closeDate: settings.closeDate || null,
                    maxOffDays: parseInt(settings.maxOffDays) || 8,
                    canChooseShift: settings.canChooseShift || false,
                    holidays: settings.holidays || [] 
                },
                submissions: submissions,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await setDoc(docRef, data);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static async updateSettings(unitId, year, month, newSettings) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);
            
            const updates = {};
            for (const [key, value] of Object.entries(newSettings)) {
                updates[`settings.${key}`] = value;
            }
            updates.updatedAt = serverTimestamp();

            await updateDoc(docRef, updates);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static async updateStatus(unitId, year, month, status) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);
            await updateDoc(docRef, { 
                status: status,
                updatedAt: serverTimestamp() 
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 【新增】提交個人預班需求
     * @param {string} unitId 
     * @param {number} year 
     * @param {number} month 
     * @param {string} staffId 使用者 ID
     * @param {Object} wishes 班別需求 { 1: 'OFF', 5: 'D' }
     * @param {string} notes 備註
     */
    static async submitPersonalWish(unitId, year, month, staffId, wishes, notes) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            // 更新特定人員的 submissions 欄位
            const fieldPath = `submissions.${staffId}`;
            
            await updateDoc(docRef, {
                [`${fieldPath}.submitted`]: true,
                [`${fieldPath}.wishes`]: wishes,
                [`${fieldPath}.notes`]: notes,
                [`${fieldPath}.updatedAt`]: serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error("提交失敗:", error);
            return { success: false, error: error.message };
        }
    }
}
