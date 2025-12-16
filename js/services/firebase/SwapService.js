import { firebaseService } from "./FirebaseService.js";
import { 
    collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy 
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
                targetUserId: data.targetUserId || data.targetId,
                status: 'pending_target', 
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await setDoc(newDocRef, payload);
            return newDocRef.id;
        } catch (error) {
            console.error("Error creating swap request:", error);
            throw error;
        }
    }

    // 2. [关键修正] 取得「我發起的」申請 (用於 SwapApplyPage 的歷史紀錄)
    static async getMyAppliedRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const colRef = collection(db, "swap_requests");
            
            // 查詢條件：requesterId 是我
            const q = query(colRef, where("requesterId", "==", uid));
            
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(d => d.data());

            // 前端排序 (新 -> 舊)
            return list.sort((a, b) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA; 
            });
        } catch (error) {
            console.error("getMyAppliedRequests Error:", error);
            return [];
        }
    }

    // 3. 取得「待我審核」的申請 (用於 SwapReviewPage - 我是被換班者)
    // 註：這與 getMyAppliedRequests 不同，這是別人發給我的
    static async getIncomingRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const colRef = collection(db, "swap_requests");

            // 查詢條件：targetUserId 是我
            const q1 = query(colRef, where("targetUserId", "==", uid));
            // 相容舊資料
            const q2 = query(colRef, where("targetId", "==", uid));

            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            
            // 合併去重
            const map = new Map();
            [...snap1.docs, ...snap2.docs].forEach(d => map.set(d.id, d.data()));
            
            const list = Array.from(map.values());

            return list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        } catch (error) {
            console.error("getIncomingRequests Error:", error);
            return [];
        }
    }

    // 為了相容舊程式碼，保留 getUserRequests (指向 getIncomingRequests)
    static async getUserRequests(uid) {
        return this.getIncomingRequests(uid);
    }

    // 4. 取得「單位管理者」需審核的清單
    static async getManagerPendingRequests(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, "swap_requests"),
                where("unitId", "==", unitId),
                where("status", "==", "pending_manager")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => d.data());
        } catch (error) {
            console.error("getManagerPendingRequests Error:", error);
            return [];
        }
    }

    // 5. 個人審核動作
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

    // 6. 管理者審核動作
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

    // 7. 寫入 Schedule
    static async applySwapToSchedule(req) {
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
