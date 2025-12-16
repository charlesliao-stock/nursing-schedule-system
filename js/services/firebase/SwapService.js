import { firebaseService } from "./FirebaseService.js";
import { 
    collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ScheduleService } from "./ScheduleService.js";

export class SwapService {

    // 1. 提交新的換班申請
    static async createSwapRequest(data) {
        try {
            const db = firebaseService.getDb();
            // 使用 doc() 自動產生 ID，以便後續 setDoc 使用
            const newDocRef = doc(collection(db, "swap_requests"));
            
            const payload = {
                ...data,
                id: newDocRef.id,
                status: 'pending_target', // 初始狀態：等待被換班者審核
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

    // 2. 取得「與我相關」的換班 (包含：我是申請人 OR 我是目標對象)
    static async getUserRequests(uid) {
        try {
            const db = firebaseService.getDb();
            const colRef = collection(db, "swap_requests");

            // Firestore 不支援直接 OR 查詢，故拆成兩次查詢後合併 (或僅查 Target 供審核用)
            // 這裡為了完整性，我們查詢 "我是目標對象" 的 (因為這是審核頁面最需要的)
            const qTarget = query(colRef, where("targetUserId", "==", uid), orderBy("createdAt", "desc"));
            
            // 若也想看自己申請的進度，可再查 requesterId，這裡先專注於 "待我審核"
            const snapshot = await getDocs(qTarget);
            return snapshot.docs.map(d => d.data());
        } catch (error) {
            console.error("Error fetching user requests:", error);
            // 若因缺少索引報錯，回傳空陣列以免卡住 UI
            return [];
        }
    }

    // 3. 取得「單位管理者」需審核的清單 (狀態 = pending_manager)
    static async getManagerPendingRequests(unitId) {
        try {
            const db = firebaseService.getDb();
            const q = query(
                collection(db, "swap_requests"),
                where("unitId", "==", unitId),
                where("status", "==", "pending_manager"), // 雙方已同意，等待主管
                orderBy("createdAt", "asc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => d.data());
        } catch (error) {
            console.error("Error fetching manager requests:", error);
            return [];
        }
    }

    // 4. 個人(被換班者) 審核動作
    static async reviewByTarget(requestId, action) {
        try {
            const db = firebaseService.getDb();
            const ref = doc(db, "swap_requests", requestId);
            
            // agree -> 轉給主管審核 (pending_manager)
            // deny  -> 結案 (rejected)
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

            // 更新申請單狀態
            await updateDoc(ref, {
                status: newStatus,
                managerId: managerId,
                managerReviewTime: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // 如果核准，執行班表修改
            if (action === 'approve') {
                await this.applySwapToSchedule(requestData);
            }
            return true;
        } catch (error) { throw error; }
    }

    // 6. 內部邏輯：將換班結果寫入 Schedule
    static async applySwapToSchedule(req) {
        // req 包含: unitId, year, month, requesterId, requesterShift, targetUserId, targetShift, requesterDate...
        const { unitId, year, month, requesterId, requesterShift, targetUserId, targetShift, requesterDate } = req;
        
        // 從日期字串 (YYYY-MM-DD) 取得日 (day)
        const day = parseInt(requesterDate.split('-')[2]);

        // 讀取當月班表
        const schedule = await ScheduleService.getSchedule(unitId, year, month);
        if (!schedule || !schedule.assignments) throw new Error("找不到當月班表，無法寫入");

        const assignments = schedule.assignments;

        // --- 執行交換邏輯 ---
        // 申請人那天 -> 變成對方的班
        if (!assignments[requesterId]) assignments[requesterId] = {};
        assignments[requesterId][day] = targetShift;

        // 對方那天 -> 變成申請人的班
        if (!assignments[targetUserId]) assignments[targetUserId] = {};
        assignments[targetUserId][day] = requesterShift;

        // 寫回資料庫 (確保帶上 prevAssignments 防止資料遺失)
        await ScheduleService.updateAllAssignments(unitId, year, month, assignments, schedule.prevAssignments);
    }
}
