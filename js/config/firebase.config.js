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
