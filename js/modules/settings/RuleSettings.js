import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ScoringService } from "../../services/ScoringService.js";

export class RuleSettings {
    constructor() { 
        this.targetUnitId = null; 
        this.currentConfig = null; 
        this.activeModalSubKey = null; 
        this.tiersModal = null; // 儲存 Modal 實例
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-ruler-combined"></i> 規則與評分設定</h3>
                    <p class="text-muted small mb-0">設定每日人力需求、勞基法規範及排班品質評分權重。</p>
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
                        <li class="nav-item"><button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#tab-min">人力需求 (Hard)</button></li>
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-constraints">排班設定 (Rules)</button></li>
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">評分權重 (Soft)</button></li>
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
                                <div class="col-md-6">
                                    <div class="card shadow mb-4 border-left-danger h-100">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-danger"><i class="fas fa-gavel"></i> 勞基法與硬性規範</h6></div>
                                        <div class="card-body">
                                            <div class="mb-4">
                                                <div class="form-check form-switch mb-2">
                                                    <input class="form-check-input" type="checkbox" id="rule-min-interval-11">
                                                    <label class="form-check-label fw-bold" for="rule-min-interval-11">班與班間隔至少 11 小時</label>
                                                </div>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label fw-bold">一週內班別種類上限</label>
                                                <select class="form-select" id="rule-max-shift-types">
                                                    <option value="99">不限制</option>
                                                    <option value="2">最多 2 種</option>
                                                    <option value="1">僅限 1 種</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card shadow mb-4 border-left-info h-100">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-info"><i class="fas fa-sliders-h"></i> 單位排班原則</h6></div>
                                        <div class="card-body">
                                            <div class="mb-4">
                                                <div class="form-check form-switch mb-2">
                                                    <input class="form-check-input" type="checkbox" id="rule-pre-night-off">
                                                    <label class="form-check-label fw-bold" for="rule-pre-night-off">排大夜前一天須為 N 或 OFF</label>
                                                </div>
                                            </div>
                                            <div class="row g-3">
                                                <div class="col-md-6"><label class="fw-bold">同種班最少連續</label><input type="number" class="form-control" id="rule-min-consecutive" value="2"></div>
                                                <div class="col-md-6"><label class="fw-bold">夜班最多連續</label><input type="number" class="form-control" id="rule-max-night-consecutive" value="4"></div>
                                                <div class="col-12"><label class="fw-bold">最大連續上班天數</label><input type="number" class="form-control" id="rule-max-work-days" value="6"></div>
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
                                    <div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> 設定後請記得點擊右上角「儲存設定」。</div>
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
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span id="modal-sub-label" class="fw-bold text-primary"></span>
                                <button class="btn btn-sm btn-outline-warning" onclick="window.routerPage.resetTiersToDefault()">
                                    <i class="fas fa-undo"></i> 恢復預設
                                </button>
                            </div>
                            
                            <div id="modal-exclude-batch-wrapper" class="mb-3 p-2 bg-light rounded border d-none">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="modal-exclude-batch-input">
                                    <label class="form-check-label fw-bold" for="modal-exclude-batch-input">包班者不計 (Exclude Batch)</label>
                                </div>
                                <small class="text-muted">開啟後，計算此指標時將排除包班人員。</small>
                            </div>

                            <table class="table table-sm table-bordered text-center align-middle">
                                <thead class="table-light"><tr><th>數值 (≤)</th><th>得分</th><th>評語</th><th>操作</th></tr></thead>
                                <tbody id="tiers-tbody"></tbody>
                            </table>
                            <button class="btn btn-sm btn-outline-success w-100" onclick="window.routerPage.addTierRow()">+ 新增階梯</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" onclick="window.routerPage.saveTiers()">確認暫存</button>
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

    // 渲染主列表：這裡已經移除包班不計的 Checkbox
    renderCategoryCard(key, category) {
        let subsHtml = '';
        if (category.subs) {
            Object.entries(category.subs).forEach(([subKey, sub]) => {
                subsHtml += `
                    <div class="d-flex justify-content-between align-items-center mb-2 ps-3 border-start border-3 border-light py-1">
                        <div class="d-flex flex-column" style="width: 55%;">
                            <div class="d-flex align-items-center">
                                <div class="form-check form-switch me-2">
                                    <input class="form-check-input sub-enable" type="checkbox" id="sub-enable-${key}-${subKey}" 
                                           data-cat="${key}" data-sub="${subKey}" ${sub.enabled ? 'checked' : ''}>
                                </div>
                                <div class="text-truncate small fw-bold" title="${sub.label}">${sub.label}</div>
                                <i class="fas fa-question-circle text-muted ms-2 cursor-pointer" 
                                   data-bs-toggle="tooltip" data-bs-placement="top" title="${sub.desc || '無說明'}"></i>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:0.75rem" 
                                    onclick="window.routerPage.openTiersModal('${key}', '${subKey}')">
                                <i class="fas fa-cog"></i> 標準
                            </button>
                            <div class="input-group input-group-sm" style="width: 80px;">
                                <input type="number" class="form-control sub-weight text-center px-1" 
                                       id="sub-weight-${key}-${subKey}" data-cat="${key}" data-sub="${subKey}"
                                       value="${sub.weight}" min="0" max="100">
                                <span class="input-group-text px-1">%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="col-md-6 col-lg-6">
                <div class="card h-100 border-left-${this.getColor(key)}">
                    <div class="card-body p-3">
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
        const map = { fairness: 'primary', satisfaction: 'info', fatigue: 'warning', efficiency: 'success', cost: 'danger' };
        return map[key] || 'secondary';
    }

    async afterRender() {
        window.routerPage = this; 
        this.tiersModal = new bootstrap.Modal(document.getElementById('tiers-modal'));

        [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]')).map(el => new bootstrap.Tooltip(el));

        const unitSelect = document.getElementById('rule-unit-select');
        let units = await UnitService.getAllUnits();
        
        if(units.length > 0) {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            this.loadRules(units[0].unitId);
        }

        // 綁定右上角的主儲存按鈕
        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
        
        // 綁定權重輸入變更事件
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

        // 1. Scoring Config (載入與合併)
        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
        
        Object.keys(savedConfig).forEach(catKey => {
            if(this.currentConfig[catKey] && savedConfig[catKey].subs) {
                Object.keys(savedConfig[catKey].subs).forEach(subKey => {
                    if(this.currentConfig[catKey].subs[subKey]) {
                        const target = this.currentConfig[catKey].subs[subKey];
                        const source = savedConfig[catKey].subs[subKey];
                        target.enabled = source.enabled;
                        target.weight = source.weight;
                        if(source.tiers) target.tiers = source.tiers;
                        // 確保 excludeBatch 被正確載入到記憶體中
                        if(source.excludeBatch !== undefined) target.excludeBatch = source.excludeBatch;
                    }
                });
            }
        });

        // 渲染 Scoring UI
        const container = document.getElementById('scoring-config-container');
        container.innerHTML = '';
        ['fairness', 'satisfaction', 'fatigue', 'efficiency', 'cost'].forEach(key => {
            container.innerHTML += this.renderCategoryCard(key, this.currentConfig[key]);
        });
        
        [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]')).map(el => new bootstrap.Tooltip(el));
        this.updateTotalWeightDisplay();

        // 2. 載入 Constraints
        const rules = unit.rules || {};
        document.getElementById('rule-min-interval-11').checked = rules.minInterval11 !== false;
        document.getElementById('rule-max-shift-types').value = rules.maxShiftTypes || 99;
        document.getElementById('rule-pre-night-off').checked = rules.preNightOff !== false;
        document.getElementById('rule-min-consecutive').value = rules.minConsecutive || 2;
        document.getElementById('rule-max-night-consecutive').value = rules.maxNightConsecutive || 4;
        document.getElementById('rule-max-work-days').value = rules.maxWorkDays || 6;

        // 3. 載入 Staff Req
        const reqs = unit.staffRequirements || {};
        document.querySelectorAll('.req-input').forEach(input => {
            const shift = input.dataset.shift;
            const day = input.dataset.day;
            input.value = reqs[shift]?.[day] || 0;
        });

        document.getElementById('rule-content').style.display = 'block';
    }

    // 更新主畫面的權重顯示 (同時更新記憶體中的 enabled 和 weight 狀態)
    updateTotalWeightDisplay() {
        let grandTotal = 0;
        const categories = ['fairness', 'satisfaction', 'fatigue', 'efficiency', 'cost'];
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
                } else {
                     if(this.currentConfig[key].subs[subKey]) {
                        this.currentConfig[key].subs[subKey].enabled = false;
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
    
    // 開啟 Modal 時
    openTiersModal(catKey, subKey) {
        this.activeModalSubKey = { cat: catKey, sub: subKey };
        const subConfig = this.currentConfig[catKey].subs[subKey];
        document.getElementById('modal-sub-label').textContent = subConfig.label;

        // --- 處理包班不計開關的顯示與狀態 ---
        const excludeWrapper = document.getElementById('modal-exclude-batch-wrapper');
        const excludeInput = document.getElementById('modal-exclude-batch-input');
        
        // 只有當此項目支援 excludeBatch (在預設config中有定義) 時才顯示
        if (subConfig.excludeBatch !== undefined) {
            excludeWrapper.classList.remove('d-none');
            excludeInput.checked = subConfig.excludeBatch;
        } else {
            excludeWrapper.classList.add('d-none');
        }
        // -------------------------------------

        const tbody = document.getElementById('tiers-tbody');
        tbody.innerHTML = '';
        const tiers = subConfig.tiers || [];
        tiers.forEach(t => this.addTierRow(t));
        this.tiersModal.show();
    }

    addTierRow(data = { limit: 0, score: 0, label: '優' }) {
        const tbody = document.getElementById('tiers-tbody');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" class="form-control form-control-sm text-center tier-limit" value="${data.limit}" step="0.1"></td>
            <td><input type="number" class="form-control form-control-sm text-center tier-score" value="${data.score}"></td>
            <td><input type="text" class="form-control form-control-sm tier-label" value="${data.label}"></td>
            <td><button class="btn btn-sm btn-outline-danger border-0" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(tr);
    }

    resetTiersToDefault() {
        if (!confirm("確定要恢復此項目的預設評分標準嗎？")) return;
        const { cat, sub } = this.activeModalSubKey;
        const defaultConfig = ScoringService.getDefaultConfig();
        const defaultTiers = defaultConfig[cat].subs[sub].tiers;
        
        // 恢復 Tiers
        const tbody = document.getElementById('tiers-tbody');
        tbody.innerHTML = '';
        defaultTiers.forEach(t => this.addTierRow(t));

        // 恢復 Exclude Batch 設定
        const excludeInput = document.getElementById('modal-exclude-batch-input');
        if (defaultConfig[cat].subs[sub].excludeBatch !== undefined) {
            excludeInput.checked = defaultConfig[cat].subs[sub].excludeBatch;
        }
    }

    // Modal 內的確認按鈕 (暫存到記憶體)
    saveTiers() {
        if (!this.activeModalSubKey) return;
        const { cat, sub } = this.activeModalSubKey;
        
        // 1. 儲存 Tiers
        const rows = document.querySelectorAll('#tiers-tbody tr');
        const newTiers = [];
        rows.forEach(tr => {
            newTiers.push({
                limit: parseFloat(tr.querySelector('.tier-limit').value) || 0,
                score: parseInt(tr.querySelector('.tier-score').value) || 0,
                label: tr.querySelector('.tier-label').value.trim()
            });
        });
        newTiers.sort((a, b) => a.limit - b.limit);
        this.currentConfig[cat].subs[sub].tiers = newTiers;

        // 2. 儲存 Exclude Batch 設定 (關鍵修復)
        const excludeWrapper = document.getElementById('modal-exclude-batch-wrapper');
        if (!excludeWrapper.classList.contains('d-none')) {
            const isChecked = document.getElementById('modal-exclude-batch-input').checked;
            this.currentConfig[cat].subs[sub].excludeBatch = isChecked;
        }

        this.tiersModal.hide();
    }

    // 全域儲存按鈕 (寫入資料庫)
    async saveRules() {
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;
        try {
            // 確保權重有更新 (但不要去抓 DOM 裡的 excludeBatch，因為已經移走了)
            this.updateTotalWeightDisplay();
            
            // 1. 收集 Rules
            const rules = {
                minInterval11: document.getElementById('rule-min-interval-11').checked,
                maxShiftTypes: document.getElementById('rule-max-shift-types').value,
                preNightOff: document.getElementById('rule-pre-night-off').checked,
                minConsecutive: parseInt(document.getElementById('rule-min-consecutive').value),
                maxNightConsecutive: parseInt(document.getElementById('rule-max-night-consecutive').value),
                maxWorkDays: parseInt(document.getElementById('rule-max-work-days').value)
            };

            // 2. 收集 Staff Requirements
            const reqs = { D: {}, E: {}, N: {} };
            document.querySelectorAll('.req-input').forEach(input => {
                const shift = input.dataset.shift;
                const day = input.dataset.day;
                reqs[shift][day] = parseInt(input.value) || 0;
            });

            // 3. 儲存 (使用已經在記憶體中更新好的 currentConfig)
            await UnitService.updateUnit(this.targetUnitId, { 
                scoringConfig: this.currentConfig, // 這裡包含了 Modal 中修改過的 excludeBatch
                rules: rules,
                staffRequirements: reqs
            });
            alert('✅ 設定已儲存');
        } catch(e) { console.error(e); alert('儲存失敗'); }
        finally { btn.disabled = false; }
    }
}
