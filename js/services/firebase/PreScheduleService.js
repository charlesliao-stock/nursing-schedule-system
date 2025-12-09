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

    // 建立
    static async createPreSchedule(data) {
        try {
            const db = firebaseService.getDb();
            const docId = `${data.unitId}_${data.year}_${String(data.month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);

            const submissions = {};
            data.staffIds.forEach(uid => {
                submissions[uid] = { submitted: false, wishes: {} };
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

    // 更新設定 (保留 submissions)
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

    // 列表查詢
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

    // 其他方法保持不變 (delete, checkHasSubmissions, getPreSchedule...)
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

    static async submitPersonalWish(unitId, year, month, uid, wishes, notes) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        try {
            const db = firebaseService.getDb();
            const updatePath = `submissions.${uid}`;
            await updateDoc(doc(db, this.COLLECTION, docId), {
                [`${updatePath}.wishes`]: wishes,
                [`${updatePath}.notes`]: notes,
                [`${updatePath}.submitted`]: true,
                [`${updatePath}.submittedAt`]: serverTimestamp()
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }
}
