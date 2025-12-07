import { 
    collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, orderBy, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { ScheduleService } from "./ScheduleService.js";
import { NotificationService } from "./NotificationService.js";

export class SwapService {
    static getCollectionName() { return 'swap_requests'; }

    /**
     * 提交換班申請
     */
    static async createRequest(data) {
        try {
            const db = firebaseService.getDb();
            const payload = {
                ...data,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, this.getCollectionName()), payload);
            
            // 通知管理者 (簡化：通知所有人，實務上應查閱 Unit Managers)
            NotificationService.send('manager', '新換班申請', `${data.requestorName} 申請與 ${data.targetName} 換班`);
            
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 取得某單位的待審核申請
     */
    static async getPendingRequests(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, this.getCollectionName()), 
                where("unitId", "==", unitId),
                where("status", "==", "pending"),
                orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    /**
     * 取得個人的申請紀錄
     */
    static async getUserRequests(userId) {
        try {
            const db = firebaseService.getDb();
            // Firestore OR 查詢限制較多，這裡簡單查發起人
            const q = query(
                collection(db, this.getCollectionName()), 
                where("requestorId", "==", userId),
                orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    /**
     * 審核申請 (核准或駁回)
     * 若核准，需連動更新 Schedule
     */
    static async reviewRequest(requestId, status, reviewerId, requestData) {
        try {
            const db = firebaseService.getDb();
            const requestRef = doc(db, this.getCollectionName(), requestId);

            if (status === 'rejected') {
                await updateDoc(requestRef, {
                    status: 'rejected',
                    reviewedBy: reviewerId,
                    reviewedAt: serverTimestamp()
                });
                NotificationService.send(requestData.requestorId, '換班駁回', '您的換班申請已被駁回', 'error');
                return { success: true };
            }

            if (status === 'approved') {
                // 1. 執行換班邏輯 (呼叫 ScheduleService)
                const dateObj = new Date(requestData.date);
                const year = dateObj.getFullYear();
                const month = dateObj.getMonth() + 1;
                const day = dateObj.getDate();

                // 更新發起人的班
                await ScheduleService.updateShift(
                    requestData.unitId, year, month, 
                    requestData.requestorId, day, requestData.targetShift
                );

                // 更新對方的班
                await ScheduleService.updateShift(
                    requestData.unitId, year, month, 
                    requestData.targetId, day, requestData.requestorShift
                );

                // 2. 更新申請單狀態
                await updateDoc(requestRef, {
                    status: 'approved',
                    reviewedBy: reviewerId,
                    reviewedAt: serverTimestamp()
                });

                NotificationService.send(requestData.requestorId, '換班通過', '您的換班申請已核准', 'success');
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}
