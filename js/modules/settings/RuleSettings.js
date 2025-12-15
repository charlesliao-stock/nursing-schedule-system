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
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">評分標準</button></li>
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
                            <div class="alert alert-info">排班規則設定區塊 (請保持原樣)</div>
                        </div>

                        <div class="tab-pane fade" id="tab-scoring">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 fw-bold text-success">評分權重與標準配置</h6>
                                    <div>總權重: <span id="total-weight-display" class="badge bg-secondary fs-6">100%</span></div>
                                </div>
                                <div class="card-body">
                                    <div class="alert alert-info small mb-3"><i class="fas fa-info-circle"></i> 設定後請記得儲存。勾選「包夜班不計」可排除包班人員。</div>
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
                                    <i class="fas fa-undo"></i> 恢復預設值
                                </button>
                            </div>
                            <table class="table table-sm table-bordered text-center align-middle">
                                <thead class="table-light"><tr><th>數值 (≤)</th><th>得分</th><th>評語</th><th>操作</th></tr></thead>
                                <tbody id="tiers-tbody"></tbody>
                            </table>
                            <button class="btn btn-sm btn-outline-success w-100" onclick="window.routerPage.addTierRow()">+ 新增階梯</button>
                        </div>
                        <div class="modal-footer">
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

    renderCategoryCard(key, category) {
        let subsHtml = '';
        if (category.subs) {
            Object.entries(category.subs).forEach(([subKey, sub]) => {
                // ✅ 檢查是否支援 "excludeBatch" 選項
                const batchOption = sub.excludeBatch !== undefined ? `
                    <div class="form-check d-inline-block ms-2" title="排除包班人員">
                        <input class="form-check-input sub-exclude-batch" type="checkbox" 
                               id="sub-exclude-${key}-${subKey}" data-cat="${key}" data-sub="${subKey}" 
                               ${sub.excludeBatch ? 'checked' : ''}>
                        <label class="form-check-label small" style="font-size:0.7rem" for="sub-exclude-${key}-${subKey}">包夜班不計</label>
                    </div>
                ` : '';

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
                            ${batchOption ? `<div class="ms-4">${batchOption}</div>` : ''}
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

        // Tooltip 初始化
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });

        // 載入單位與規則
        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        let units = await UnitService.getAllUnits();
        
        if(units.length > 0) {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            this.loadRules(units[0].unitId);
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

        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        
        this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
        
        // Deep Merge
        Object.keys(savedConfig).forEach(catKey => {
            if(this.currentConfig[catKey] && savedConfig[catKey].subs) {
                Object.keys(savedConfig[catKey].subs).forEach(subKey => {
                    if(this.currentConfig[catKey].subs[subKey]) {
                        const target = this.currentConfig[catKey].subs[subKey];
                        const source = savedConfig[catKey].subs[subKey];
                        
                        target.enabled = source.enabled;
                        target.weight = source.weight;
                        if(source.tiers) target.tiers = source.tiers;
                        // ✅ 同步 excludeBatch 設定
                        if(source.excludeBatch !== undefined) target.excludeBatch = source.excludeBatch;
                    }
                });
            }
        });

        // 渲染容器
        const container = document.getElementById('scoring-config-container');
        container.innerHTML = '';
        const categories = ['fairness', 'satisfaction', 'fatigue', 'efficiency', 'cost'];
        categories.forEach(key => {
            container.innerHTML += this.renderCategoryCard(key, this.currentConfig[key]);
        });

        // Re-init Tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

        this.updateTotalWeightDisplay();
        document.getElementById('rule-content').style.display = 'block';
    }

    updateTotalWeightDisplay() {
        let grandTotal = 0;
        const categories = ['fairness', 'satisfaction', 'fatigue', 'efficiency', 'cost'];

        categories.forEach(key => {
            let catTotal = 0;
            document.querySelectorAll(`.sub-weight[data-cat="${key}"]`).forEach(input => {
                const subKey = input.dataset.sub;
                const enabled = document.getElementById(`sub-enable-${key}-${subKey}`).checked;
                
                // ✅ 同步 excludeBatch
                const excludeEl = document.getElementById(`sub-exclude-${key}-${subKey}`);
                if (excludeEl && this.currentConfig[key].subs[subKey]) {
                    this.currentConfig[key].subs[subKey].excludeBatch = excludeEl.checked;
                }

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

    openTiersModal(catKey, subKey) {
        this.activeModalSubKey = { cat: catKey, sub: subKey };
        const subConfig = this.currentConfig[catKey].subs[subKey];
        document.getElementById('modal-sub-label').textContent = subConfig.label;
        
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
        
        const tbody = document.getElementById('tiers-tbody');
        tbody.innerHTML = '';
        defaultTiers.forEach(t => this.addTierRow(t));
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

        newTiers.sort((a, b) => a.limit - b.limit);
        this.currentConfig[cat].subs[sub].tiers = newTiers;
        this.tiersModal.hide();
    }

    async saveRules() {
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;
        try {
            this.updateTotalWeightDisplay();
            // (人力需求與排班規則的儲存邏輯保持不變，省略以節省篇幅)
            // ...
            await UnitService.updateUnit(this.targetUnitId, { 
                scoringConfig: this.currentConfig,
                // ...
            });
            alert('✅ 設定已儲存');
        } catch(e) { console.error(e); alert('儲存失敗'); }
        finally { btn.disabled = false; }
    }
}
