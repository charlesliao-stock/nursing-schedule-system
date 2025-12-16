import { firebaseService } from "./FirebaseService.js";
import { 
    collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ScheduleService } from "./ScheduleService.js";

export class SwapService {

    // 1. 提交申請 (建立多筆)
    static async createSwapRequest(data) {
        try {
            const db = firebaseService.getDb();
            const newDocRef = doc(collection(db, "swap_requests"));
            
            const payload = {
                ...data,
                id: newDocRef.id,
                // 統一關鍵欄位名稱
                requesterId: data.requesterId,
                targetUserId: data.targetUserId, 
                unitId: data.unitId,
                status: 'pending_target', // 初始狀態
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await setDoc(newDocRef, payload);
            return newDocRef.id;
        } catch (error) { throw error; }
    }

    // 2. 取得「我發起的」申請 (用於 ApplyPage 下方的歷史紀錄)
    static async getMyAppliedRequests(uid) {
        try {
            const db = firebaseService.getDb();
            // 查詢 requesterId == 我
            const q = query(collection(db, "swap_requests"), where("requesterId", "==", uid));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => d.data());
            
            // 前端排序
            return list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        } catch (error) { return []; }
    }

    // 3. 取得「待我審核」的申請 (用於 ReviewPage - 個人)
    static async getIncomingRequests(uid) {
        try {
            const db = firebaseService.getDb();
            // 查詢 targetUserId == 我 且 status == pending_target
            const q = query(
                collection(db, "swap_requests"), 
                where("targetUserId", "==", uid),
                where("status", "==", "pending_target")
            );
            
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data());
        } catch (error) { return []; }
    }

    // 4. 取得「待管理者核准」的申請 (用於 ReviewPage - 管理者)
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

    // 5. 個人審核 (同意/拒絕)
    static async reviewByTarget(requestId, action) {
        const db = firebaseService.getDb();
        const ref = doc(db, "swap_requests", requestId);
        const newStatus = action === 'agree' ? 'pending_manager' : 'rejected';
        
        await updateDoc(ref, {
            status: newStatus,
            targetReviewTime: serverTimestamp()
        });
    }

    // 6. 管理者審核 (核准/駁回) -> 核准則寫入班表
    static async reviewByManager(requestId, action, managerId, requestData) {
        const db = firebaseService.getDb();
        const ref = doc(db, "swap_requests", requestId);
        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        await updateDoc(ref, {
            status: newStatus,
            managerId: managerId,
            managerReviewTime: serverTimestamp()
        });

        if (action === 'approve') {
            await this.applySwapToSchedule(requestData);
        }
    }

    // 7. 寫入 Schedule (同前版)
    static async applySwapToSchedule(req) {
        const { unitId, year, month, requesterId, requesterShift, targetUserId, targetShift, requesterDate } = req;
        const day = parseInt(requesterDate.split('-')[2]);

        const schedule = await ScheduleService.getSchedule(unitId, year, month);
        if (!schedule) throw new Error("班表不存在");

        const assignments = schedule.assignments || {};
        if (!assignments[requesterId]) assignments[requesterId] = {};
        if (!assignments[targetUserId]) assignments[targetUserId] = {};

        assignments[requesterId][day] = targetShift;
        assignments[targetUserId][day] = requesterShift;

        await ScheduleService.updateAllAssignments(unitId, year, month, assignments, schedule.prevAssignments);
    }
}
