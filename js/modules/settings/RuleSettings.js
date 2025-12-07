import { SheetsService } from "../../services/sheets/SheetsService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class RuleSettings {
    constructor() {
        this.currentRules = { minStaff: { D: {}, E: {}, N: {} }, constraints: { maxWorkDays: 6 } };
        this.targetUnitId = null; // Fix: 重新命名變數，避免混淆
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        const units = await UnitService.getAllUnits();
        
        let unitSelector = '';
        
        if (isSystemAdmin) {
            // Fix: 管理員顯示下拉選單
            const options = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelector = `
                <div class="mb-4 d-flex align-items-center">
                    <label class="fw-bold me-2">選擇設定單位：</label>
                    <select id="rule-unit-select" class="form-select w-auto">
                        <option value="">請選擇...</option>
                        ${options}
                    </select>
                </div>`;
        } else {
            // 單位管理者：顯示固定名稱
            this.targetUnitId = user.unitId;
            const myUnit = units.find(u => u.unitId === user.unitId);
            const unitName = myUnit ? myUnit.unitName : '未知單位';
            unitSelector = `<span class="badge bg-info text-dark mb-3 fs-6"><i class="fas fa-hospital"></i> 設定對象：${unitName}</span>`;
        }

        return `
            <div class="container">
                <h2><i class="fas fa-cogs"></i> 排班規則設定</h2>
                ${unitSelector}
                
                <div id="rule-content" style="display: ${this.targetUnitId ? 'block' : 'none'};">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <form id="rules-form">
                                <h4 class="border-bottom pb-2 mb-3 text-primary">每日人力最低需求 (21格)</h4>
                                <div class="table-responsive mb-4">
                                    <table class="table table-bordered text-center table-sm align-middle">
                                        <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                        <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                    </table>
                                </div>
                                <h5 class="text-primary fw-bold mt-4 mb-3 border-bottom pb-2">其他限制</h5>
                                <div class="row align-items-center"><div class="col-auto"><label>最大連續上班</label></div><div class="col-auto"><input type="number" id="maxConsecutiveDays" class="form-control" value="6" style="width:100px;"></div></div>
                                <div class="text-end mt-4 pt-3 border-top"><button type="submit" class="btn btn-primary">儲存設定</button></div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRow(shift, label) {
        let html = `<tr><td class="fw-bold bg-light">${label}</td>`;
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            html += `<td><input type="number" class="form-control form-control-sm text-center req-input" data-shift="${shift}" data-day="${d}" value="0" min="0"></td>`;
        });
        return html + '</tr>';
    }

    async afterRender() {
        const unitSelect = document.getElementById('rule-unit-select');
        
        // 載入設定函式
        const loadRules = async (uid) => {
            if(!uid) {
                document.getElementById('rule-content').style.display = 'none';
                return;
            }
            this.targetUnitId = uid;
            const savedRules = await SheetsService.getLatestRules(uid);
            if (savedRules) {
                // 填入數值
                const minStaff = savedRules.minStaff || { D:{}, E:{}, N:{} };
                document.querySelectorAll('.req-input').forEach(input => {
                    input.value = minStaff[input.dataset.shift]?.[input.dataset.day] || 0;
                });
                document.getElementById('maxConsecutiveDays').value = savedRules.constraints?.maxWorkDays || 6;
            }
            document.getElementById('rule-content').style.display = 'block';
        };

        if (unitSelect) {
            unitSelect.addEventListener('change', (e) => loadRules(e.target.value));
        } else if (this.targetUnitId) {
            loadRules(this.targetUnitId);
        }

        document.getElementById('rules-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            // ... (儲存邏輯同前版，使用 this.targetUnitId) ...
            const minStaff = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                minStaff[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });
            const newRules = {
                minStaff: minStaff,
                constraints: {
                    maxWorkDays: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                    noNtoD: true, noEtoD: true
                }
            };
            const res = await SheetsService.saveRules(newRules, this.targetUnitId);
            if (res.success) alert('已儲存'); else alert('失敗');
        });
    }
}
