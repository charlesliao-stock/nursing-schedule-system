import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
        this.currentShifts = [];
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        let unitOptions = '';

        if (isSystemAdmin) {
            unitOptions = '<option value="">請選擇...</option>' + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            // 單位管理者：鎖定自己
            const myUnit = units.find(u => u.unitId === user.unitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
                this.currentUnitId = myUnit.unitId; // 預先設定 ID
            }
        }

        const hourOptions = Array.from({length: 24}, (_, i) => `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container">
                <h2 class="mb-4"><i class="fas fa-clock"></i> 班別設定</h2>
                
                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold">設定單位：</label>
                            <select id="shift-settings-unit" class="form-select w-auto" ${!isSystemAdmin ? 'disabled' : ''}>
                                ${unitOptions}
                            </select>
                        </div>
                    </div>
                </div>

                <div id="shifts-container" style="display:none;">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h6 class="m-0 font-weight-bold text-primary">班別列表</h6>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-bordered table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th>代號</th><th>名稱</th><th>時間 (起-迄)</th><th>顏色</th><th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="shifts-tbody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card shadow border-left-primary">
                        <div class="card-header py-3">
                            <h6 class="m-0 font-weight-bold text-primary" id="form-title">新增班別</h6>
                        </div>
                        <div class="card-body">
                            <form id="shift-form">
                                <input type="hidden" id="shift-index" value="-1">
                                <div class="row g-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label">代號</label>
                                        <input type="text" id="shift-code" class="form-control" placeholder="如 D" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">名稱</label>
                                        <input type="text" id="shift-name" class="form-control" placeholder="如 白班" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">時間</label>
                                        <div class="input-group">
                                            <select id="start-hour" class="form-select">${hourOptions}</select>
                                            <span class="input-group-text">:</span>
                                            <select id="start-min" class="form-select">${minOptions}</select>
                                            <span class="input-group-text">~</span>
                                            <select id="end-hour" class="form-select">${hourOptions}</select>
                                            <span class="input-group-text">:</span>
                                            <select id="end-min" class="form-select">${minOptions}</select>
                                        </div>
                                    </div>
                                    <div class="col-md-1">
                                        <label class="form-label">顏色</label>
                                        <input type="color" id="shift-color" class="form-control form-control-color w-100" value="#3b82f6">
                                    </div>
                                    <div class="col-md-2">
                                        <div class="d-grid gap-2">
                                            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> 儲存</button>
                                            <button type="button" id="btn-cancel" class="btn btn-secondary" style="display:none;">取消</button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('shift-settings-unit');
        
        unitSelect.addEventListener('change', async (e) => {
            this.currentUnitId = e.target.value;
            this.loadShifts();
        });

        // 自動載入邏輯：如果已有 ID (單位管理者)，直接載入
        if (this.currentUnitId) {
            this.loadShifts();
        }

        // Form events
        document.getElementById('shift-form').addEventListener('submit', async (e) => { e.preventDefault(); await this.saveShift(); });
        document.getElementById('btn-cancel').addEventListener('click', () => this.resetForm());
        
        // Global handlers for dynamic rows
        window.handleEditShift = (index) => this.loadShiftToForm(index);
        window.handleDeleteShift = (index) => this.deleteShift(index);
    }

    async loadShifts() {
        if(!this.currentUnitId) {
            document.getElementById('shifts-container').style.display = 'none';
            return;
        }
        const unit = await UnitService.getUnitById(this.currentUnitId);
        this.currentShifts = unit?.settings?.shifts || [];
        this.renderTable();
        document.getElementById('shifts-container').style.display = 'block';
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        if (this.currentShifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-muted">尚無班別設定</td></tr>';
            return;
        }
        tbody.innerHTML = this.currentShifts.map((s, idx) => `
            <tr>
                <td class="fw-bold">${s.code}</td>
                <td>${s.name}</td>
                <td>${s.startTime} ~ ${s.endTime}</td>
                <td><span class="badge rounded-pill" style="background-color:${s.color}; width:30px;">&nbsp;</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.handleEditShift(${idx})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.handleDeleteShift(${idx})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    loadShiftToForm(index) {
        const s = this.currentShifts[index];
        if (!s) return;
        document.getElementById('shift-index').value = index;
        document.getElementById('shift-code').value = s.code;
        document.getElementById('shift-name').value = s.name;
        document.getElementById('shift-color').value = s.color;
        
        const [sh, sm] = s.startTime.split(':');
        const [eh, em] = s.endTime.split(':');
        document.getElementById('start-hour').value = sh;
        document.getElementById('start-min').value = sm;
        document.getElementById('end-hour').value = eh;
        document.getElementById('end-min').value = em;

        document.getElementById('form-title').textContent = '編輯班別';
        document.getElementById('btn-cancel').style.display = 'block';
    }

    async saveShift() {
        const index = parseInt(document.getElementById('shift-index').value);
        const newShift = {
            code: document.getElementById('shift-code').value.toUpperCase(),
            name: document.getElementById('shift-name').value,
            color: document.getElementById('shift-color').value,
            startTime: `${document.getElementById('start-hour').value}:${document.getElementById('start-min').value}`,
            endTime: `${document.getElementById('end-hour').value}:${document.getElementById('end-min').value}`
        };

        if (index === -1) this.currentShifts.push(newShift);
        else this.currentShifts[index] = newShift;

        const res = await UnitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
        if (res.success) { this.renderTable(); this.resetForm(); alert('儲存成功'); }
        else alert('儲存失敗: ' + res.error);
    }

    async deleteShift(index) {
        if(!confirm('確定刪除？')) return;
        this.currentShifts.splice(index, 1);
        const res = await UnitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
        if(res.success) this.renderTable();
        else alert('刪除失敗');
    }

    resetForm() {
        document.getElementById('shift-form').reset();
        document.getElementById('shift-index').value = "-1";
        document.getElementById('form-title').textContent = '新增班別';
        document.getElementById('btn-cancel').style.display = 'none';
    }
}
