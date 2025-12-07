import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    
    static getCollectionName() { return 'pre_schedules'; }

    static getDocId(unitId, year, month) {
        return `${unitId}_${year}_${String(month).padStart(2, '0')}`;
    }

    /**
     * 取得特定月份的預班表設定與狀態
     */
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

    /**
     * 初始化/建立新的預班表 (由管理者執行)
     */
    static async createPreSchedule(unitId, year, month, settings, staffList) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            // 建立初始的 submissions 結構
            const submissions = {};
            staffList.forEach(staff => {
                submissions[staff.id] = {
                    submitted: false,
                    wishes: {}, // { day: 'OFF' or 'D' ... }
                    notes: '',
                    updatedAt: null
                };
            });

            const data = {
                unitId, year, month,
                status: 'draft', // draft(草稿), open(開放填寫), closed(截止), processed(已轉排班)
                settings: {
                    isOpen: false,
                    openDate: settings.openDate || null,
                    closeDate: settings.closeDate || null,
                    maxOffDays: parseInt(settings.maxOffDays) || 8, // 每人可預休天數
                    canChooseShift: settings.canChooseShift || false, // 是否可選班別(除OFF外)
                    holidays: settings.holidays || [] // 該月國定假日
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

    /**
     * 更新預班表設定 (例如延長截止日期)
     */
    static async updateSettings(unitId, year, month, newSettings) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);
            
            // 使用 dot notation 更新巢狀物件
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

    /**
     * 變更狀態 (開放/關閉)
     */
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
}
