import { firebaseService } from "./FirebaseService.js";
import { 
    collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ScheduleService } from "./ScheduleService.js";

export class SwapService {

    // 1. 提交新的換班申請
    static async createSwapRequest(data) {
        try {
            const db = firebaseService.getDb();
            // 自動產生 ID
            const newDocRef = doc(collection(db, "swap_requests"));
            
            const payload = {
                ...data,
                id: newDocRef.id,
                // 確保欄位統一使用 targetUserId
                targetUserId: data.targetUserId || data.targetId, 
                status: 'pending_target', // 初始狀態：待同事同意
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

    // 2. 取得「與我相關」的換班 (修正：移除 orderBy 避免索引問題)
    static async getUserRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const colRef = collection(db, "swap_requests");

            console.log("正在查詢換班資料，目標用戶 UID:", uid);

            // 修正重點：只用 where，移除 orderBy (改用 JS 排序)，確保不需索引也能運作
            const q = query(colRef, where("targetUserId", "==", uid));
            
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(d => d.data());

            // 如果查不到，嘗試查舊欄位名稱 targetId (相容性)
            if (list.length === 0) {
                const q2 = query(colRef, where("targetId", "==", uid));
                const snap2 = await getDocs(q2);
                list.push(...snap2.docs.map(d => d.data()));
            }

            console.log(`查詢成功，共找到 ${list.length} 筆與我相關的換班`);

            // 在前端進行排序 (日期新 -> 舊)
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
            // 同樣移除 orderBy，改在前端排序
            const q = query(
                collection(db, "swap_requests"),
                where("unitId", "==", unitId),
                where("status", "==", "pending_manager")
            );
            
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(d => d.data());

            return list.sort((a, b) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tA - tB; // 管理者通常處理最舊的申請 (先進先出)
            });
        } catch (error) {
            console.error("getManagerPendingRequests Error:", error);
            return [];
        }
    }

    // 4. 個人(被換班者) 審核動作
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

    // 5. 管理者 審核動作 (核准後修正班表)
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
        // 解構欄位
        const { unitId, year, month, requesterId, requesterShift, targetUserId, targetId, targetShift, requesterDate } = req;
        const targetUser = targetUserId || targetId; // 相容舊欄位

        const day = parseInt(requesterDate.split('-')[2]);

        const schedule = await ScheduleService.getSchedule(unitId, year, month);
        if (!schedule || !schedule.assignments) throw new Error("找不到當月班表");

        const assignments = schedule.assignments;

        // 申請人那天 -> 變成對方的班
        if (!assignments[requesterId]) assignments[requesterId] = {};
        assignments[requesterId][day] = targetShift;

        // 對方那天 -> 變成申請人的班
        if (!assignments[targetUser]) assignments[targetUser] = {};
        assignments[targetUser][day] = requesterShift;

        await ScheduleService.updateAllAssignments(unitId, year, month, assignments, schedule.prevAssignments);
    }
}
