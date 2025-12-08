import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        const isAdmin = this.currentUser.role === 'system_admin';
        
        // 單位選擇器 HTML
        let unitSelector = '';
        if (isAdmin) {
             unitSelector = `
                <div class="mb-4 d-flex align-items-center bg-light p-2 rounded">
                    <label class="fw-bold me-2 text-danger"><i class="fas fa-user-shield"></i> 管理員模式 - 選擇單位：</label>
                    <select id="rule-unit-select" class="form-select form-select-sm w-auto">
                        <option value="">載入中...</option>
                    </select>
                </div>`;
        } else {
             // 單位管理者：先顯示 Loading，afterRender 再填入名稱
             unitSelector = `
                <div class="mb-4 d-flex align-items-center">
                    <span class="badge bg-info text-dark fs-6">
                        <i class="fas fa-hospital"></i> 本單位：<span id="unit-name-display">載入中...</span>
                    </span>
                </div>`;
             this.targetUnitId = this.currentUser.unitId;
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-ruler-combined"></i> 排班規則設定</h2>
                </div>
                
                ${unitSelector}
                
                <div id="rule-content" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white border-bottom-primary">
                                    <h6 class="m-0 font-weight-bold text-primary">每日人力最低需求 (Min Staff)</h6>
                                </div>
                                <div class="card-body">
                                    <form id="rules-form">
                                        <div class="table-responsive">
                                            <table class="table table-bordered text-center table-sm align-middle">
                                                <thead class="table-light">
                                                    <tr>
                                                        <th style="width:10%">班別</th>
                                                        <th>週一</th><th>週二</th><th>週三</th><th>週四</th><th>週五</th>
                                                        <th class="text-danger bg-light-danger">週六</th>
                                                        <th class="text-danger bg-light-danger">週日</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${this.renderRow('D', '白班')}
                                                    ${this.renderRow('E', '小夜')}
                                                    ${this.renderRow('N', '大夜')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white border-bottom-warning">
                                    <h6 class="m-0 font-weight-bold text-dark">排班限制參數</h6>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">連續上班上限 (天)</label>
                                        <input type="number" id="maxConsecutiveDays" class="form-control" value="6">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">每週最少休假 (天)</label>
                                        <input type="number" id="minOffDays" class="form-control" value="2">
                                    </div>
                                    <hr>
                                    <div class="form-check form-switch mb-2">
                                        <input class="form-check-input" type="checkbox" id="allow-n-to-d">
                                        <label class="form-check-label" for="allow-n-to-d">允許 N 接 D (通常禁止)</label>
                                    </div>
                                </div>
                                <div class="card-footer bg-white">
                                    <button id="btn-save-rules" class="btn btn-primary w-100 shadow">
                                        <i class="fas fa-save"></i> 儲存所有設定
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="no-unit-alert" class="alert alert-warning text-center" style="display:none;">
                    請先選擇要設定的單位
                </div>
            </div>
        `;
    }

    renderRow(shift, label) {
        let html = `<tr><td class="fw-bold bg-light">${label}</td>`;
        // 0=Sun, 1=Mon...6=Sat. 這裡順序是 1..6, 0
        const days = [1, 2, 3, 4, 5, 6, 0];
        days.forEach(d => {
            html += `<td><input type="number" class="form-control form-control-sm text-center req-input" 
                      data-shift="${shift}" data-day="${d}" value="0" min="0"></td>`;
        });
        return html + '</tr>';
    }

    async afterRender() {
        const isAdmin = this.currentUser.role === 'system_admin';
        const unitSelect = document.getElementById('rule-unit-select');
        
        // 載入邏輯
        const loadRules = async (uid) => {
            if(!uid) {
                document.getElementById('rule-content').style.display = 'none';
                document.getElementById('no-unit-alert').style.display = 'block';
                return;
            }
            this.targetUnitId = uid;
            
            try {
                // 改用 UnitService 讀取 (標準化)
                const unitData = await UnitService.getUnitById(uid);
                const savedRules = unitData.rules || {};
                const staffReq = unitData.staffRequirements || { D:{}, E:{}, N:{} };

                // 1. 填入人力需求 (Min Staff)
                document.querySelectorAll('.req-input').forEach(input => {
                    const s = input.dataset.shift;
                    const d = input.dataset.day;
                    // 資料庫結構可能是 staffRequirements: { D: {1: 5, 2: 5...} }
                    input.value = staffReq[s]?.[d] || 0;
                });

                // 2. 填入限制參數
                document.getElementById('maxConsecutiveDays').value = savedRules.maxConsecutiveWork || 6;
                document.getElementById('minOffDays').value = savedRules.minOffDays || 2;
                document.getElementById('allow-n-to-d').checked = !!savedRules.allowNtoD;

                document.getElementById('rule-content').style.display = 'block';
                document.getElementById('no-unit-alert').style.display = 'none';

            } catch (e) {
                console.error(e);
                alert("讀取規則失敗");
            }
        };

        // 初始化
        if (isAdmin) {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">請選擇...</option>` + 
                                   units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            unitSelect.addEventListener('change', (e) => loadRules(e.target.value));
            
            // 自動選第一個
            if(units.length > 0) {
                unitSelect.value = units[0].unitId;
                loadRules(units[0].unitId);
            } else {
                document.getElementById('no-unit-alert').style.display = 'block';
            }
        } else {
            // 單位主管
            const unit = await UnitService.getUnitById(this.targetUnitId);
            if(unit) document.getElementById('unit-name-display').textContent = unit.unitName;
            loadRules(this.targetUnitId);
        }

        // 綁定儲存
        document.getElementById('btn-save-rules').addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-rules');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

            try {
                // 收集人力需求
                const staffReq = { D:{}, E:{}, N:{} };
                document.querySelectorAll('.req-input').forEach(input => {
                    staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
                });

                // 收集規則參數
                const rulesData = {
                    maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value),
                    minOffDays: parseInt(document.getElementById('minOffDays').value),
                    allowNtoD: document.getElementById('allow-n-to-d').checked
                };

                // 寫入 Firestore (UnitService.updateUnit 支援 partial update)
                await UnitService.updateUnit(this.targetUnitId, {
                    rules: rulesData,
                    staffRequirements: staffReq
                });

                alert('✅ 設定已成功儲存！');

            } catch (e) {
                alert('❌ 儲存失敗: ' + e.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> 儲存所有設定';
            }
        });
    }
}
