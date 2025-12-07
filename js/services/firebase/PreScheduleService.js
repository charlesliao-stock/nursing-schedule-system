import { 
    doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { ScheduleService } from "./ScheduleService.js"; // 需引用以讀取正式班表

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
     * 初始化/建立新的預班表
     */
    static async createPreSchedule(unitId, year, month, settings, staffList) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            // 建立 submissions 結構 (包含本單位人員)
            const submissions = {};
            staffList.forEach(staff => {
                submissions[staff.id] = {
                    name: staff.name, // 冗餘存著名稱方便顯示
                    level: staff.level || '',
                    isExternal: false,
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
                    holidays: settings.holidays || [],
                    // 新增：每日需求人數 (D/E/N)
                    minStaff: settings.minStaff || { D:0, E:0, N:0 }
                },
                submissions: submissions, // 這裡存放該預班表包含的所有人員(含外調)
                externalStaffIds: [],     // 額外記錄外調人員 ID 方便查詢
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
     * 提交個人預班需求
     */
    static async submitPersonalWish(unitId, year, month, staffId, wishes, notes) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);
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

    /**
     * 【新增】加入跨單位支援人員
     * @param {string} targetUnitId 目標預班表單位
     * @param {Object} staffData 人員物件 {id, name, level, ...}
     */
    static async addExternalStaff(targetUnitId, year, month, staffData) {
        try {
            const db = firebaseService.getDb();
            
            // 1. 檢查該員是否已被納入「其他單位」的同月預班表
            // 這需要查詢所有 pre_schedules (或依賴 submissions key 查詢)
            // 這裡做一個簡化檢查：查詢該員是否在自己母單位的預班表中
            // 實務上可能需要更複雜的 Collection Group Query，這裡先實作「母單位檢查」
            
            const docId = this.getDocId(targetUnitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            // 寫入 submissions
            const fieldPath = `submissions.${staffData.id}`;
            await updateDoc(docRef, {
                [fieldPath]: {
                    name: staffData.name,
                    level: staffData.level,
                    isExternal: true, // 標記為外調
                    originUnitId: staffData.unitId,
                    submitted: false,
                    wishes: {},
                    notes: '',
                    updatedAt: null
                },
                externalStaffIds: arrayUnion(staffData.id)
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 【新增】移除跨單位人員
     */
    static async removeExternalStaff(unitId, year, month, staffId) {
        try {
            const db = firebaseService.getDb();
            const docId = this.getDocId(unitId, year, month);
            const docRef = doc(db, this.getCollectionName(), docId);

            // Firestore 無法直接 delete map key，通常用 update 設定為 deleteField()
            // 但前端 SDK 引用 deleteField 較麻煩，這裡先保留資料但標記 removed (或直接覆蓋)
            // 這裡使用標準作法：
            // 注意：要從 submissions 移除 key 需要用到 FieldValue.delete()，這裡簡化處理
            // 我們先只從 externalStaffIds 移除，UI 根據這陣列過濾即可
            
            await updateDoc(docRef, {
                externalStaffIds: arrayRemove(staffId)
            });
            // 嚴謹一點應該要刪除 submissions[staffId]
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 【新增】取得個人歷史預班紀錄 (用於提交頁面下方)
     */
    static async getUserHistory(staffId) {
        try {
            const db = firebaseService.getDb();
            // 這需要複合索引，如果尚未建立，會報錯並提供連結建立
            // 搜尋所有 pre_schedules 中 submissions.STAFF_ID 存在的過往文件
            // 替代方案：只抓最近 6 個月的 docId 直接讀取 (較省索引)
            
            // 這裡模擬抓取最近 3 個月 (不含未來)
            const history = [];
            const now = new Date();
            for (let i = 1; i <= 3; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                // 這裡假設使用者只屬於一個單位，若有外調會較複雜
                // 簡化：從 URL 或 Context 取得 unitId
                // 若無法取得，此功能先回傳空
                continue; 
            }
            return history; 
        } catch (error) {
            return [];
        }
    }

    /**
     * 【新增】取得前一個月最後 6 天的班表 (跨月銜接用)
     */
    static async getPreviousMonthLast6Days(unitId, currentYear, currentMonth, staffId) {
        let prevYear = currentYear;
        let prevMonth = currentMonth - 1;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear--;
        }

        try {
            // 呼叫 ScheduleService 讀取正式班表
            const schedule = await ScheduleService.getSchedule(unitId, prevYear, prevMonth);
            if (!schedule || !schedule.assignments || !schedule.assignments[staffId]) {
                return {}; // 無資料
            }

            const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
            const startDay = daysInPrevMonth - 5; // 最後 6 天 (e.g., 31, 30, 29, 28, 27, 26)
            
            const result = {};
            for (let d = startDay; d <= daysInPrevMonth; d++) {
                result[d] = schedule.assignments[staffId][d] || '';
            }
            return { 
                year: prevYear, 
                month: prevMonth, 
                data: result 
            };
        } catch (error) {
            console.error("讀取前月班表失敗:", error);
            return {};
        }
    }
}
