import { 
    db, 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    orderBy, 
    Timestamp 
} from "../../config/firebase.config.js";

class SwapService {
    constructor() {
        this.collectionName = "swap_requests";
    }

    // 提交新的換班申請
    async createSwapRequest(data) {
        try {
            const payload = {
                ...data,
                status: 'pending_target', // 初始狀態：等待被換班者審核
                createdAt: new Date(),
                history: [
                    { action: 'create', by: data.requesterId, at: new Date() }
                ]
            };
            
            const docRef = await addDoc(collection(db, this.collectionName), payload);
            return docRef.id;
        } catch (error) {
            console.error("Error creating swap request:", error);
            throw error;
        }
    }

    // 取得某人相關的換班申請 (不論是申請者或是目標對象)
    async getMySwapRequests(uid) {
        // 這裡需要複合查詢，為簡化示範，先抓取申請者是我的
        // 實際應用可能需要分別 query requesterId == uid OR targetId == uid
        try {
            const q = query(
                collection(db, this.collectionName),
                where("requesterId", "==", uid),
                orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching swap requests:", error);
            return [];
        }
    }
}

export const SwapServiceInstance = new SwapService();
export { SwapServiceInstance as SwapService };
