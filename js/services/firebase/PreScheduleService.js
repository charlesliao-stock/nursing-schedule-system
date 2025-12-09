import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    static COLLECTION = 'pre_schedules';

    // 取得列表
    static async getPreSchedulesList(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, this.COLLECTION),
                where("unitId", "==", unitId)
            );
            const snapshot = await getDocs(q);
            const list = [];
            snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
            // 依月份倒序
            list.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
            return list;
        } catch (error) { return []; }
    }

    // 建立/更新
    static async createPreSchedule(data) {
        try {
            const db = firebaseService.getDb();
            const docId = `${data.unitId}_${data.year}_${String(data.month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);

            // 初始化提交狀態
            const submissions = {};
            data.staffIds.forEach(uid => {
                // 若已有資料則保留，否則初始化
                submissions[uid] = { submitted: false, wishes: {} };
            });

            await setDoc(docRef, {
                ...data,
                submissions, // 注意：這會覆蓋舊的 submissions，若要保留舊的需先讀取再 merge，但"新增"通常是全新的
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // 取得單一文件
    static async getPreSchedule(unitId, year, month) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        const db = firebaseService.getDb();
        const snap = await getDoc(doc(db, this.COLLECTION, docId));
        return snap.exists() ? snap.data() : null;
    }

    // 檢查是否有提交
    static async checkHasSubmissions(docId) {
        try {
            const db = firebaseService.getDb();
            const snap = await getDoc(doc(db, this.COLLECTION, docId));
            if (!snap.exists()) return false;
            const subs = snap.data().submissions || {};
            return Object.values(subs).some(s => s.submitted === true);
        } catch (e) { return false; }
    }

    // 刪除
    static async deletePreSchedule(docId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.COLLECTION, docId));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    // 提交個人需求 (保持不變)
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
