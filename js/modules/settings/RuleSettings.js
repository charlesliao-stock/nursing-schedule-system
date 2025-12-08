import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() {
        this.targetUnitId = null;
        this.availableUnits = [];
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-ruler-combined"></i> 排班規則設定</h2>
                    <div class="d-flex align-items-center bg-white p-2 rounded shadow-sm border">
                        <label class="mb-0 fw-bold me-2 text-primary">設定單位：</label>
                        <select id="rule-unit-select" class="form-select form-select-sm fw-bold" style="min-width: 200px;">
                            <option value="">載入中...</option>
                        </select>
                    </div>
                </div>
                
                <div id="rule-content" style="display:none;">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3 bg-white">
                            <h6 class="m-0 font-weight-bold text-primary">每日人力最低需求 (Min Staff)</h6>
                        </div>
                        <div class="card-body">
                            <form id="rules-form">
                                <div class="table-responsive mb-4">
                                    <table class="table table-bordered text-center table-sm align-middle">
                                        <thead class="table-light"><tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr></thead>
                                        <tbody>${this.renderRow('D', '白班')}${this.renderRow('E', '小夜')}${this.renderRow('N', '大夜')}</tbody>
                                    </table>
                                </div>
                                <hr>
                                <h6 class="font-weight-bold text-dark">其他限制</h6>
                                <div class="row align-items-center mt-3">
                                    <div class="col-auto"><label>最大連續上班天數</label></div>
                                    <div class="col-auto"><input type="number" id="maxConsecutiveDays" class="form-control" value="6" style="width:100px;"></div>
                                </div>
                                <div class="mt-4 text-end">
                                    <button type="submit" class="btn btn-primary btn-lg shadow"><i class="fas fa-save"></i> 儲存設定</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <div id="no-permission-alert" class="alert alert-warning text-center" style="display:none;">無權限</div>
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

        // Fetch Logic (同 GroupSettings)
        const isRealAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        if (isRealAdmin) {
            this.availableUnits = await UnitService.getAllUnits();
        } else if (user.role === 'unit_manager') {
            this.availableUnits = await UnitService.getUnitsByManager(user.uid);
            if (this.availableUnits.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) this.availableUnits = [u];
            }
        } else {
            if(user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) this.availableUnits = [u];
            }
        }

        if (this.availableUnits.length === 0) {
            unitSelect.innerHTML = '<option>無單位</option>'; unitSelect.disabled = true;
            document.getElementById('no-permission-alert').style.display = 'block'; return;
        }

        unitSelect.innerHTML = this.availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        unitSelect.addEventListener('change', (e) => this.loadRules(e.target.value));
        
        this.loadRules(this.availableUnits[0].unitId); // Default load

        document.getElementById('rules-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const staffReq = { D:{}, E:{}, N:{} };
            document.querySelectorAll('.req-input').forEach(input => staffReq[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0);
            const rules = { maxConsecutiveWork: parseInt(document.getElementById('maxConsecutiveDays').value) };
            
            const res = await UnitService.updateUnit(this.targetUnitId, { rules, staffRequirements: staffReq });
            alert(res.success ? '✅ 已儲存' : '失敗');
        });
    }

    async loadRules(uid) {
        this.targetUnitId = uid;
        const unit = await UnitService.getUnitById(uid);
        const req = unit.staffRequirements || { D:{}, E:{}, N:{} };
        document.querySelectorAll('.req-input').forEach(i => i.value = req[i.dataset.shift]?.[i.dataset.day] || 0);
        document.getElementById('maxConsecutiveDays').value = unit.rules?.maxConsecutiveWork || 6;
        document.getElementById('rule-content').style.display = 'block';
    }
}
