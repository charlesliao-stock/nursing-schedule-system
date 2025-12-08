import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() {
        this.targetUnitId = null;
    }

    async render() {
        const user = authService.getProfile();
        // ✅ 關鍵：只要真實身分是管理員，就開啟切換功能
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let unitSelector = '';
        if (isAdmin) {
            unitSelector = `
                <div class="mb-4 d-flex align-items-center bg-light p-2 rounded border">
                    <label class="fw-bold me-2 text-danger mb-0"><i class="fas fa-user-shield"></i> 管理員/模擬模式：</label>
                    <select id="rule-unit-select" class="form-select form-select-sm w-auto">
                        <option value="">載入單位中...</option>
                    </select>
                </div>`;
        } else {
            this.targetUnitId = user.unitId;
            unitSelector = `
                <div class="mb-4">
                    <span class="badge bg-info text-dark fs-6"><i class="fas fa-hospital"></i> 設定對象：<span id="unit-name-display">載入中...</span></span>
                </div>`;
        }

        return `
            <div class="container-fluid mt-4">
                <h2 class="h3 mb-4 text-gray-800"><i class="fas fa-ruler-combined"></i> 排班規則設定</h2>
                ${unitSelector}
                
                <div id="rule-content" style="display:none;">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h6 class="m-0 font-weight-bold text-primary">每日人力最低需求 (Min Staff)</h6>
                        </div>
                        <div class="card-body">
                            <form id="rules-form">
                                <div class="table-responsive mb-4">
                                    <table class="table table-bordered text-center table-sm align-middle">
                                        <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                        <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                    </table>
                                </div>
                                <hr>
                                <h6 class="font-weight-bold text-primary">其他限制</h6>
                                <div class="row align-items-center mt-3">
                                    <div class="col-auto"><label>最大連續上班天數</label></div>
                                    <div class="col-auto"><input type="number" id="maxConsecutiveDays" class="form-control" value="6" style="width:100px;"></div>
                                </div>
                                <div class="mt-4 text-end">
                                    <button type="submit" class="btn btn-primary btn-lg shadow"><i class="fas fa-save"></i> 儲存設定</button>
                                </div>
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
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        const unitSelect = document.getElementById('rule-unit-select');
        
        const loadRules = async (uid) => {
            if(!uid) {
                document.getElementById('rule-content').style.display = 'none';
                return;
            }
            this.targetUnitId = uid;
            try {
                const unitData = await UnitService.getUnitById(uid);
                const savedRules = unitData.rules || {};
                const staffReq = unitData.staffRequirements || { D:{}, E:{}, N:{} };

                document.querySelectorAll('.req-input').forEach(input => {
                    input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
                });
                document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
                document.getElementById('rule-content').style.display = 'block';
            } catch (e) { console.error(e); }
        };

        if (isAdmin) {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">請選擇...</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => loadRules(e.target.value));
            if(units.length > 0) {
                unitSelect.value = units[0].unitId;
                loadRules(units[0].unitId);
            }
        } else {
            const unit = await UnitService.getUnitById(this.targetUnitId);
            if(unit) document.getElementById('unit-name-display').textContent = unit.unitName;
            loadRules(this.targetUnitId);
        }

        document.getElementById('rules-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!this.targetUnitId) return alert('未選擇單位');
            
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });
            const rulesData = { maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) };

            const res = await UnitService.updateUnit(this.targetUnitId, { rules: rulesData, staffRequirements: staffReq });
            if (res.success) alert('✅ 設定已儲存'); else alert('失敗: ' + res.error);
        });
    }
}
