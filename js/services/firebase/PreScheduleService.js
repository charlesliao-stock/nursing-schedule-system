import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    static COLLECTION = 'pre_schedules';

    // 檢查是否存在
    static async checkPreScheduleExists(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);
            const snap = await getDoc(docRef);
            return snap.exists();
        } catch (e) { return false; }
    }

    // 建立 (初始化 submissions)
    static async createPreSchedule(data) {
        try {
            const db = firebaseService.getDb();
            const docId = `${data.unitId}_${data.year}_${String(data.month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);

            const submissions = {};
            data.staffIds.forEach(uid => {
                submissions[uid] = { submitted: false, wishes: {}, preferences: {} };
            });

            await setDoc(docRef, {
                ...data,
                submissions, 
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 更新設定 (不覆蓋 submissions)
    static async updatePreScheduleSettings(docId, data) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.COLLECTION, docId);
            
            await updateDoc(docRef, {
                settings: data.settings,
                staffIds: data.staffIds,
                staffSettings: data.staffSettings,
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    // 更新提交內容 (管理者審核用)
    static async updateSubmissions(docId, submissions) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.COLLECTION, docId);
            
            await updateDoc(docRef, {
                submissions: submissions,
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (e) { 
            console.error("更新 Submissions 失敗:", e);
            throw e; 
        }
    }

    // 更新狀態 (發布/關閉)
    static async updateStatus(unitId, year, month, status) {
        try {
            const db = firebaseService.getDb();
            const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);
            
            await updateDoc(docRef, {
                status: status,
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    static async getPreSchedulesList(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.COLLECTION), where("unitId", "==", unitId));
            const snapshot = await getDocs(q);
            const list = [];
            snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
            list.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
            return list;
        } catch (error) { return []; }
    }

    static async checkHasSubmissions(docId) {
        try {
            const db = firebaseService.getDb();
            const snap = await getDoc(doc(db, this.COLLECTION, docId));
            if (!snap.exists()) return false;
            const subs = snap.data().submissions || {};
            return Object.values(subs).some(s => s.submitted === true);
        } catch (e) { return false; }
    }

    static async deletePreSchedule(docId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.COLLECTION, docId));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    static async getPreSchedule(unitId, year, month) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        const db = firebaseService.getDb();
        const snap = await getDoc(doc(db, this.COLLECTION, docId));
        return snap.exists() ? snap.data() : null;
    }

    // ✅ 新增 preferences 參數並寫入 DB
    static async submitPersonalWish(unitId, year, month, uid, wishes, notes, preferences = {}) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        try {
            const db = firebaseService.getDb();
            const updatePath = `submissions.${uid}`;
            await updateDoc(doc(db, this.COLLECTION, docId), {
                [`${updatePath}.wishes`]: wishes,
                [`${updatePath}.notes`]: notes,
                [`${updatePath}.preferences`]: preferences, // 寫入偏好
                [`${updatePath}.submitted`]: true,
                [`${updatePath}.submittedAt`]: serverTimestamp()
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }
}
