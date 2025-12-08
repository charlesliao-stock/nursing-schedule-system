import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() { this.currentUnitId = ''; this.currentShifts = []; }

    async render() {
        const user = authService.getProfile();
        // ✅ 關鍵：允許模擬狀態下的管理員切換
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        let unitControl = '';

        if (isAdmin) {
            const options = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitControl = `
                <div class="mb-4 d-flex align-items-center bg-light p-2 rounded border">
                    <label class="fw-bold me-2 text-danger mb-0">管理員/模擬模式：</label>
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

        const hourOptions = Array.from({length: 24}, (_, i) => `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container-fluid mt-4">
                <h2 class="h3 mb-4 text-gray-800"><i class="fas fa-clock"></i> 班別設定</h2>
                ${unitControl}
                <div id="shifts-container" style="display:none;">
                    <div class="row">
                        <div class="col-lg-7">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white d-flex justify-content-between">
                                    <h6 class="m-0 font-weight-bold text-primary">班別列表</h6>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle mb-0">
                                            <thead class="table-light"><tr><th>代號</th><th>名稱</th><th>時間</th><th>顏色</th><th>操作</th></tr></thead>
                                            <tbody id="shifts-tbody"></tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-lg-5">
                            <div class="card shadow border-left-success">
                                <div class="card-header py-3 bg-white">
                                    <h6 class="m-0 font-weight-bold text-success" id="form-title">新增班別</h6>
                                </div>
                                <div class="card-body">
                                    <form id="shift-form">
                                        <input type="hidden" id="shift-index" value="-1">
                                        <div class="row g-2 mb-3">
                                            <div class="col-4"><label class="form-label small fw-bold">代號</label><input type="text" id="shift-code" class="form-control" placeholder="D" required></div>
                                            <div class="col-8"><label class="form-label small fw-bold">名稱</label><input type="text" id="shift-name" class="form-control" placeholder="白班" required></div>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">時間範圍</label>
                                            <div class="input-group">
                                                <select id="start-hour" class="form-select">${hourOptions}</select><span class="input-group-text">:</span><select id="start-min" class="form-select">${minOptions}</select>
                                                <span class="input-group-text mx-1">至</span>
                                                <select id="end-hour" class="form-select">${hourOptions}</select><span class="input-group-text">:</span><select id="end-min" class="form-select">${minOptions}</select>
                                            </div>
                                        </div>
                                        <div class="mb-3"><label class="form-label small fw-bold">顏色</label><input type="color" id="shift-color" class="form-control form-control-color w-100" value="#3b82f6"></div>
                                        <div class="d-grid gap-2">
                                            <button type="submit" class="btn btn-success"><i class="fas fa-plus-circle"></i> 加入/更新列表</button>
                                            <button type="button" id="btn-cancel" class="btn btn-secondary btn-sm" style="display:none;">取消編輯</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                            <div class="mt-3">
                                <button id="btn-save-all" class="btn btn-primary w-100 shadow py-2"><i class="fas fa-save"></i> 儲存所有變更</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="no-unit-alert" class="alert alert-warning text-center" style="display:none;">請先選擇單位</div>
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
            document.getElementById('no-unit-alert').style.display = 'none';
        };

        if (isAdmin && unitSelect) {
            unitSelect.addEventListener('change', (e) => { this.currentUnitId = e.target.value; loadShifts(); });
            if (unitSelect.options.length > 1) {
                unitSelect.selectedIndex = 1;
                this.currentUnitId = unitSelect.value;
                loadShifts();
            }
        } else {
            loadShifts();
        }

        document.getElementById('shift-form').addEventListener('submit', (e) => { e.preventDefault(); this.addOrUpdateShift(); });
        document.getElementById('btn-cancel').addEventListener('click', () => this.resetForm());
        document.getElementById('btn-save-all').addEventListener('click', async () => {
            if(!this.currentUnitId) return;
            const res = await UnitService.updateUnit(this.currentUnitId, { "settings.shifts": this.currentShifts });
            if(res.success) alert('✅ 班別設定已儲存'); else alert('失敗');
        });
        
        window.handleEditShift = (index) => this.loadShiftToForm(index);
        window.handleDeleteShift = (index) => this.deleteShift(index);
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        tbody.innerHTML = this.currentShifts.map((s, idx) => `
            <tr>
                <td class="fw-bold text-primary">${s.code}</td>
                <td>${s.name}</td>
                <td><small>${s.startTime} ~ ${s.endTime}</small></td>
                <td><span class="badge rounded-pill" style="background-color:${s.color}; width:20px;">&nbsp;</span></td>
                <td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="window.handleEditShift(${idx})"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-light border" onclick="window.handleDeleteShift(${idx})"><i class="fas fa-trash text-danger"></i></button></td>
            </tr>`).join('');
    }

    loadShiftToForm(index) {
        const s = this.currentShifts[index];
        document.getElementById('shift-index').value = index;
        document.getElementById('shift-code').value = s.code;
        document.getElementById('shift-name').value = s.name;
        document.getElementById('shift-color').value = s.color;
        const [sh, sm] = s.startTime.split(':'); const [eh, em] = s.endTime.split(':');
        document.getElementById('start-hour').value = sh; document.getElementById('start-min').value = sm;
        document.getElementById('end-hour').value = eh; document.getElementById('end-min').value = em;
        document.getElementById('form-title').textContent = '編輯班別';
        document.getElementById('btn-cancel').style.display = 'inline-block';
    }

    addOrUpdateShift() {
        const index = parseInt(document.getElementById('shift-index').value);
        const newShift = {
            code: document.getElementById('shift-code').value.toUpperCase(),
            name: document.getElementById('shift-name').value,
            color: document.getElementById('shift-color').value,
            startTime: `${document.getElementById('start-hour').value}:${document.getElementById('start-min').value}`,
            endTime: `${document.getElementById('end-hour').value}:${document.getElementById('end-min').value}`
        };
        if (index === -1) this.currentShifts.push(newShift); else this.currentShifts[index] = newShift;
        this.renderTable(); this.resetForm();
    }

    deleteShift(index) { if(confirm('確定刪除？')) { this.currentShifts.splice(index, 1); this.renderTable(); } }
    resetForm() { document.getElementById('shift-form').reset(); document.getElementById('shift-index').value = "-1"; document.getElementById('form-title').textContent = '新增班別'; document.getElementById('btn-cancel').style.display = 'none'; }
}
