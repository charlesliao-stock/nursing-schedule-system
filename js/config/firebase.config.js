// js/config/firebase.config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    arrayUnion,
    arrayRemove,
    Timestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2B_rDKi7JyLaYpJd-lfFNXZ1BJUzpu-k",
    authDomain: "nursing-schedule-2f9c8.firebaseapp.com",
    projectId: "nursing-schedule-2f9c8",
    storageBucket: "nursing-schedule-2f9c8.firebasestorage.app",
    messagingSenderId: "561144664580",
    appId: "1:561144664580:web:3d4397a5cbd7f788b1db51",
    measurementId: "G-V0DBP9RZ7P"
};
// 初始化 App
let app;
let db;
let auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase Config Loaded, DB:", db); 
} catch (error) {
    console.error("Firebase Init Error:", error);
}

// ✅ 關鍵：匯出所有需要的 Firestore 函式，讓 Service 可以使用
export { 
    app, 
    db, 
    auth,
    // 匯出 Firestore 功能函式
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    arrayUnion,
    arrayRemove,
    Timestamp 
};
2. 服務層 js/services/firebase/PreScheduleService.js
修正重點： 移除了 Timestamp 的引用，全部改用 new Date()。

JavaScript

import { 
    db, 
    collection, 
    doc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    arrayUnion
} from "../../config/firebase.config.js";

class PreScheduleService {
    constructor() {
        this.collectionName = "pre_schedules";
    }

    // 取得特定單位的預班表清單
    async getPreSchedulesList(unitId) {
        try {
            const q = query(
                collection(db, this.collectionName),
                where("unitId", "==", unitId),
                orderBy("year", "desc"),
                orderBy("month", "desc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error getting pre-schedules list:", error);
            // 避免因為索引未建立導致卡死，回傳空陣列
            return [];
        }
    }

    // 取得單一預班表詳細資料
    async getPreSchedule(unitId, year, month) {
        try {
            const q = query(
                collection(db, this.collectionName),
                where("unitId", "==", unitId),
                where("year", "==", parseInt(year)),
                where("month", "==", parseInt(month))
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;
            
            const docSnap = snapshot.docs[0];
            return { id: docSnap.id, ...docSnap.data() };
        } catch (error) {
            console.error("Error getting pre-schedule:", error);
            throw error;
        }
    }

    // 檢查是否已存在
    async checkPreScheduleExists(unitId, year, month) {
        const schedule = await this.getPreSchedule(unitId, year, month);
        return !!schedule;
    }

    // 建立新預班表
    async createPreSchedule(data) {
        try {
            // 使用 unitId_year_month 作為 ID，確保唯一性且好搜尋
            const docId = `${data.unitId}_${data.year}_${data.month}`;
            const docRef = doc(db, this.collectionName, docId);
            
            const payload = {
                ...data,
                createdAt: new Date(), // 改用 new Date()
                updatedAt: new Date()
            };
            
            await setDoc(docRef, payload);
            return docId;
        } catch (error) {
            console.error("Error creating pre-schedule:", error);
            throw error;
        }
    }

    // 更新設定 (ManagePage 用)
    async updatePreScheduleSettings(id, data) {
        try {
            const docRef = doc(db, this.collectionName, id);
            await updateDoc(docRef, {
                settings: data.settings,
                staffIds: data.staffIds,
                staffSettings: data.staffSettings,
                supportStaffIds: data.supportStaffIds || [], // 確保支援人員欄位存在
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating settings:", error);
            throw error;
        }
    }

    // 刪除
    async deletePreSchedule(id) {
        try {
            await deleteDoc(doc(db, this.collectionName, id));
        } catch (error) {
            console.error("Error deleting pre-schedule:", error);
            throw error;
        }
    }

    // 個人提交預班 (SubmitPage 用)
    async submitPersonalWish(unitId, year, month, uid, wishes, notes = "", preferences = {}) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("預班表不存在");

            const docRef = doc(db, this.collectionName, schedule.id);
            const key = `submissions.${uid}`;
            
            await updateDoc(docRef, {
                [`${key}.wishes`]: wishes,
                [`${key}.note`]: notes,
                [`${key}.preferences`]: preferences,
                [`${key}.isSubmitted`]: true,
                [`${key}.updatedAt`]: new Date()
            });
        } catch (error) {
            console.error("Error submitting wish:", error);
            throw error;
        }
    }

    // 管理者儲存預班審核結果 (EditPage 用)
    async updatePreScheduleSubmissions(unitId, year, month, submissions) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("找不到該預班表，無法儲存");

            const docRef = doc(db, this.collectionName, schedule.id);
            
            // 全量更新 submissions 欄位
            await updateDoc(docRef, {
                submissions: submissions,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating submissions:", error);
            throw error;
        }
    }

    // 加入跨單位支援人員
    async addSupportStaff(unitId, year, month, uid) {
        try {
            const schedule = await this.getPreSchedule(unitId, year, month);
            if (!schedule) throw new Error("預班表不存在");

            const docRef = doc(db, this.collectionName, schedule.id);
            
            // 使用 arrayUnion 避免重複加入
            await updateDoc(docRef, {
                staffIds: arrayUnion(uid),        // 確保他出現在總名單
                supportStaffIds: arrayUnion(uid), // 標記為支援
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error adding support staff:", error);
            throw error;
        }
    }
}

export const PreScheduleServiceInstance = new PreScheduleService();
// 為了相容您目前的 import 方式，我們 export instance 作為 named export
export { PreScheduleServiceInstance as PreScheduleService };
