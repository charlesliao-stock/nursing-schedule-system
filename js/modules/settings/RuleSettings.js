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
                    <p class="text-muted small mb-0">設定每日人力需求、勞基法規範、排班流程邏輯及評分權重。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="rule-unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
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
                            <button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-constraints">
                                <i class="fas fa-traffic-light"></i> 排班規則 (Rules)
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-process">
                                <i class="fas fa-cogs"></i> 排班流程 (Flow)
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

                        <div class="tab-pane fade" id="tab-constraints">
                            <div class="row">
                                <div class="col-lg-6">
                                    <div class="card shadow mb-4 h-100 border-left-danger">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-danger"><i class="fas fa-gavel"></i> 勞基法與硬性規範 (不可違反)</h6></div>
                                        <div class="card-body">
                                            <div class="form-check form-switch mb-3">
                                                <input class="form-check-input" type="checkbox" id="rule-min-11h" checked disabled>
                                                <label class="form-check-label fw-bold">班與班間隔至少 11 小時</label>
                                                <div class="form-text text-danger small">
                                                    系統將強制禁止「小接白 (E-D)」等間隔不足 11 小時之排法。<br>
                                                    註：大夜(N) 接白(D) 或小(E) 因間隔足夠，視為允許。
                                                </div>
                                            </div>
                                            <hr>
                                            <div class="mb-3">
                                                <label class="form-label fw-bold">一週內班別種類上限</label>
                                                <select class="form-select" id="rule-max-types-week">
                                                    <option value="2">最多 2 種 (如: D/E 或 D/N)</option>
                                                    <option value="3">最多 3 種 (如: D/E/N 皆有)</option>
                                                </select>
                                                <div class="form-text small">一週內 (週一至週日) 混合班別的種類限制。</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-lg-6">
                                    <div class="card shadow mb-4 h-100 border-left-info">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-info"><i class="fas fa-sliders-h"></i> 單位排班原則 (軟性設定)</h6></div>
                                        <div class="card-body">
                                            <div class="form-check form-switch mb-3">
                                                <input class="form-check-input" type="checkbox" id="rule-first-n-off" checked>
                                                <label class="form-check-label fw-bold">排大夜 (N) 的前一天必須是 N 或 OFF</label>
                                                <div class="form-text small">避免由 D 或 E 直接跳接 N (逆向且間隔短)。</div>
                                            </div>

                                            <div class="row g-3">
                                                <div class="col-6">
                                                    <label class="form-label fw-bold">同種班最少連續</label>
                                                    <div class="input-group">
                                                        <input type="number" id="rule-min-consecutive" class="form-control" value="2" min="1">
                                                        <span class="input-group-text">天</span>
                                                    </div>
                                                </div>
                                                <div class="col-6">
                                                    <label class="form-label fw-bold">夜班最多連續</label>
                                                    <div class="input-group">
                                                        <input type="number" id="rule-max-night" class="form-control" value="4" min="1">
                                                        <span class="input-group-text">天</span>
                                                    </div>
                                                </div>
                                                <div class="col-12">
                                                    <label class="form-label fw-bold">最大連續上班天數</label>
                                                    <div class="input-group">
                                                        <input type="number" id="maxConsecutiveDays" class="form-control" value="6" min="1">
                                                        <span class="input-group-text">天</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-process">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-dark"><i class="fas fa-robot text-primary me-2"></i>AI 排班流程控制</h6></div>
                                <div class="card-body">
                                    <div class="alert alert-light border-primary border-start border-4 small">
                                        <i class="fas fa-info-circle me-2"></i>此處設定可讓您決定 AI 演算法的執行步驟。開啟越多最佳化選項，排班結果通常越符合人性，但計算時間可能稍長。
                                    </div>

                                    <div class="list-group">
                                        <div class="list-group-item d-flex align-items-center justify-content-between py-3">
                                            <div>
                                                <h6 class="mb-1 fw-bold text-primary"><i class="fas fa-layer-group me-2"></i>1. 包班優先預填 (Batch Pre-fill)</h6>
                                                <small class="text-muted d-block">在排其他人之前，先將包班人員 (如包大夜、包小夜) 的整月班表填滿。</small>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input class="form-check-input fs-5" type="checkbox" id="proc-batch-prefill" checked>
                                            </div>
                                        </div>

                                        <div class="list-group-item d-flex align-items-center justify-content-between py-3">
                                            <div>
                                                <h6 class="mb-1 fw-bold text-info"><i class="fas fa-history me-2"></i>2. 歷史資料整合 (History Check)</h6>
                                                <small class="text-muted d-block">讀取上個月最後一天的班表，確保 1 號的排班間隔符合規定 (如上月 30 號是大夜，則 1 號不可排白班)。</small>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input class="form-check-input fs-5" type="checkbox" id="proc-history" checked>
                                            </div>
                                        </div>

                                        <div class="list-group-item d-flex align-items-center justify-content-between py-3">
                                            <div>
                                                <h6 class="mb-1 fw-bold text-warning"><i class="fas fa-cut me-2"></i>3. 自動調節過剩人力 (Auto Pruning)</h6>
                                                <small class="text-muted d-block">若當日某班別 (如大夜) 人數超過需求，AI 會自動將「累積上班天數最多」的包班人員調整為 OFF。</small>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input class="form-check-input fs-5" type="checkbox" id="proc-pruning" checked>
                                            </div>
                                        </div>

                                        <div class="list-group-item d-flex align-items-center justify-content-between py-3">
                                            <div>
                                                <h6 class="mb-1 fw-bold text-danger"><i class="fas fa-forward me-2"></i>4. 盡力而為模式 (Force Push)</h6>
                                                <small class="text-muted d-block">若遇到人力不足的死路，允許 AI 保留缺口繼續排下一天，而非直接報錯停止 (建議開啟)。</small>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input class="form-check-input fs-5" type="checkbox" id="proc-force" checked>
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
                                    <div class="row g-3" id="scoring-config-container"></div>
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

        let units = [];
        if (isAdmin) {
            units = await UnitService.getAllUnits();
        } else {
            units = await UnitService.getUnitsByManager(user.uid);
            if(units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
            }
        }

        if (units.length === 0) {
            unitSelect.innerHTML = '<option>無單位</option>'; unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            if (units.length === 1) unitSelect.disabled = true;

            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            if(unitSelect.options.length > 0) this.loadRules(unitSelect.value);
        }

        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
        
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
        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        
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

        // 1. 回填人力需求
        document.querySelectorAll('.req-input').forEach(input => {
            input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
        });

        // 2. 回填排班規則
        const constraints = savedRules.constraints || {};
        document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
        document.getElementById('rule-max-types-week').value = constraints.maxShiftTypesWeek || 3;
        document.getElementById('rule-first-n-off').checked = constraints.firstNRequiresOFF !== false;
        document.getElementById('rule-min-consecutive').value = constraints.minConsecutiveSame || 2;
        document.getElementById('rule-max-night').value = constraints.maxConsecutiveNight || 4;

        // 3. 回填排班流程 (Process Config)
        const proc = savedRules.processConfig || {};
        document.getElementById('proc-batch-prefill').checked = proc.enableBatchPrefill !== false; // 預設 true
        document.getElementById('proc-history').checked = proc.enableHistory !== false;
        document.getElementById('proc-pruning').checked = proc.enablePruning !== false;
        document.getElementById('proc-force').checked = proc.enableForcePush !== false;

        // 4. 回填評分權重
        const container = document.getElementById('scoring-config-container');
        container.innerHTML = '';
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
                const enabled = document.getElementById(`sub-enable-${key}-${input.dataset.sub}`).checked;
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

            // 2. 收集排班規則
            const constraints = {
                maxShiftTypesWeek: parseInt(document.getElementById('rule-max-types-week').value),
                firstNRequiresOFF: document.getElementById('rule-first-n-off').checked,
                minConsecutiveSame: parseInt(document.getElementById('rule-min-consecutive').value) || 2,
                maxConsecutiveNight: parseInt(document.getElementById('rule-max-night').value) || 4,
                minInterval11h: true, // 預設強制開啟
                shiftSequence: ['OFF', 'N', 'D', 'E']
            };

            // 3. 收集排班流程
            const processConfig = {
                enableBatchPrefill: document.getElementById('proc-batch-prefill').checked,
                enableHistory: document.getElementById('proc-history').checked,
                enablePruning: document.getElementById('proc-pruning').checked,
                enableForcePush: document.getElementById('proc-force').checked
            };

            // 4. 收集評分權重
            const newConfig = { hard: { enabled: true, weight: 0 } };
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

            const rulesData = { 
                maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                constraints: constraints, 
                processConfig: processConfig, // 新增此欄位
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
