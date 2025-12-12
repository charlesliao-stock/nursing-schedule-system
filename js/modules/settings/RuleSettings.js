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
                        <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#tab-scoring">評分權重 (Soft)</button></li>
                    </ul>
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-min">
                            <div class="row">
                                <div class="col-lg-8">
                                    <div class="card shadow mb-4">
                                        <div class="card-header py-3 bg-white"><h6 class="m-0 fw-bold text-primary">每日最低人力</h6></div>
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
                                            <div class="mb-3"><label class="form-label fw-bold">最大連續上班天數</label><input type="number" id="maxConsecutiveDays" class="form-control" value="6"></div>
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

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('rule-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let units = [];
        if (isAdmin) units = await UnitService.getAllUnits();
        else {
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
            // ✅ 關鍵：若只有一個單位，則鎖定選單
            if (units.length === 1) unitSelect.disabled = true;
            
            unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
            if(unitSelect.options.length > 0) this.loadRules(unitSelect.value);
        }

        document.getElementById('btn-save-rules').addEventListener('click', () => this.saveRules());
        document.getElementById('rule-content').addEventListener('input', (e) => {
            if (e.target.classList.contains('sub-weight') || e.target.classList.contains('sub-enable')) this.updateTotalWeightDisplay();
        });
    }

    // (省略 renderCategoryCard, loadRules, updateTotalWeightDisplay, saveRules 等方法，請使用原檔的內容，此處僅更新了 afterRender 與 render)
    // 為確保完整性，若需要完整代碼請參照原上傳檔案並套用上述 afterRender 的修改。
    // 為了節省篇幅，以下函式請從第二批的 RuleSettings.js 複製：
    renderCategoryCard(key, category) { /*...*/ return `...`; }
    getColor(key) { /*...*/ }
    async loadRules(uid) { /*...*/ }
    updateTotalWeightDisplay() { /*...*/ }
    async saveRules() { /*...*/ }
}
