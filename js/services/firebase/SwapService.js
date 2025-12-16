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
                targetUserId: data.targetUserId, // 確保此欄位有值
                status: 'pending_target', 
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await setDoc(newDocRef, payload);
            return newDocRef.id;
        } catch (error) { throw error; }
    }

    // 2. 取得申請紀錄 (我發起的)
    static async getMyAppliedRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, "swap_requests"), where("requesterId", "==", uid));
            const snap = await getDocs(q);
            return snap.docs.map(d => d.data()).sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        } catch (e) { return []; }
    }

    // 3. 取得待審核項目 (別人發給我的)
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
            return snap.docs.map(d => d.data()).sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        } catch (e) { 
            console.error("getIncomingRequests error:", e);
            return []; 
        }
    }

    // 4. 取得管理者待審項目
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
        } catch (e) { return []; }
    }

    // 5. [新功能] 取得待辦計數 (用於儀表板)
    static async getPendingCounts(uid, unitId, isManager) {
        const result = { targetPending: 0, managerPending: 0 };
        try {
            // A. 個人待審
            const myReqs = await this.getIncomingRequests(uid);
            result.targetPending = myReqs.length;

            // B. 管理者待審
            if (isManager && unitId) {
                const mgrReqs = await this.getManagerPendingRequests(unitId);
                result.managerPending = mgrReqs.length;
            }
        } catch (e) { console.error(e); }
        return result;
    }

    // 6. 審核動作
    static async reviewByTarget(requestId, action) {
        const db = firebaseService.getDb();
        const ref = doc(db, "swap_requests", requestId);
        const newStatus = action === 'agree' ? 'pending_manager' : 'rejected';
        await updateDoc(ref, { status: newStatus, targetReviewTime: serverTimestamp() });
    }

    static async reviewByManager(requestId, action, managerId, requestData) {
        const db = firebaseService.getDb();
        const ref = doc(db, "swap_requests", requestId);
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        
        await updateDoc(ref, { 
            status: newStatus, 
            managerId, 
            managerReviewTime: serverTimestamp() 
        });

        if (action === 'approve') {
            await this.applySwapToSchedule(requestData);
        }
    }

    static async applySwapToSchedule(req) {
        const { unitId, year, month, requesterId, requesterShift, targetUserId, targetShift, requesterDate } = req;
        const day = parseInt(requesterDate.split('-')[2]);

        const schedule = await ScheduleService.getSchedule(unitId, year, month);
        if (!schedule) throw new Error("無班表");

        const assignments = schedule.assignments || {};
        if (!assignments[requesterId]) assignments[requesterId] = {};
        if (!assignments[targetUserId]) assignments[targetUserId] = {};

        assignments[requesterId][day] = targetShift;
        assignments[targetUserId][day] = requesterShift;

        await ScheduleService.updateAllAssignments(unitId, year, month, assignments, schedule.prevAssignments);
    }
}
