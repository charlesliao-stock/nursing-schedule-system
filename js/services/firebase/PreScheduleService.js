import { 
    db, 
    collection, 
    doc, 
    getDoc, 
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

    // ✅ 新增：透過 ID 取得預班表 (這是 EditPage 呼叫的方法)
    async getPreScheduleById(id) {
        try {
            const docRef = doc(db, this.collectionName, id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error getting pre-schedule by ID:", error);
            throw error;
        }
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

    // 取得單一預班表詳細資料 (舊有方法，保留相容性)
    async getPreSchedule(unitId, year, month) {
        try {
            const q = query(
                collection(db, this.collectionName),
                where("unitId", "==", unitId),
                where("year", "==", parseInt(year)),
                where("month", "==", parseInt(month))
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;
            
            const docSnap = snapshot.docs[0];
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
            const docId = `${data.unitId}_${data.year}_${data.month}`;
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

    // 更新整筆文件 (EditPage 用，包含 history)
    async updatePreSchedule(id, data) {
        try {
            const docRef = doc(db, this.collectionName, id);
            await updateDoc(docRef, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating pre-schedule:", error);
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
