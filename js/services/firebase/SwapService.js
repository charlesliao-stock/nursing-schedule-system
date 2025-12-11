import { 
    collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, or
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { ScheduleService } from "./ScheduleService.js";

export class SwapService {
    static getCollectionName() { return 'swap_requests'; }

    // 提交換班申請
    static async createRequest(data) {
        try {
            const db = firebaseService.getDb();
            const payload = {
                ...data,
                status: 'pending_target', // ✅ 初始狀態：等待對方同意
                createdAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, this.getCollectionName()), payload);
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 取得與我相關的申請 (發起 or 目標)
    static async getUserRequests(uid) {
        try {
            const db = firebaseService.getDb();
            // 查詢: 我是發起人 OR 我是目標
            const q = query(
                collection(db, this.getCollectionName()), 
                or(where("requestorId", "==", uid), where("targetId", "==", uid))
            );
            
            const snapshot = await getDocs(q);
            const list = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            
            // 前端排序
            list.sort((a,b) => b.createdAt - a.createdAt);
            return list;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    // ✅ 新增：取得待單位管理者審核的申請
    static async getManagerPendingRequests(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, this.getCollectionName()), 
                where("unitId", "==", unitId),
                where("status", "==", "pending_manager") // 只抓雙方已同意，等待管理的
            );
            const snapshot = await getDocs(q);
            const list = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            return list;
        } catch(e) { return []; }
    }

    // ✅ 新增：被換班者審核 (同意/拒絕)
    static async reviewByTarget(requestId, action) {
        // action: 'agree' | 'reject'
        try {
            const db = firebaseService.getDb();
            const ref = doc(db, this.getCollectionName(), requestId);
            
            const newStatus = action === 'agree' ? 'pending_manager' : 'rejected';
            
            await updateDoc(ref, {
                status: newStatus,
                targetResponseAt: serverTimestamp()
            });
            return { success: true };
        } catch(e) { return { success: false, error: e.message }; }
    }

    // ✅ 修改：管理者最終審核
    static async reviewByManager(requestId, action, managerId, requestData) {
        // action: 'approve' | 'reject'
        try {
            const db = firebaseService.getDb();
            const ref = doc(db, this.getCollectionName(), requestId);
            
            const newStatus = action === 'approve' ? 'approved' : 'rejected';

            if (newStatus === 'approved') {
                // 執行換班：寫入 Schedule
                const dateObj = new Date(requestData.date);
                const year = dateObj.getFullYear();
                const month = dateObj.getMonth() + 1;
                const day = dateObj.getDate();

                // 更新發起人
                await ScheduleService.updateShift(
                    requestData.unitId, year, month, 
                    requestData.requestorId, day, requestData.targetShift
                );
                // 更新對方
                await ScheduleService.updateShift(
                    requestData.unitId, year, month, 
                    requestData.targetId, day, requestData.requestorShift
                );
            }

            await updateDoc(ref, {
                status: newStatus,
                reviewedBy: managerId,
                reviewedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}
