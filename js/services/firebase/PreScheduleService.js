import { 
    db, 
    collection, 
    doc, 
    getDoc,      // ⭐ 新增
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

    // ⭐ 新增：統一的 ID 產生方法
    generateDocId(unitId, year, month) {
        return `${unitId}_${parseInt(year)}_${parseInt(month)}`;
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
            return [];
        }
    }

    // ⭐ 修正：改用 getDoc 直接讀取
    async getPreSchedule(unitId, year, month) {
        try {
            // 直接用 document ID 讀取
            const docId = this.generateDocId(unitId, year, month);
            const docRef = doc(db, this.collectionName, docId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                console.warn(`預班表不存在: ${docId}`);
                return null;
            }
            
            return { id: docSnap.id, ...docSnap.data() };
        } catch (error) {
            console.error("Error getting pre-schedule:", error);
            throw error;
        }
    }

    // 檢查是否已存在
    async checkPreScheduleExists(unitId, year, month) {
        const schedule = await this.getPreSchedule(unitId, year, month);
        return !!schedule;
    }

    // 建立新預班表
    async createPreSchedule(data) {
        try {
            const docId = this.generateDocId(data.unitId, data.year, data.month);
            const docRef = doc(db, this.collectionName, docId);
            
            const payload = {
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await setDoc(docRef, payload);
            return docId;
        } catch (error) {
            console.error("Error creating pre-schedule:", error);
            throw error;
        }
    }

    // 更新設定 (ManagePage 用)
    async updatePreScheduleSettings(id, data) {
        try {
            const docRef = doc(db, this.collectionName, id);
            await updateDoc(docRef, {
                settings: data.settings,
                staffIds: data.staffIds,
                staffSettings: data.staffSettings,
                supportStaffIds: data.supportStaffIds || [],
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating settings:", error);
            throw error;
        }
    }

    // 刪除
    async deletePreSchedule(id) {
        try {
            await deleteDoc(doc(db, this.collectionName, id));
        } catch (error) {
            console.error("Error deleting pre-schedule:", error);
            throw error;
        }
    }

    // 個人提交預班 (SubmitPage 用)
    async submitPersonalWish(unitId, year, month, uid, wishes, notes = "", preferences = {}) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("預班表不存在");

            const docRef = doc(db, this.collectionName, schedule.id);
            const key = `submissions.${uid}`;
            
            await updateDoc(docRef, {
                [`${key}.wishes`]: wishes,
                [`${key}.note`]: notes,
                [`${key}.preferences`]: preferences,
                [`${key}.isSubmitted`]: true,
                [`${key}.updatedAt`]: new Date()
            });
        } catch (error) {
            console.error("Error submitting wish:", error);
            throw error;
        }
    }

    // 管理者儲存預班審核結果 (EditPage 用)
    async updatePreScheduleSubmissions(unitId, year, month, submissions) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("找不到該預班表，無法儲存");

            const docRef = doc(db, this.collectionName, schedule.id);
            
            await updateDoc(docRef, {
                submissions: submissions,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating submissions:", error);
            throw error;
        }
    }

    // 加入跨單位支援人員
    async addSupportStaff(unitId, year, month, uid) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("預班表不存在");

            const docRef = doc(db, this.collectionName, schedule.id);
            
            await updateDoc(docRef, {
                staffIds: arrayUnion(uid),
                supportStaffIds: arrayUnion(uid),
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error adding support staff:", error);
            throw error;
        }
    }
}

export const PreScheduleServiceInstance = new PreScheduleService();
export { PreScheduleServiceInstance as PreScheduleService };
