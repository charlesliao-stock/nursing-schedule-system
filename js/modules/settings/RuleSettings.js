import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ScoringService } from "../../services/ScoringService.js";

export class RuleSettings {
    constructor() { this.targetUnitId = null; }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 排班規則與評分設定</h3>
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
                    <ul class="nav nav-tabs mb-3" id="ruleTabs">
                        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-min">人力需求</button></li>
                        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-scoring">評分權重</button></li>
                    </ul>

                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-min">
                            <div class="card shadow">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-primary">每日人力最低需求 (Min Staff)</h6></div>
                                <div class="card-body">
                                    <div class="table-responsive">
                                        <table class="table table-bordered text-center table-sm align-middle">
                                            <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                            <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                        </table>
                                    </div>
                                    <div class="mt-3">
                                        <label class="form-label fw-bold">最大連續上班天數</label>
                                        <input type="number" id="maxConsecutiveDays" class="form-control w-25" value="6">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-scoring">
                            <div class="card shadow">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-success">排班品質計分設定 (總和建議 100%)</h6></div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        ${this.renderScoreInput('fairness', '公平性 (工時/班次)', 30)}
                                        ${this.renderScoreInput('satisfaction', '員工滿意度 (偏好)', 25)}
                                        ${this.renderScoreInput('efficiency', '排班效率 (覆蓋率)', 20)}
                                        ${this.renderScoreInput('health', '健康安全 (夜班頻率)', 15)}
                                        ${this.renderScoreInput('quality', '排班品質 (資深佔比)', 10)}
                                        ${this.renderScoreInput('cost', '成本控制 (加班費)', 0)}
                                    </div>
                                    <div class="alert alert-info mt-3 small">
                                        <i class="fas fa-info-circle"></i> 硬性約束 (休假天數、休息間隔) 為必要檢查項目，不列入權重計算。
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

    renderScoreInput(key, label, defaultVal) {
        return `
            <div class="col-md-4">
                <div class="p-3 border rounded bg-light">
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input score-enable" type="checkbox" id="enable-${key}" checked>
                        <label class="form-check-label fw-bold" for="enable-${key}">${label}</label>
                    </div>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">權重 %</span>
                        <input type="number" class="form-control score-weight" id="weight-${key}" value="${defaultVal}" min="0" max="100">
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let availableUnits = isAdmin ? await UnitService.getAllUnits() : await UnitService.getUnitsByManager(user.uid);
        if(availableUnits.length === 0 && user.unitId) {
            const u = await UnitService.getUnitById(user.unitId);
            if(u) availableUnits.push(u);
        }

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = '<option>無單位</option>'; unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            this.loadRules(availableUnits[0].unitId);
        }

        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
    }

    async loadRules(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        const unit = await UnitService.getUnitById(uid);
        if (!unit) { document.getElementById('rule-content').style.display = 'none'; return; }

        const savedRules = unit.rules || {};
        const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };
        const scoring = unit.scoringConfig || ScoringService.getDefaultConfig();

        // 填入人力需求
        document.querySelectorAll('.req-input').forEach(input => {
            input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
        });
        document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;

        // 填入評分設定
        ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(key => {
            if(scoring[key]) {
                document.getElementById(`enable-${key}`).checked = scoring[key].enabled;
                document.getElementById(`weight-${key}`).value = scoring[key].weight;
            }
        });

        document.getElementById('rule-content').style.display = 'block';
    }

    async saveRules() {
        const staffReq = { D:{}, E:{}, N:{} };
        document.querySelectorAll('.req-input').forEach(input => staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0);
        
        const scoringConfig = { hard: { enabled: true, weight: 0 } };
        ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(key => {
            scoringConfig[key] = {
                enabled: document.getElementById(`enable-${key}`).checked,
                weight: parseInt(document.getElementById(`weight-${key}`).value) || 0
            };
        });

        const rulesData = { 
            maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value)
        };

        const res = await UnitService.updateUnit(this.targetUnitId, { 
            rules: rulesData, 
            staffRequirements: staffReq,
            scoringConfig: scoringConfig // 儲存評分設定
        });
        alert(res.success ? '✅ 已儲存' : '失敗');
    }
}
