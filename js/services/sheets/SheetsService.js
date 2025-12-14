// js/services/sheets/SheetsService.js

// ❗請將此處替換為您部署 Google Apps Script 後取得的 "Web App URL"
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwFgjSHAwzPgJh0UMhKw_HGZG-09Q6BOZ55LdlvmrDv9VIPpVkzkaFZbLD67aUQvjE/exec"; 

export class SheetsService {
    
    static async saveRules(rulesObj, unitId) {
        if (!unitId) return { success: false, error: "未指定 Unit ID" };
        
        // 將 unitId 塞入 payload
        const payload = { ...rulesObj, unitId: unitId };

        try {
            const response = await fetch(GAS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error("儲存失敗:", error);
            return { success: false, error: error.message };
        }
    }

    static async getLatestRules(unitId) {
        if (!unitId) return null;
        try {
            // 透過 GET 參數傳遞 unitId
            const response = await fetch(`${GAS_API_URL}?unitId=${unitId}`);
            const result = await response.json();
            
            if (result.status === 'success' && result.data) {
                return result.data;
            }
            return null;
        } catch (error) {
            console.error("讀取失敗:", error);
            return null;
        }
    }
}
