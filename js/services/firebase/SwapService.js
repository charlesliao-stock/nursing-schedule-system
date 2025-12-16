import { firebaseService } from "./FirebaseService.js";
import { 
    collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ScheduleService } from "./ScheduleService.js";

export class SwapService {

    // 1. 提交申請
    static async createSwapRequest(data) {
        try {
            const db = firebaseService.getDb();
            const newDocRef = doc(collection(db, "swap_requests"));
            
            const payload = {
                ...data,
                id: newDocRef.id,
                // 確保寫入 targetUserId (新標準)
                targetUserId: data.targetUserId || data.targetId,
                status: 'pending_target', 
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await setDoc(newDocRef, payload);
            return newDocRef.id;
        } catch (error) { throw error; }
    }

    // 2. 取得「與我相關」的換班 (包含：我是申請人 OR 我是目標對象)
    static async getUserRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const colRef = collection(db, "swap_requests");

            console.log("【SwapService】查詢 UID:", uid);

            // 修正：分別查詢 targetUserId (新) 與 targetId (舊)，確保不漏資料
            // Firestore 不支援 OR 查詢，故分開查
            const q1 = query(colRef, where("targetUserId", "==", uid));
            const q2 = query(colRef, where("targetId", "==", uid));
            const q3 = query(colRef, where("requesterId", "==", uid)); // 順便查我申請的

            const [snap1, snap2, snap3] = await Promise.all([
                getDocs(q1), getDocs(q2), getDocs(q3)
            ]);

            // 合併並去重
            const map = new Map();
            [...snap1.docs, ...snap2.docs, ...snap3.docs].forEach(d => {
                map.set(d.id, d.data());
            });

            const list = Array.from(map.values());
            console.log("【SwapService】共找到相關資料:", list.length);

            // 前端排序 (日期新 -> 舊)
            return list.sort((a, b) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA; 
            });

        } catch (error) {
            console.error("getUserRequests Error:", error);
            return [];
        }
    }

    // 3. 取得「單位管理者」需審核的清單
    static async getManagerPendingRequests(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, "swap_requests"),
                where("unitId", "==", unitId),
                where("status", "==", "pending_manager")
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (error) { return []; }
    }

    // 4. 個人(被換班者) 審核
    static async reviewByTarget(requestId, action) {
        try {
            const db = firebaseService.getDb();
            const ref = doc(db, "swap_requests", requestId);
            
            const newStatus = action === 'agree' ? 'pending_manager' : 'rejected';
            
            await updateDoc(ref, {
                status: newStatus,
                targetReviewTime: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) { throw error; }
    }

    // 5. 管理者 審核 (核准後修正班表)
    static async reviewByManager(requestId, action, managerId, requestData) {
        try {
            const db = firebaseService.getDb();
            const ref = doc(db, "swap_requests", requestId);
            const newStatus = action === 'approve' ? 'approved' : 'rejected';

            await updateDoc(ref, {
                status: newStatus,
                managerId: managerId,
                managerReviewTime: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            if (action === 'approve') {
                await this.applySwapToSchedule(requestData);
            }
            return true;
        } catch (error) { throw error; }
    }

    // 6. 寫入 Schedule
    static async applySwapToSchedule(req) {
        // 相容新舊欄位
        const { unitId, year, month, requesterId, requesterShift, targetUserId, targetId, targetShift, requesterDate } = req;
        const targetUser = targetUserId || targetId;

        const day = parseInt(requesterDate.split('-')[2]);

        const schedule = await ScheduleService.getSchedule(unitId, year, month);
        if (!schedule || !schedule.assignments) throw new Error("找不到當月班表");

        const assignments = schedule.assignments;

        if (!assignments[requesterId]) assignments[requesterId] = {};
        assignments[requesterId][day] = targetShift;

        if (!assignments[targetUser]) assignments[targetUser] = {};
        assignments[targetUser][day] = requesterShift;

        await ScheduleService.updateAllAssignments(unitId, year, month, assignments, schedule.prevAssignments);
    }
}
