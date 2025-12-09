import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    static COLLECTION = 'pre_schedules';

    // 取得單位的預班列表 (用於管理頁面)
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
            // 排序 (新月份在前)
            list.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
            return list;
        } catch (error) {
            console.error("List fetch error:", error);
            return [];
        }
    }

    // 建立/覆蓋預班表
    static async createPreSchedule(data) {
        try {
            const db = firebaseService.getDb();
            // ID 格式: UNIT_YYYY_MM (確保唯一)
            const docId = `${data.unitId}_${data.year}_${String(data.month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);

            // 初始化 submissions 結構
            const submissions = {};
            // 預先為名單內的人建立空位
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
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 檢查是否有提交資料
    static async checkHasSubmissions(docId) {
        try {
            const db = firebaseService.getDb();
            const docSnap = await getDoc(doc(db, this.COLLECTION, docId));
            if (!docSnap.exists()) return false;
            
            const data = docSnap.data();
            const subs = data.submissions || {};
            // 檢查是否有任何人的 submitted 為 true
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

    // 更新設定
    static async updateSettings(unitId, year, month, settings) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        try {
            const db = firebaseService.getDb();
            await updateDoc(doc(db, this.COLLECTION, docId), { 
                settings: settings, 
                updatedAt: serverTimestamp() 
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    // (保留原本的 getPreSchedule, submitPersonalWish 等方法，請勿刪除)
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
