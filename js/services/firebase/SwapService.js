import { 
    collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "./FirebaseService.js";
import { ScheduleService } from "./ScheduleService.js";
import { NotificationService } from "./NotificationService.js";

export class SwapService {
    static getCollectionName() { return 'swap_requests'; }

    static async createRequest(data) {
        try {
            const db = firebaseService.getDb();
            const payload = {
                ...data,
                status: 'pending', // 統一為 pending，由管理者審核
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, this.getCollectionName()), payload);
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }

    // ✅ 修復：確保此方法被導出且名稱正確
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
            // 若索引未建立，firebase 會報錯，這裡僅 console
            console.error("Get pending requests failed:", error);
            return [];
        }
    }

    static async getUserRequests(userId) {
        try {
            const db = firebaseService.getDb();
            const q = query(collection(db, this.getCollectionName()), where("requestorId", "==", userId));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) { return []; }
    }

    static async reviewRequest(requestId, status, reviewerId, requestData) {
        try {
            const db = firebaseService.getDb();
            const requestRef = doc(db, this.getCollectionName(), requestId);

            if (status === 'approved') {
                const dateObj = new Date(requestData.date);
                await ScheduleService.updateShift(requestData.unitId, dateObj.getFullYear(), dateObj.getMonth()+1, requestData.requestorId, dateObj.getDate(), requestData.targetShift);
                await ScheduleService.updateShift(requestData.unitId, dateObj.getFullYear(), dateObj.getMonth()+1, requestData.targetId, dateObj.getDate(), requestData.requestorShift);
            }

            await updateDoc(requestRef, { status: status, reviewedBy: reviewerId, reviewedAt: serverTimestamp() });
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }
}
