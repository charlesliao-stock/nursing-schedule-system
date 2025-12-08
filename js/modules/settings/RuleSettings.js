import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() { this.targetUnitId = null; }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 排班規則設定</h3>
                    <p class="text-muted small mb-0">設定單位的每日最低人力需求與排班限制。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="rule-unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <div class="ms-auto">
                            <button id="btn-save-rules" class="btn btn-primary w-auto shadow-sm">
                                <i class="fas fa-save"></i> 儲存設定
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="rule-content" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-primary">每日人力最低需求 (Min Staff)</h6></div>
                                <div class="card-body">
                                    <form id="rules-form">
                                        <div class="table-responsive">
                                            <table class="table table-bordered text-center table-sm align-middle">
                                                <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                                <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                            </table>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-4">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-dark">限制參數</h6></div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">最大連續上班天數</label>
                                        <input type="number" id="maxConsecutiveDays" class="form-control" value="6">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRow(shift, label) {
        let html = `<tr><td class="fw-bold bg-light">${label}</td>`;
        [1, 2, 3, 4, 5, 6, 0].forEach(d => html += `<td><input type="number" class="form-control form-control-sm text-center req-input" data-shift="${shift}" data-day="${d}" value="0" min="0"></td>`);
        return html + '</tr>';
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let availableUnits = [];
        if(isAdmin) {
            availableUnits = await UnitService.getAllUnits();
        } else {
            availableUnits = await UnitService.getUnitsByManager(user.uid);
            if(availableUnits.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) availableUnits.push(u);
            }
        }

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = '<option>無單位</option>'; unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            this.loadRules(availableUnits[0].unitId);
        }

        document.getElementById('btn-save-rules').addEventListener('click', async () => {
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0);
            const rulesData = { maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) };
            const res = await UnitService.updateUnit(this.targetUnitId, { rules: rulesData, staffRequirements: staffReq });
            alert(res.success ? '✅ 已儲存' : '失敗');
        });
    }

    async loadRules(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        
        try {
            const unit = await UnitService.getUnitById(uid);
            
            // ✅ Crash Fix: 確保 unit 與內部屬性存在
            if (!unit) {
                document.getElementById('rule-content').style.display = 'none';
                return;
            }

            const savedRules = unit.rules || {};
            const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };

            document.querySelectorAll('.req-input').forEach(input => {
                input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
            });
            document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
            document.getElementById('rule-content').style.display = 'block';
        } catch (e) { console.error(e); }
    }
}
