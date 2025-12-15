export class FirebaseErrorHandler {
    /**
     * 統一處理 Firebase 或應用程式錯誤
     * @param {Error} error - 捕獲的錯誤物件
     * @param {string} context - 發生錯誤的上下文 (如: "Login", "LoadData")
     * @returns {Object} 標準化錯誤物件 { success: false, error: string }
     */
    static handle(error, context = 'Unknown') {
        let message = error.message;

        // Firebase 常見錯誤代碼對應 (可擴充)
        const errorMap = {
            'permission-denied': '您的權限不足，無法執行此操作。',
            'not-found': '請求的資料不存在。',
            'already-exists': '資料已存在，無法重複建立。',
            'network-request-failed': '網路連線失敗，請檢查您的網路狀態。',
            'unauthenticated': '您尚未登入或登入已過期，請重新登入。',
            'invalid-argument': '輸入參數無效，請檢查後再試。'
        };

        if (error.code && errorMap[error.code]) {
            message = errorMap[error.code];
        }

        console.error(`❌ Error [${context}]:`, error);
        
        // 可以在這裡加入全域錯誤提示 (如 Toast 或 Alert)
        // alert(`錯誤: ${message}`); 

        return { success: false, error: message };
    }
}
