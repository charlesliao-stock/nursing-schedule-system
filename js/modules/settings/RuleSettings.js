import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ScoringService } from "../../services/ScoringService.js";

export class RuleSettings {
    constructor() { 
        this.targetUnitId = null; 
        this.currentConfig = null; 
        this.activeModalSubKey = null; // 用於 Modal 編輯
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
                            <div class="alert alert-info">排班規則設定區塊 (保留原有功能)</div>
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

        const staffReq = unit.staffRequirements || { D:{}, E:{}, N:{} };
        // 取得預設 Config，並與資料庫儲存的 Config 合併 (保留使用者自訂的 Tiers)
        const defaultConfig = ScoringService.getDefaultConfig();
        const savedConfig = unit.scoringConfig || {};
        
        this.currentConfig = JSON.parse(JSON.stringify(defaultConfig));
        
        // Deep Merge: 保留 Saved 的 Tiers 與 Weights
        Object.keys(savedConfig).forEach(catKey => {
            if(this.currentConfig[catKey] && savedConfig[catKey].subs) {
                Object.keys(savedConfig[catKey].subs).forEach(subKey => {
                    if(this.currentConfig[catKey].subs[subKey]) {
                        // 覆蓋 saved 的值
                        this.currentConfig[catKey].subs[subKey] = savedConfig[catKey].subs[subKey];
                    }
                });
            }
        });

        // 渲染人力需求
        document.querySelectorAll('.req-input').forEach(input => {
            input.value = staffReq[input.dataset.shift]?.[input.dataset.day] || 0;
        });

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
                    // 同步更新記憶體中的 config，以便 Modal 讀取
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

        // 預設 Tiers 如果沒有，給一個預設值
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

        // 排序：由小到大 (因為邏輯是 <= limit)
        newTiers.sort((a, b) => a.limit - b.limit);

        this.currentConfig[cat].subs[sub].tiers = newTiers;
        this.tiersModal.hide();
        alert('標準已暫存，請記得按「儲存設定」以寫入資料庫。');
    }

    async saveRules() {
        // (保存邏輯：將 this.currentConfig 存入 DB)
        // ... (同前，但將 scoringConfig 設為 this.currentConfig)
        const btn = document.getElementById('btn-save-rules');
        btn.disabled = true;
        try {
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => {
                staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });
            
            // 更新 config 狀態
            this.updateTotalWeightDisplay(); 

            await UnitService.updateUnit(this.targetUnitId, { 
                scoringConfig: this.currentConfig, // 儲存包含 tiers 的完整 config
                staffRequirements: staffReq
            });
            alert('✅ 設定已儲存');
        } catch(e) { console.error(e); alert('儲存失敗'); }
        finally { btn.disabled = false; }
    }
}
