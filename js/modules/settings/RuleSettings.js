import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ScoringService } from "../../services/ScoringService.js";

export class RuleSettings {
    constructor() { 
        this.targetUnitId = null; 
        this.currentConfig = null; 
        this.activeModalSubKey = null; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 規則與評分設定</h3>
                    <p class="text-muted small mb-0">設定每日人力需求、排班規則及自訂評分標準。</p>
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
                        <li class="nav-item"><button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#tab-min">人力需求</button></li>
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-constraints">排班規則</button></li>
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">評分標準 (可自訂)</button></li>
                    </ul>

                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-min">
                            <div class="card shadow mb-4">
                                <div class="card-body">
                                    <table class="table table-bordered text-center table-sm align-middle">
                                        <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                        <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-constraints">
                            <div class="row">
                                <div class="col-lg-6">
                                    <div class="card shadow mb-4 h-100 border-left-danger">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-danger"><i class="fas fa-gavel"></i> 勞基法與硬性規範</h6></div>
                                        <div class="card-body">
                                            <div class="form-check form-switch mb-3">
                                                <input class="form-check-input" type="checkbox" id="rule-min-11h" checked>
                                                <label class="form-check-label fw-bold">班與班間隔至少 11 小時</label>
                                                <div class="form-text text-danger small">啟用後，系統將標記「小接白 (E-D)」等間隔不足 11 小時之排法為錯誤。</div>
                                            </div>
                                            <hr>
                                            <div class="mb-3">
                                                <label class="form-label fw-bold text-danger">一週內班別種類上限</label>
                                                <input type="text" class="form-control bg-light" value="最多 2 種 (如: D/E 或 D/N)" disabled>
                                                <div class="form-text small text-danger"><i class="fas fa-exclamation-triangle"></i> 強制檢查每週不可出現 3 種班別。</div>
                                            </div>
                                            <div class="alert alert-danger py-2 small">
                                                <i class="fas fa-female"></i> <strong>母性保護：</strong> 懷孕/哺乳期間，強制不排 22:00 後班別。
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-lg-6">
                                    <div class="card shadow mb-4 h-100 border-left-info">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-info"><i class="fas fa-sliders-h"></i> 單位排班原則</h6></div>
                                        <div class="card-body">
                                            <div class="form-check form-switch mb-3">
                                                <input class="form-check-input" type="checkbox" id="rule-first-n-off" checked>
                                                <label class="form-check-label fw-bold">排大夜 (N) 前一天需 N 或 OFF</label>
                                                <div class="form-text small">避免由 D 或 E 直接跳接 N。</div>
                                            </div>
                                            
                                            <div class="form-check form-switch mb-3">
                                                <input class="form-check-input" type="checkbox" id="rule-month-mix" checked>
                                                <label class="form-check-label fw-bold">尊重每月班別種類偏好</label>
                                                <div class="form-text small">若開啟，AI 將嘗試滿足人員「僅排2種」或「可排3種」的意願。</div>
                                            </div>

                                            <hr>
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
                                                    <label class="form-label fw-bold text-danger">最大連續上班天數</label>
                                                    <div class="input-group">
                                                        <input type="number" id="maxConsecutiveDays" class="form-control" value="6" min="1" max="12">
                                                        <span class="input-group-text">天</span>
                                                    </div>
                                                    <div class="form-text small">若設為 6，則第 7 天必須為 OFF。</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card shadow mb-4 mt-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-dark"><i class="fas fa-robot text-primary me-2"></i>AI 排班流程控制</h6></div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6 mb-2">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="proc-batch-prefill" checked>
                                                <label class="form-check-label">1. 包班優先預填 (Batch Pre-fill)</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6 mb-2">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="proc-history" checked>
                                                <label class="form-check-label">2. 歷史資料整合 (History Check)</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6 mb-2">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="proc-pruning" checked>
                                                <label class="form-check-label">3. 自動調節過剩人力 (Auto Pruning)</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6 mb-2">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="proc-force" checked>
                                                <label class="form-check-label">4. 盡力而為模式 (Force Push)</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="tab-scoring">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 fw-bold text-success">評分權重與標準配置</h6>
                                    <div>總權重: <span id="total-weight-display" class="badge bg-secondary fs-6">100%</span></div>
                                </div>
                                <div class="card-body">
                                    <div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> 點擊「設定標準」可自訂該項目的給分階梯 (如: 差異≤1得100分)。</div>
                                    <div class="row g-3" id="scoring-config-container"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="tiers-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">編輯評分標準</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p id="modal-sub-label" class="fw-bold text-primary mb-2"></p>
                            <p class="small text-muted mb-3">設定數值門檻與對應分數 (系統將依序由上而下判斷)</p>
                            <table class="table table-sm table-bordered text-center">
                                <thead class="table-light"><tr><th>條件 (≤ 數值)</th><th>得分</th><th>評語 (標籤)</th><th>操作</th></tr></thead>
                                <tbody id="tiers-tbody"></tbody>
                            </table>
                            <button class="btn btn-sm btn-outline-success w-100" onclick="window.routerPage.addTierRow()">+ 新增階梯</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" onclick="window.routerPage.saveTiers()">儲存標準</button>
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

    // 渲染評分類別卡片
    renderCategoryCard(key, category) {
        let subsHtml = '';
        if (category.subs) {
            Object.entries(category.subs).forEach(([subKey, sub]) => {
                subsHtml += `
                    <div class="d-flex justify-content-between align-items-center mb-2 ps-3 border-start border-3 border-light">
                        <div class="form-check form-switch" style="width: 140px;">
                            <input class="form-check-input sub-enable" type="checkbox" id="sub-enable-${key}-${subKey}" 
                                   data-cat="${key}" data-sub="${subKey}" ${sub.enabled ? 'checked' : ''}>
                            <label class="form-check-label small text-muted text-truncate" for="sub-enable-${key}-${subKey}" title="${sub.label}">${sub.label}</label>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:0.75rem" 
                                    onclick="window.routerPage.openTiersModal('${key}', '${subKey}')">
                                <i class="fas fa-cog"></i> 設定標準
                            </button>
                            <div class="input-group input-group-sm" style="width: 90px;">
                                <input type="number" class="form-control sub-weight text-center" 
                                       id="sub-weight-${key}-${subKey}" data-cat="${key}" data-sub="${subKey}"
                                       value="${sub.weight}" min="0" max="100">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="col-md-6 col-lg-6">
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
        const map = { fairness: 'primary', satisfaction: 'info', efficiency: 'success', health: 'warning' };
        return map[key] || 'secondary';
    }

    async afterRender() {
        window.routerPage = this; // 讓 HTML onclick 呼叫得到
        this.tiersModal = new bootstrap.Modal(document.getElementById('tiers-modal'));

        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let units = [];
        if (isAdmin) units = await UnitService.getAllUnits();
        else units = await UnitService.getUnitsByManager(user.uid);

        if (units.length === 0) {
            unitSelect.innerHTML = '<option>無權限</option>'; unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            // 自動載入第一個
            if(units.length > 0) this.loadRules(units[0].unitId);
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

        const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };
        const savedRules = unit.rules || {};
        
        // 取得預設 Config，並與資料庫儲存的 Config 合併
        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        
        this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
        
        // Deep Merge
        Object.keys(savedConfig).forEach(catKey => {
            if(this.currentConfig[catKey] && savedConfig[catKey].subs) {
                Object.keys(savedConfig[catKey].subs).forEach(subKey => {
                    if(this.currentConfig[catKey].subs[subKey]) {
                        this.currentConfig[catKey].subs[subKey] = savedConfig[catKey].subs[subKey];
                    }
                });
            }
        });

        // 渲染人力需求
        document.querySelectorAll('.req-input').forEach(input => {
            input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
        });

        // 渲染排班規則
        const constraints = savedRules.constraints || {};
        document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
        document.getElementById('rule-first-n-off').checked = constraints.firstNRequiresOFF !== false;
        document.getElementById('rule-min-consecutive').value = constraints.minConsecutiveSame || 2;
        document.getElementById('rule-max-night').value = constraints.maxConsecutiveNight || 4;
        document.getElementById('rule-min-11h').checked = constraints.minInterval11h !== false;
        document.getElementById('rule-month-mix').checked = constraints.allowMonthlyMixPref !== false; 

        // 渲染流程控制
        const proc = savedRules.processConfig || {};
        document.getElementById('proc-batch-prefill').checked = proc.enableBatchPrefill !== false; 
        document.getElementById('proc-history').checked = proc.enableHistory !== false;
        document.getElementById('proc-pruning').checked = proc.enablePruning !== false;
        document.getElementById('proc-force').checked = proc.enableForcePush !== false;

        // 渲染評分卡片
        const container = document.getElementById('scoring-config-container');
        container.innerHTML = '';
        const categories = ['efficiency', 'satisfaction', 'fairness', 'health'];
        categories.forEach(key => {
            container.innerHTML += this.renderCategoryCard(key, this.currentConfig[key]);
        });

        this.updateTotalWeightDisplay();
        document.getElementById('rule-content').style.display = 'block';
    }

    updateTotalWeightDisplay() {
        let grandTotal = 0;
        const categories = ['efficiency', 'satisfaction', 'fairness', 'health'];

        categories.forEach(key => {
            let catTotal = 0;
            document.querySelectorAll(`.sub-weight[data-cat="${key}"]`).forEach(input => {
                const subKey = input.dataset.sub;
                const enabled = document.getElementById(`sub-enable-${key}-${subKey}`).checked;
                if (enabled) {
                    const val = parseInt(input.value) || 0;
                    catTotal += val;
                    if(this.currentConfig[key].subs[subKey]) {
                        this.currentConfig[key].subs[subKey].weight = val;
                        this.currentConfig[key].subs[subKey].enabled = enabled;
                    }
                }
            });
            document.getElementById(`cat-total-${key}`).textContent = catTotal + '%';
            grandTotal += catTotal;
        });

        const totalEl = document.getElementById('total-weight-display');
        totalEl.textContent = grandTotal + '%';
        totalEl.className = `badge fs-6 ${grandTotal === 100 ? 'bg-success' : 'bg-warning text-dark'}`;
    }

    // --- Modal 相關 ---
    openTiersModal(catKey, subKey) {
        this.activeModalSubKey = { cat: catKey, sub: subKey };
        const subConfig = this.currentConfig[catKey].subs[subKey];
        
        document.getElementById('modal-sub-label').textContent = `${subConfig.label} - 評分標準`;
        const tbody = document.getElementById('tiers-tbody');
        tbody.innerHTML = '';

        const tiers = subConfig.tiers || [{ limit: 0, score: 100, label: '優秀' }];
        tiers.forEach(t => this.addTierRow(t));
        this.tiersModal.show();
    }

    addTierRow(data = { limit: 1, score: 80, label: '' }) {
        const tbody = document.getElementById('tiers-tbody');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" class="form-control form-control-sm text-center tier-limit" value="${data.limit}"></td>
            <td><input type="number" class="form-control form-control-sm text-center tier-score" value="${data.score}"></td>
            <td><input type="text" class="form-control form-control-sm tier-label" value="${data.label}"></td>
            <td><button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    }

    saveTiers() {
        if (!this.activeModalSubKey) return;
        const { cat, sub } = this.activeModalSubKey;
        const rows = document.querySelectorAll('#tiers-tbody tr');
        const newTiers = [];

        rows.forEach(tr => {
            newTiers.push({
                limit: parseFloat(tr.querySelector('.tier-limit').value) || 0,
                score: parseInt(tr.querySelector('.tier-score').value) || 0,
                label: tr.querySelector('.tier-label').value.trim()
            });
        });

        // 排序
        newTiers.sort((a, b) => a.limit - b.limit);

        this.currentConfig[cat].subs[sub].tiers = newTiers;
        this.tiersModal.hide();
        alert('標準已暫存，請記得按「儲存設定」以寫入資料庫。');
    }

    async saveRules() {
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;
        try {
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });

            const constraints = {
                maxShiftTypesWeek: 2, 
                firstNRequiresOFF: document.getElementById('rule-first-n-off').checked,
                minConsecutiveSame: parseInt(document.getElementById('rule-min-consecutive').value) || 2,
                maxConsecutiveNight: parseInt(document.getElementById('rule-max-night').value) || 4,
                minInterval11h: document.getElementById('rule-min-11h').checked,
                allowMonthlyMixPref: document.getElementById('rule-month-mix').checked, 
                shiftSequence: ['OFF', 'N', 'D', 'E']
            };

            const processConfig = {
                enableBatchPrefill: document.getElementById('proc-batch-prefill').checked,
                enableHistory: document.getElementById('proc-history').checked,
                enablePruning: document.getElementById('proc-pruning').checked,
                enableForcePush: document.getElementById('proc-force').checked
            };
            
            // 更新 config 狀態 (確保 enabled/weight 最新)
            this.updateTotalWeightDisplay(); 

            const rulesData = { 
                maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                constraints: constraints, 
                processConfig: processConfig
            };

            await UnitService.updateUnit(this.targetUnitId, { 
                rules: rulesData,
                scoringConfig: this.currentConfig, // 儲存包含 tiers 的完整 config
                staffRequirements: staffReq
            });
            alert('✅ 設定已儲存');
        } catch(e) { console.error(e); alert('儲存失敗'); }
        finally { btn.disabled = false; }
    }
}
