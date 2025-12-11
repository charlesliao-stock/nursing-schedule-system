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
                    <p class="text-muted small mb-0">設定單位的每日人力需求，以及排班品質的評分權重。</p>
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
                        <li class="nav-item">
                            <button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#tab-min">
                                <i class="fas fa-users"></i> 人力需求 (Min Staff)
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">
                                <i class="fas fa-star-half-alt"></i> 評分權重設定
                            </button>
                        </li>
                    </ul>

                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-min">
                            <div class="row">
                                <div class="col-lg-8">
                                    <div class="card shadow mb-4">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-primary">每日各班最低人力需求</h6></div>
                                        <div class="card-body">
                                            <div class="table-responsive">
                                                <table class="table table-bordered text-center table-sm align-middle">
                                                    <thead class="table-light">
                                                        <tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        ${this.renderRow('D', '白班')}
                                                        ${this.renderRow('E', '小夜')}
                                                        ${this.renderRow('N', '大夜')}
                                                    </tbody>
                                                </table>
                                            </div>
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
                                                <div class="form-text small">勞基法建議不超過 6 天</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-scoring">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 fw-bold text-success">排班品質計分模型</h6>
                                    <span class="badge bg-secondary">建議總權重 100%</span>
                                </div>
                                <div class="card-body">
                                    <div class="alert alert-info small mb-3">
                                        <i class="fas fa-info-circle"></i> <strong>硬性約束 (Hard Constraints)</strong> 為必須通過的項目（如休假天數、間隔11小時），不列入權重計算，若違反則視為不合格。
                                    </div>
                                    
                                    <div class="row g-3">
                                        ${this.renderScoreInput('fairness', '公平性 (工時/班次)', 30, '檢視標準差與班次均勻度')}
                                        ${this.renderScoreInput('satisfaction', '員工滿意度', 25, '偏好滿足率與連續工作天數')}
                                        ${this.renderScoreInput('efficiency', '排班效率', 20, '班次覆蓋率 (Min Staff)')}
                                        ${this.renderScoreInput('health', '健康安全', 15, '夜班頻率與早晚交替')}
                                        ${this.renderScoreInput('quality', '排班品質', 10, '資深/資淺人員配比')}
                                        ${this.renderScoreInput('cost', '成本控制', 0, '加班費控管 (預設關閉)')}
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
        // 0=日, 1=一 ... 6=六
        // 這裡的順序是對應 RuleEngine / ScoringService 的 weekDay 索引
        // 假設 table header 是 一二三四五六日 (1,2,3,4,5,6,0)
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            html += `<td><input type="number" class="form-control form-control-sm text-center req-input" data-shift="${shift}" data-day="${d}" value="0" min="0"></td>`;
        });
        return html + '</tr>';
    }

    renderScoreInput(key, label, defaultVal, desc) {
        return `
            <div class="col-md-4">
                <div class="p-3 border rounded bg-light h-100">
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input score-enable" type="checkbox" id="enable-${key}" checked>
                        <label class="form-check-label fw-bold" for="enable-${key}">${label}</label>
                    </div>
                    <div class="input-group input-group-sm mb-2">
                        <span class="input-group-text">權重 %</span>
                        <input type="number" class="form-control score-weight" id="weight-${key}" value="${defaultVal}" min="0" max="100">
                    </div>
                    <div class="text-muted small" style="font-size: 0.8rem;">${desc}</div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let availableUnits = isAdmin ? await UnitService.getAllUnits() : await UnitService.getUnitsByManager(user.uid);
        // Fallback: 若管理者無單位但有 user.unitId
        if(availableUnits.length === 0 && user.unitId) {
            const u = await UnitService.getUnitById(user.unitId);
            if(u) availableUnits.push(u);
        }

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = '<option>無單位</option>'; unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            // 預設載入第一個
            if(unitSelect.options.length > 0) this.loadRules(unitSelect.value);
        }

        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
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
            const scoring = unit.scoringConfig || ScoringService.getDefaultConfig();

            // 1. 填入人力需求
            document.querySelectorAll('.req-input').forEach(input => {
                const shift = input.dataset.shift;
                const day = input.dataset.day;
                input.value = staffReq[shift]?.[day] || 0;
            });
            document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;

            // 2. 填入評分設定
            ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(key => {
                if(scoring[key]) {
                    document.getElementById(`enable-${key}`).checked = scoring[key].enabled;
                    document.getElementById(`weight-${key}`).value = scoring[key].weight;
                }
            });

            document.getElementById('rule-content').style.display = 'block';

        } catch (e) {
            console.error(e);
            alert("讀取規則失敗");
        }
    }

    async saveRules() {
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

        try {
            // 1. 收集人力需求
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });

            // 2. 收集評分設定
            const scoringConfig = { hard: { enabled: true, weight: 0 } }; // 硬性約束固定開啟
            ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'].forEach(key => {
                scoringConfig[key] = {
                    enabled: document.getElementById(`enable-${key}`).checked,
                    weight: parseInt(document.getElementById(`weight-${key}`).value) || 0
                };
            });

            // 3. 收集其他規則
            const rulesData = { 
                maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                scoringConfig: scoringConfig // ✅ 儲存評分設定
            };

            const res = await UnitService.updateUnit(this.targetUnitId, { 
                rules: rulesData, 
                staffRequirements: staffReq 
            });
            
            if (res.success) alert('✅ 設定已儲存');
            else alert('儲存失敗: ' + res.error);

        } catch (e) {
            console.error(e);
            alert("系統錯誤");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存設定';
        }
    }
}
