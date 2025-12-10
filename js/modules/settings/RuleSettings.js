import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() { this.targetUnitId = null; }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 排班規則設定</h3>
                    <p class="text-muted small mb-0">設定單位的每日最低人力需求與 AI 演算法的權重偏好。</p>
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
                        <div class="col-lg-7">
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

                        <div class="col-lg-5">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-dark">排班限制參數 (Hard Constraints)</h6></div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">最大連續上班天數</label>
                                        <input type="number" id="maxConsecutiveDays" class="form-control" value="6">
                                    </div>
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="avoidNtoD" checked>
                                        <label class="form-check-label">禁止 N 接 D (Off原則)</label>
                                    </div>
                                    <div class="form-check form-switch mt-2">
                                        <input class="form-check-input" type="checkbox" id="avoidEtoD" checked>
                                        <label class="form-check-label">禁止 E 接 D (Off原則)</label>
                                    </div>
                                </div>
                            </div>

                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-gradient-primary text-white" style="background: linear-gradient(45deg, #4e73df, #224abe);">
                                    <h6 class="m-0 fw-bold"><i class="fas fa-robot"></i> AI 排班權重 (Soft Constraints)</h6>
                                </div>
                                <div class="card-body">
                                    <p class="small text-muted mb-3">數值越高代表該項目越重要，AI 會優先滿足。</p>
                                    
                                    <div class="mb-3">
                                        <label class="form-label d-flex justify-content-between">
                                            <span><i class="fas fa-balance-scale text-info"></i> 總班數平均 (公平性)</span>
                                            <span class="badge bg-secondary" id="val-fairness">100</span>
                                        </label>
                                        <input type="range" class="form-range" id="weightFairness" min="0" max="200" step="10" value="100" oninput="document.getElementById('val-fairness').textContent=this.value">
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label d-flex justify-content-between">
                                            <span><i class="fas fa-moon text-warning"></i> 夜班負載平衡</span>
                                            <span class="badge bg-secondary" id="val-night">50</span>
                                        </label>
                                        <input type="range" class="form-range" id="weightNight" min="0" max="200" step="10" value="50" oninput="document.getElementById('val-night').textContent=this.value">
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label d-flex justify-content-between">
                                            <span><i class="fas fa-umbrella-beach text-success"></i> 假日休假平均</span>
                                            <span class="badge bg-secondary" id="val-holiday">200</span>
                                        </label>
                                        <input type="range" class="form-range" id="weightHoliday" min="0" max="500" step="10" value="200" oninput="document.getElementById('val-holiday').textContent=this.value">
                                    </div>
                                    
                                    <div class="mb-2">
                                        <label class="form-label d-flex justify-content-between">
                                            <span><i class="fas fa-magnet text-danger"></i> 包班連續性獎勵</span>
                                            <span class="badge bg-secondary" id="val-batch">5000</span>
                                        </label>
                                        <input type="range" class="form-range" id="weightBatch" min="1000" max="10000" step="500" value="5000" oninput="document.getElementById('val-batch').textContent=this.value">
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
            
            const rulesData = { 
                maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value),
                avoidNtoD: document.getElementById('avoidNtoD').checked,
                avoidEtoD: document.getElementById('avoidEtoD').checked,
                // ✅ 儲存權重
                weights: {
                    fairness: parseInt(document.getElementById('weightFairness').value),
                    night: parseInt(document.getElementById('weightNight').value),
                    holiday: parseInt(document.getElementById('weightHoliday').value),
                    batch: parseInt(document.getElementById('weightBatch').value)
                }
            };
            
            const res = await UnitService.updateUnit(this.targetUnitId, { rules: rulesData, staffRequirements: staffReq });
            alert(res.success ? '✅ 已儲存' : '失敗');
        });
    }

    async loadRules(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        
        try {
            const unit = await UnitService.getUnitById(uid);
            if (!unit) {
                document.getElementById('rule-content').style.display = 'none';
                return;
            }

            const savedRules = unit.rules || {};
            const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };

            // 載入人力需求
            document.querySelectorAll('.req-input').forEach(input => {
                input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
            });

            // 載入硬規則
            document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
            document.getElementById('avoidNtoD').checked = savedRules.avoidNtoD !== false;
            document.getElementById('avoidEtoD').checked = savedRules.avoidEtoD !== false;

            // 載入權重 (預設值)
            const w = savedRules.weights || {};
            this.setRangeValue('weightFairness', w.fairness, 100);
            this.setRangeValue('weightNight', w.night, 50);
            this.setRangeValue('weightHoliday', w.holiday, 200);
            this.setRangeValue('weightBatch', w.batch, 5000);

            document.getElementById('rule-content').style.display = 'block';
        } catch (e) { console.error(e); }
    }

    setRangeValue(id, val, defaultVal) {
        const el = document.getElementById(id);
        const labelEl = document.getElementById(id.replace('weight', 'val-').toLowerCase());
        const v = val !== undefined ? val : defaultVal;
        el.value = v;
        if(labelEl) labelEl.textContent = v;
    }
}
