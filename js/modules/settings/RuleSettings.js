import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ScoringService } from "../../services/ScoringService.js";

export class RuleSettings {
    constructor() { this.targetUnitId = null; this.currentConfig = null; }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 規則與評分設定</h3>
                    <p class="text-muted small mb-0">設定每日人力需求，以及自定義排班品質的評分權重。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="rule-unit-select" class="form-select w-auto"><option value="">載入中...</option></select>
                        <div class="ms-auto">
                            <button id="btn-save-rules" class="btn btn-primary w-auto shadow-sm"><i class="fas fa-save"></i> 儲存設定</button>
                        </div>
                    </div>
                </div>
                
                <div id="rule-content" style="display:none;">
                    <ul class="nav nav-tabs mb-3" id="ruleTabs">
                        <li class="nav-item">
                            <button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#tab-min">
                                <i class="fas fa-users"></i> 人力需求 (Hard)
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">
                                <i class="fas fa-chart-pie"></i> 評分權重 (Soft)
                            </button>
                        </li>
                    </ul>

                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-min">
                            <div class="row">
                                <div class="col-lg-8">
                                    <div class="card shadow mb-4">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-primary">每日最低人力 (Min Staff)</h6></div>
                                        <div class="card-body">
                                            <div class="table-responsive">
                                                <table class="table table-bordered text-center table-sm align-middle">
                                                    <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                                    <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
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
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-scoring">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 fw-bold text-success">評分權重配置</h6>
                                    <div>總權重: <span id="total-weight-display" class="badge bg-secondary fs-6">100%</span></div>
                                </div>
                                <div class="card-body">
                                    <div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> 請調整各細項權重，總和建議為 100%。關閉的項目不計分。</div>
                                    <div class="row g-3" id="scoring-config-container">
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

    // 渲染大分類卡片
    renderCategoryCard(key, category) {
        let subsHtml = '';
        if (category.subs) {
            Object.entries(category.subs).forEach(([subKey, sub]) => {
                subsHtml += `
                    <div class="d-flex justify-content-between align-items-center mb-2 ps-3 border-start border-3 border-light">
                        <div class="form-check form-switch">
                            <input class="form-check-input sub-enable" type="checkbox" id="sub-enable-${key}-${subKey}" 
                                   data-cat="${key}" data-sub="${subKey}" ${sub.enabled ? 'checked' : ''}>
                            <label class="form-check-label small text-muted" for="sub-enable-${key}-${subKey}">${sub.label}</label>
                        </div>
                        <div class="input-group input-group-sm w-auto">
                            <input type="number" class="form-control sub-weight text-center" style="width: 60px;" 
                                   id="sub-weight-${key}-${subKey}" data-cat="${key}" data-sub="${subKey}"
                                   value="${sub.weight}" min="0" max="100">
                            <span class="input-group-text">%</span>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 border-left-${this.getColor(key)}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="m-0 fw-bold text-dark">${category.label}</h6>
                            <span class="badge bg-light text-dark border" id="cat-total-${key}">0%</span>
                        </div>
                        ${subsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    getColor(key) {
        const map = { fairness: 'primary', satisfaction: 'info', efficiency: 'success', health: 'warning', quality: 'danger', cost: 'secondary' };
        return map[key] || 'primary';
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
            if(unitSelect.options.length > 0) this.loadRules(unitSelect.value);
        }

        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
        
        // 綁定權重變更事件 (自動計算總分)
        document.getElementById('rule-content').addEventListener('input', (e) => {
            if (e.target.classList.contains('sub-weight') || e.target.classList.contains('sub-enable')) {
                this.updateTotalWeightDisplay();
            }
        });
    }

    async loadRules(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        const unit = await UnitService.getUnitById(uid);
        if (!unit) return;

        const savedRules = unit.rules || {};
        const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };
        // 取得預設設定並合併 (確保新欄位存在)
        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        
        // Deep merge config
        this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
        Object.keys(savedConfig).forEach(k => {
            if(this.currentConfig[k] && savedConfig[k].subs) {
                Object.keys(savedConfig[k].subs).forEach(subK => {
                    if(this.currentConfig[k].subs[subK]) {
                        this.currentConfig[k].subs[subK] = savedConfig[k].subs[subK];
                    }
                });
            }
        });

        // 1. 填入人力需求
        document.querySelectorAll('.req-input').forEach(input => {
            input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
        });
        document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;

        // 2. 渲染評分設定 UI
        const container = document.getElementById('scoring-config-container');
        container.innerHTML = '';
        // 排除 hard constraints (固定隱藏或另行顯示)
        const categories = ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'];
        categories.forEach(key => {
            container.innerHTML += this.renderCategoryCard(key, this.currentConfig[key]);
        });

        this.updateTotalWeightDisplay();
        document.getElementById('rule-content').style.display = 'block';
    }

    updateTotalWeightDisplay() {
        let grandTotal = 0;
        const categories = ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'];

        categories.forEach(key => {
            let catTotal = 0;
            document.querySelectorAll(`.sub-weight[data-cat="${key}"]`).forEach(input => {
                const subKey = input.dataset.sub;
                const enabled = document.getElementById(`sub-enable-${key}-${subKey}`).checked;
                if (enabled) {
                    catTotal += (parseInt(input.value) || 0);
                }
            });
            document.getElementById(`cat-total-${key}`).textContent = catTotal + '%';
            grandTotal += catTotal;
        });

        const totalEl = document.getElementById('total-weight-display');
        totalEl.textContent = grandTotal + '%';
        totalEl.className = `badge fs-6 ${grandTotal === 100 ? 'bg-success' : 'bg-warning text-dark'}`;
    }

    async saveRules() {
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;

        try {
            // 1. 收集人力需求
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });

            // 2. 收集評分設定
            const newConfig = { hard: { enabled: true, weight: 0 } }; // Hard 永遠存在
            const categories = ['fairness', 'satisfaction', 'efficiency', 'health', 'quality', 'cost'];
            
            categories.forEach(key => {
                newConfig[key] = { label: this.currentConfig[key].label, subs: {} };
                document.querySelectorAll(`.sub-weight[data-cat="${key}"]`).forEach(input => {
                    const subKey = input.dataset.sub;
                    newConfig[key].subs[subKey] = {
                        label: this.currentConfig[key].subs[subKey].label,
                        weight: parseInt(input.value) || 0,
                        enabled: document.getElementById(`sub-enable-${key}-${subKey}`).checked
                    };
                });
            });

            // 3. 儲存
            const rulesData = { 
                maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                scoringConfig: newConfig
            };

            const res = await UnitService.updateUnit(this.targetUnitId, { 
                rules: rulesData, 
                staffRequirements: staffReq 
            });
            
            if (res.success) alert('✅ 設定已儲存');
            else alert('儲存失敗: ' + res.error);

        } catch (e) { console.error(e); alert("系統錯誤"); } 
        finally { btn.disabled = false; }
    }
}
