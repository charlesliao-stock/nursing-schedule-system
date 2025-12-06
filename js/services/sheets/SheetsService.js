// js/services/sheets/SheetsService.js

// ❗請將此處替換為您部署 Google Apps Script 後取得的 "Web App URL"
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwFgjSHAwzPgJh0UMhKw_HGZG-09Q6BOZ55LdlvmrDv9VIPpVkzkaFZbLD67aUQvjE/exec"; 

export class SheetsService {
    
    /**
     * 儲存排班規則
     * @param {Object} rulesObj - 前端產生的規則物件
     */
    static async saveRules(rulesObj) {
        if (GAS_API_URL.includes("您的ID")) {
            alert("請先設定 SheetsService.js 中的 GAS_API_URL！");
            return { success: false, error: "API URL 未設定" };
        }

        try {
            // 使用 text/plain 避免 CORS 預檢請求 (Preflight)
            const response = await fetch(GAS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(rulesObj)
            });

            const result = await response.json();
            if (result.status === 'success') {
                return { success: true, message: result.message };
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error("儲存規則失敗:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 讀取最新的排班規則
     */
    static async getLatestRules() {
        if (GAS_API_URL.includes("您的ID")) return null;

        try {
            const response = await fetch(GAS_API_URL);
            const result = await response.json();
            
            if (result.status === 'success' && result.data) {
                return result.data;
            }
            return null; // 無資料或讀取失敗
        } catch (error) {
            console.error("讀取規則失敗:", error);
            return null;
        }
    }
}
