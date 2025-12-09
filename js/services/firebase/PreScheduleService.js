import { 
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    getDocs, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";

export class PreScheduleService {
    static COLLECTION = 'pre_schedules';

    /**
     * 檢查預班表是否已存在 (用於新增前的防呆)
     */
    static async checkPreScheduleExists(unitId, year, month) {
        try {
            const db = firebaseService.getDb();
            const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);
            const snap = await getDoc(docRef);
            return snap.exists();
        } catch (e) { return false; }
    }

    /**
     * 取得單位的預班列表 (用於管理頁面列表顯示)
     */
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
            
            // 排序: 年份月份倒序 (新的在上面)
            list.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
            return list;
        } catch (error) {
            console.error("List fetch error:", error);
            return [];
        }
    }

    /**
     * 建立預班表 (初始化 submissions)
     */
    static async createPreSchedule(data) {
        try {
            const db = firebaseService.getDb();
            // ID 格式: UNIT_YYYY_MM (確保唯一)
            const docId = `${data.unitId}_${data.year}_${String(data.month).padStart(2,'0')}`;
            const docRef = doc(db, this.COLLECTION, docId);

            // 初始化 submissions 結構 (預先為名單內的人建立空位)
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
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 更新預班表設定 (編輯模式用)
     * 重要：此方法只更新 settings、staffIds 與 staffSettings，不會覆蓋已提交的 submissions
     */
    static async updatePreScheduleSettings(docId, data) {
        try {
            const db = firebaseService.getDb();
            const docRef = doc(db, this.COLLECTION, docId);
            
            await updateDoc(docRef, {
                settings: data.settings,
                staffIds: data.staffIds,
                staffSettings: data.staffSettings, // 包含該次預班的臨時組別
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    /**
     * 檢查是否有任何人員已提交資料 (刪除前檢查用)
     */
    static async checkHasSubmissions(docId) {
        try {
            const db = firebaseService.getDb();
            const snap = await getDoc(doc(db, this.COLLECTION, docId));
            if (!snap.exists()) return false;
            
            const data = snap.data();
            const subs = data.submissions || {};
            // 只要有一個人的 submitted 為 true，就回傳 true
            return Object.values(subs).some(s => s.submitted === true);
        } catch (e) { return false; }
    }

    /**
     * 刪除預班表
     */
    static async deletePreSchedule(docId) {
        try {
            const db = firebaseService.getDb();
            await deleteDoc(doc(db, this.COLLECTION, docId));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    /**
     * 取得單一預班表詳細資料 (一般人員填寫用 / 編輯回填用)
     */
    static async getPreSchedule(unitId, year, month) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        const db = firebaseService.getDb();
        const snap = await getDoc(doc(db, this.COLLECTION, docId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }

    /**
     * 提交個人預班需求
     */
    static async submitPersonalWish(unitId, year, month, uid, wishes, notes) {
        const docId = `${unitId}_${year}_${String(month).padStart(2,'0')}`;
        try {
            const db = firebaseService.getDb();
            // 使用 update 針對該使用者的路徑更新，避免覆蓋整份文件
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
