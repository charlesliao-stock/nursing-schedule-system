// js/modules/settings/RuleSettings.js
import { SheetsService } from "../../services/sheets/SheetsService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class RuleSettings {
    constructor() {
        // 預設值
        this.currentRules = {
            minStaff: { D: 5, E: 3, N: 2 },
            constraints: { noNtoD: true, noEtoD: true, maxWorkDays: 6 }
        };
    }

    async render() {
        // 嘗試從 Google Sheets 載入舊設定
        const savedRules = await SheetsService.getLatestRules();
        if (savedRules) {
            this.currentRules = savedRules;
        }

        const { minStaff, constraints } = this.currentRules;

        return `
            <div class="container">
                <h2><i class="fas fa-cogs"></i> 排班規則參數設定</h2>
                <p class="text-muted">這些設定將影響 AI 自動排班的邏輯與驗證規則。</p>
                
                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem; max-width: 800px;">
                    <form id="rules-form">
                        
                        <h4 class="border-bottom pb-2 mb-3 text-primary">
                            <i class="fas fa-users"></i> 每日人力低限 (Min Staff)
                        </h4>
                        <div class="row mb-4" style="display:flex; gap:20px;">
                            <div class="col" style="flex:1">
                                <label class="form-label fw-bold">白班 (D)</label>
                                <input type="number" class="form-control" id="minStaffD" value="${minStaff.D}" min="0" style="width:100%; padding:8px;">
                            </div>
                            <div class="col" style="flex:1">
                                <label class="form-label fw-bold">小夜 (E)</label>
                                <input type="number" class="form-control" id="minStaffE" value="${minStaff.E}" min="0" style="width:100%; padding:8px;">
                            </div>
                            <div class="col" style="flex:1">
                                <label class="form-label fw-bold">大夜 (N)</label>
                                <input type="number" class="form-control" id="minStaffN" value="${minStaff.N}" min="0" style="width:100%; padding:8px;">
                            </div>
                        </div>

                        <h4 class="border-bottom pb-2 mb-3 mt-4 text-primary">
                            <i class="fas fa-ban"></i> 班別限制 (Constraints)
                        </h4>
                        
                        <div class="mb-3">
                            <label style="display:flex; align-items:center; cursor:pointer; font-size:1.1rem;">
                                <input type="checkbox" id="avoidNtoD" ${constraints.noNtoD ? 'checked' : ''} style="width:20px; height:20px; margin-right:10px;">
                                禁止 大夜(N) 接 白班(D)
                            </label>
                            <small class="text-muted" style="margin-left:30px;">避免違反勞基法間隔 11 小時規定</small>
                        </div>

                        <div class="mb-3">
                            <label style="display:flex; align-items:center; cursor:pointer; font-size:1.1rem;">
                                <input type="checkbox" id="avoidEtoD" ${constraints.noEtoD ? 'checked' : ''} style="width:20px; height:20px; margin-right:10px;">
                                禁止 小夜(E) 接 白班(D)
                            </label>
                            <small class="text-muted" style="margin-left:30px;">避免護理人員睡眠不足 (花花班)</small>
                        </div>
                        
                        <div class="mt-4">
                             <label class="form-label fw-bold">最大連續上班天數</label>
                             <input type="number" class="form-control" id="maxConsecutiveDays" value="${constraints.maxWorkDays}" min="1" max="14" style="width:100px; padding:8px;">
                             <small class="text-muted">超過此天數將觸發違規警告 (通常為 6 或 7)</small>
                        </div>

                        <div style="margin-top: 40px; text-align: right; border-top: 1px solid #eee; padding-top: 20px;">
                            <button type="button" class="btn-secondary" onclick="history.back()" style="margin-right: 10px;">取消</button>
                            <button type="submit" class="btn-primary" id="btn-save-rules">
                                <i class="fas fa-save"></i> 儲存並套用
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const form = document.getElementById('rules-form');
        const saveBtn = document.getElementById('btn-save-rules');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 1. 鎖定按鈕
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 傳送中...';
            saveBtn.disabled = true;

            // 2. 蒐集資料
            const newRules = {
                minStaff: {
                    D: parseInt(document.getElementById('minStaffD').value) || 0,
                    E: parseInt(document.getElementById('minStaffE').value) || 0,
                    N: parseInt(document.getElementById('minStaffN').value) || 0
                },
                constraints: {
                    noNtoD: document.getElementById('avoidNtoD').checked,
                    noEtoD: document.getElementById('avoidEtoD').checked,
                    maxWorkDays: parseInt(document.getElementById('maxConsecutiveDays').value) || 6
                }
            };

            try {
                // 3. 呼叫 Service
                const result = await SheetsService.saveRules(newRules);

                if (result.success) {
                    alert('✅ 規則已成功備份至 Google Sheets！');
                } else {
                    alert('❌ 儲存失敗: ' + result.error);
                }
            } catch (error) {
                console.error(error);
                alert('❌ 系統發生錯誤');
            } finally {
                // 4. 解鎖按鈕
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        });
    }
}
