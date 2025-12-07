import { SheetsService } from "../../services/sheets/SheetsService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; // 引入 UnitService

export class RuleSettings {
    constructor() {
        this.currentRules = {
            minStaff: { D: 5, E: 3, N: 2 },
            constraints: { noNtoD: true, noEtoD: true, maxWorkDays: 6 }
        };
        this.userUnitId = null;
        this.unitName = '未知單位';
    }

    async render() {
        // 1. 取得當前使用者的 Unit
        const currentUser = authService.getProfile();
        if (currentUser) {
            this.userUnitId = currentUser.unitId;
            // 查詢單位名稱
            const unit = await UnitService.getUnitById(this.userUnitId);
            if (unit) this.unitName = unit.unitName;
        }

        if (!this.userUnitId) {
            return `<div class="container"><h3 class="text-danger">錯誤：您沒有所屬單位，無法設定規則。</h3></div>`;
        }

        // 2. 載入設定
        const savedRules = await SheetsService.getLatestRules(this.userUnitId);
        if (savedRules) {
            this.currentRules = { 
                minStaff: { ...this.currentRules.minStaff, ...savedRules.minStaff },
                constraints: { ...this.currentRules.constraints, ...savedRules.constraints }
            };
        }

        const { minStaff, constraints } = this.currentRules;

        return `
            <div class="container">
                <h2><i class="fas fa-cogs"></i> 排班規則參數設定</h2>
                <span class="badge bg-info text-dark mb-3 fs-6">
                    <i class="fas fa-hospital"></i> 設定對象：${this.unitName}
                </span>
                
                <div class="card shadow-sm">
                    <div class="card-body">
                        <form id="rules-form">
                            <h4 class="border-bottom pb-2 mb-3 text-primary"><i class="fas fa-users"></i> 每日人力低限 (預設)</h4>
                            <div class="row mb-4">
                                <div class="col"><label>白班 (D)</label><input type="number" class="form-control" id="minStaffD" value="${minStaff.D}"></div>
                                <div class="col"><label>小夜 (E)</label><input type="number" class="form-control" id="minStaffE" value="${minStaff.E}"></div>
                                <div class="col"><label>大夜 (N)</label><input type="number" class="form-control" id="minStaffN" value="${minStaff.N}"></div>
                            </div>

                            <h4 class="border-bottom pb-2 mb-3 mt-4 text-primary"><i class="fas fa-ban"></i> 班別限制</h4>
                            <div class="mb-3"><label><input type="checkbox" id="avoidNtoD" ${constraints.noNtoD ? 'checked' : ''}> 禁止 N 接 D</label></div>
                            <div class="mb-3"><label><input type="checkbox" id="avoidEtoD" ${constraints.noEtoD ? 'checked' : ''}> 禁止 E 接 D</label></div>
                            <div class="mt-4"><label>最大連續上班天數</label><input type="number" class="form-control" id="maxConsecutiveDays" value="${constraints.maxWorkDays}" style="width:100px;"></div>

                            <div class="text-end mt-4 pt-3 border-top">
                                <button type="submit" class="btn btn-primary" id="btn-save-rules"><i class="fas fa-save"></i> 儲存設定</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const form = document.getElementById('rules-form');
        if(!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.userUnitId) return alert("無法辨識單位 ID");

            const btn = document.getElementById('btn-save-rules');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

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

            const result = await SheetsService.saveRules(newRules, this.userUnitId);
            
            if (result.success) alert('✅ 規則已更新至雲端！');
            else alert('❌ 失敗: ' + result.error);

            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存設定';
        });
    }
}
