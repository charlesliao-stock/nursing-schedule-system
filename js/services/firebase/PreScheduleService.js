import { 
    db, 
    collection, 
    doc, 
    getDoc,      // ⭐ 新增這個 import
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    arrayUnion
} from "../../config/firebase.config.js";

class PreScheduleService {
    constructor() {
        this.collectionName = "pre_schedules";
    }

    // ⭐ 核心修正：產生統一的 document ID
    generateDocId(unitId, year, month) {
        // 確保參數有效
        if (!unitId || !year || !month) {
            console.error('❌ Invalid params for generateDocId:', { unitId, year, month });
            throw new Error('產生預班表 ID 失敗：參數不完整');
        }
        
        // 統一格式：unitId_year_month
        const docId = `${unitId}_${parseInt(year)}_${parseInt(month)}`;
        console.log('✅ Generated docId:', docId);
        return docId;
    }

    // 取得特定單位的預班表清單
    async getPreSchedulesList(unitId) {
        try {
            const q = query(
                collection(db, this.collectionName),
                where("unitId", "==", unitId),
                orderBy("year", "desc"),
                orderBy("month", "desc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error getting pre-schedules list:", error);
            // 避免因為索引未建立導致卡死，回傳空陣列
            return [];
        }
    }

    // ⭐ 核心修正：改用直接讀取 document，避免索引問題
    async getPreSchedule(unitId, year, month) {
        try {
            console.log('🔍 PreScheduleService.getPreSchedule called:', { unitId, year, month });
            
            // 方法 1: 直接用 document ID 讀取（推薦，更快更穩定）
            const docId = this.generateDocId(unitId, year, month);
            const docRef = doc(db, this.collectionName, docId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                console.warn(`⚠️ 預班表不存在: ${docId}`);
                
                // 方法 2: 如果直接讀取失敗，嘗試用 query（fallback）
                console.log('🔄 嘗試用 query 查詢...');
                const q = query(
                    collection(db, this.collectionName),
                    where("unitId", "==", unitId),
                    where("year", "==", parseInt(year)),
                    where("month", "==", parseInt(month))
                );
                const snapshot = await getDocs(q);
                
                if (snapshot.empty) {
                    console.error('❌ Query 也找不到，預班表確實不存在');
                    return null;
                }
                
                console.log('✅ Query 找到預班表');
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            
            console.log('✅ 預班表讀取成功:', docSnap.id);
            return { id: docSnap.id, ...docSnap.data() };
            
        } catch (error) {
            console.error("❌ Error getting pre-schedule:", error);
            console.error("   unitId:", unitId);
            console.error("   year:", year);
            console.error("   month:", month);
            throw new Error(`讀取預班表失敗: ${error.message}`);
        }
    }

    // 檢查是否已存在
    async checkPreScheduleExists(unitId, year, month) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            return !!schedule;
        } catch (error) {
            console.error("Error checking pre-schedule exists:", error);
            return false;
        }
    }

    // 建立新預班表
    async createPreSchedule(data) {
        try {
            // 使用統一的 ID 產生方法
            const docId = this.generateDocId(data.unitId, data.year, data.month);
            const docRef = doc(db, this.collectionName, docId);
            
            const payload = {
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            console.log('📝 Creating pre-schedule:', docId);
            await setDoc(docRef, payload);
            console.log('✅ Pre-schedule created:', docId);
            return docId;
        } catch (error) {
            console.error("❌ Error creating pre-schedule:", error);
            throw error;
        }
    }

    // 更新設定 (ManagePage 用)
    async updatePreScheduleSettings(id, data) {
        try {
            console.log('📝 Updating pre-schedule settings:', id);
            const docRef = doc(db, this.collectionName, id);
            await updateDoc(docRef, {
                settings: data.settings,
                staffIds: data.staffIds,
                staffSettings: data.staffSettings,
                supportStaffIds: data.supportStaffIds || [],
                updatedAt: new Date()
            });
            console.log('✅ Settings updated');
        } catch (error) {
            console.error("❌ Error updating settings:", error);
            throw error;
        }
    }

    // 刪除
    async deletePreSchedule(id) {
        try {
            console.log('🗑️ Deleting pre-schedule:', id);
            await deleteDoc(doc(db, this.collectionName, id));
            console.log('✅ Pre-schedule deleted');
        } catch (error) {
            console.error("❌ Error deleting pre-schedule:", error);
            throw error;
        }
    }

    // 個人提交預班 (SubmitPage 用)
    async submitPersonalWish(unitId, year, month, uid, wishes, notes = "", preferences = {}) {
        try {
            console.log('📝 Submitting personal wish:', { unitId, year, month, uid });
            
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) {
                throw new Error("預班表不存在");
            }

            const docRef = doc(db, this.collectionName, schedule.id);
            const key = `submissions.${uid}`;
            
            await updateDoc(docRef, {
                [`${key}.wishes`]: wishes,
                [`${key}.note`]: notes,
                [`${key}.preferences`]: preferences,
                [`${key}.isSubmitted`]: true,
                [`${key}.updatedAt`]: new Date()
            });
            
            console.log('✅ Personal wish submitted');
        } catch (error) {
            console.error("❌ Error submitting wish:", error);
            throw error;
        }
    }

    // 管理者儲存預班審核結果 (EditPage 用)
    async updatePreScheduleSubmissions(unitId, year, month, submissions) {
        try {
            console.log('📝 Updating pre-schedule submissions:', { unitId, year, month });
            
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) {
                throw new Error("找不到該預班表，無法儲存");
            }

            const docRef = doc(db, this.collectionName, schedule.id);
            
            await updateDoc(docRef, {
                submissions: submissions,
                updatedAt: new Date()
            });
            
            console.log('✅ Submissions updated');
        } catch (error) {
            console.error("❌ Error updating submissions:", error);
            throw error;
        }
    }

    // 加入跨單位支援人員
    async addSupportStaff(unitId, year, month, uid) {
        try {
            console.log('👥 Adding support staff:', { unitId, year, month, uid });
            
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) {
                throw new Error("預班表不存在");
            }

            const docRef = doc(db, this.collectionName, schedule.id);
            
            await updateDoc(docRef, {
                staffIds: arrayUnion(uid),
                supportStaffIds: arrayUnion(uid),
                updatedAt: new Date()
            });
            
            console.log('✅ Support staff added');
        } catch (error) {
            console.error("❌ Error adding support staff:", error);
            throw error;
        }
    }
}

export const PreScheduleServiceInstance = new PreScheduleService();
export { PreScheduleServiceInstance as PreScheduleService };
