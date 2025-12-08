import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() { this.currentUnitId = ''; this.currentShifts = []; }

    async render() {
        const user = authService.getProfile();
        // 關鍵：允許模擬狀態下的管理員切換
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        let unitControl = '';

        if (isAdmin) {
            const options = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitControl = `
                <div class="mb-4 d-flex align-items-center bg-light p-2 rounded border">
                    <label class="fw-bold me-2 text-danger mb-0">管理員模式：</label>
                    <select id="shift-settings-unit" class="form-select w-auto">
                        <option value="">請選擇單位...</option>
                        ${options}
                    </select>
                </div>`;
        } else {
            this.currentUnitId = user.unitId;
            const myUnit = units.find(u => u.unitId === user.unitId);
            unitControl = `<div class="mb-4"><span class="badge bg-info text-dark fs-6">設定單位：${myUnit ? myUnit.unitName : '...'}</span></div>`;
        }

        return `
            <div class="container-fluid mt-4">
                <h2 class="h3 mb-4 text-gray-800"><i class="fas fa-clock"></i> 班別設定</h2>
                ${unitControl}
                <div id="shifts-container" style="display:none;">
                    <div class="card shadow mb-4">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-bordered table-hover align-middle"><thead class="table-light"><tr><th>代號</th><th>名稱</th><th>時間</th><th>顏色</th><th>操作</th></tr></thead><tbody id="shifts-tbody"></tbody></table>
                            </div>
                            <button id="btn-add-shift" class="btn btn-success mt-3"><i class="fas fa-plus"></i> 新增班別</button>
                            <button id="btn-save-shifts" class="btn btn-primary mt-3 ms-2"><i class="fas fa-save"></i> 儲存變更</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        const unitSelect = document.getElementById('shift-settings-unit');

        const loadShifts = async () => {
            if(!this.currentUnitId) { document.getElementById('shifts-container').style.display = 'none'; return; }
            const unit = await UnitService.getUnitById(this.currentUnitId);
            this.currentShifts = unit?.settings?.shifts || [];
            this.renderTable();
            document.getElementById('shifts-container').style.display = 'block';
        };

        if (isAdmin && unitSelect) {
            unitSelect.addEventListener('change', (e) => { this.currentUnitId = e.target.value; loadShifts(); });
            // 預設選第一個
            if (unitSelect.options.length > 1) {
                unitSelect.selectedIndex = 1;
                this.currentUnitId = unitSelect.value;
                loadShifts();
            }
        } else {
            loadShifts();
        }

        document.getElementById('btn-add-shift').addEventListener('click', () => this.addEmptyRow());
        document.getElementById('btn-save-shifts').addEventListener('click', () => this.saveShifts());
        document.getElementById('shifts-tbody').addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete')) e.target.closest('tr').remove();
        });
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        tbody.innerHTML = this.currentShifts.map(s => `
            <tr class="shift-row">
                <td><input type="text" class="form-control form-control-sm s-code" value="${s.code}"></td>
                <td><input type="text" class="form-control form-control-sm s-name" value="${s.name}"></td>
                <td><div class="input-group input-group-sm"><input type="time" class="form-control s-start" value="${s.startTime}"><span class="input-group-text">-</span><input type="time" class="form-control s-end" value="${s.endTime}"></div></td>
                <td><input type="color" class="form-control form-control-color s-color" value="${s.color}"></td>
                <td><button class="btn btn-sm btn-danger btn-delete"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
    }

    addEmptyRow() {
        this.currentShifts.push({ code: '', name: '', startTime: '08:00', endTime: '16:00', color: '#ffffff' });
        this.renderTable();
    }

    async saveShifts() {
        if(!this.currentUnitId) return;
        const rows = document.querySelectorAll('.shift-row');
        const newShifts = [];
        rows.forEach(r => {
            const code = r.querySelector('.s-code').value.trim();
            if(code) newShifts.push({
                code, name: r.querySelector('.s-name').value,
                startTime: r.querySelector('.s-start').value, endTime: r.querySelector('.s-end').value,
                color: r.querySelector('.s-color').value
            });
        });
        const res = await UnitService.updateUnit(this.currentUnitId, { "settings.shifts": newShifts });
        if(res.success) alert('✅ 已儲存'); else alert('失敗');
    }
}
