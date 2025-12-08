import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() { this.currentUnitId = ''; this.currentShifts = []; this.availableUnits = []; }

    async render() {
        const hourOptions = Array.from({length: 24}, (_, i) => `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-clock"></i> 班別設定</h2>
                    <div class="d-flex align-items-center bg-white p-2 rounded shadow-sm border">
                        <label class="mb-0 fw-bold me-2 text-primary">設定單位：</label>
                        <select id="shift-unit-select" class="form-select form-select-sm fw-bold" style="min-width: 200px;">
                            <option value="">載入中...</option>
                        </select>
                    </div>
                </div>

                <div id="shifts-container" style="display:none;">
                    <div class="row">
                        <div class="col-lg-7">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-primary">班別列表</h6></div>
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
                                <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-success" id="form-title">新增班別</h6></div>
                                <div class="card-body">
                                    <form id="shift-form">
                                        <input type="hidden" id="shift-index" value="-1">
                                        <div class="row g-2 mb-3">
                                            <div class="col-4"><label class="small fw-bold">代號</label><input type="text" id="shift-code" class="form-control" placeholder="D" required></div>
                                            <div class="col-8"><label class="small fw-bold">名稱</label><input type="text" id="shift-name" class="form-control" placeholder="白班" required></div>
                                        </div>
                                        <div class="mb-3">
                                            <label class="small fw-bold">時間</label>
                                            <div class="input-group">
                                                <select id="start-hour" class="form-select">${hourOptions}</select><span class="input-group-text">:</span><select id="start-min" class="form-select">${minOptions}</select>
                                                <span class="input-group-text">~</span>
                                                <select id="end-hour" class="form-select">${hourOptions}</select><span class="input-group-text">:</span><select id="end-min" class="form-select">${minOptions}</select>
                                            </div>
                                        </div>
                                        <div class="mb-3"><label class="small fw-bold">顏色</label><input type="color" id="shift-color" class="form-control w-100" value="#3b82f6"></div>
                                        <button type="submit" class="btn btn-success w-100"><i class="fas fa-plus-circle"></i> 加入/更新列表</button>
                                        <button type="button" id="btn-cancel" class="btn btn-secondary w-100 mt-2" style="display:none;">取消</button>
                                    </form>
                                </div>
                            </div>
                            <button id="btn-save-all" class="btn btn-primary w-100 shadow py-2 mt-3"><i class="fas fa-save"></i> 儲存變更</button>
                        </div>
                    </div>
                </div>
                <div id="no-permission-alert" class="alert alert-warning text-center" style="display:none;">無權限</div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('shift-unit-select');

        // Fetch Logic
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
        unitSelect.addEventListener('change', (e) => this.loadShifts(e.target.value));
        
        this.loadShifts(this.availableUnits[0].unitId);

        document.getElementById('shift-form').addEventListener('submit', (e) => { e.preventDefault(); this.addOrUpdateShift(); });
        document.getElementById('btn-cancel').addEventListener('click', () => this.resetForm());
        document.getElementById('btn-save-all').addEventListener('click', async () => {
            const res = await UnitService.updateUnit(this.currentUnitId, { "settings.shifts": this.currentShifts });
            alert(res.success ? '✅ 已儲存' : '失敗');
        });
        
        window.handleEditShift = (index) => this.loadShiftToForm(index);
        window.handleDeleteShift = (index) => { if(confirm('刪除?')) { this.currentShifts.splice(index, 1); this.renderTable(); }};
    }

    async loadShifts(uid) {
        this.currentUnitId = uid;
        const unit = await UnitService.getUnitById(uid);
        this.currentShifts = unit.settings?.shifts || [];
        this.renderTable();
        document.getElementById('shifts-container').style.display = 'block';
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        tbody.innerHTML = this.currentShifts.map((s, i) => `<tr><td class="fw-bold" style="color:${s.color}">${s.code}</td><td>${s.name}</td><td>${s.startTime}~${s.endTime}</td><td><span class="badge" style="background:${s.color}">&nbsp;</span></td><td class="text-end"><button class="btn btn-sm btn-light" onclick="handleEditShift(${i})"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-light" onclick="handleDeleteShift(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    }

    // ... (loadShiftToForm, addOrUpdateShift, resetForm 與之前相同邏輯，為了節省長度略過，請保留原有的實作)
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
        const idx = parseInt(document.getElementById('shift-index').value);
        const shift = {
            code: document.getElementById('shift-code').value,
            name: document.getElementById('shift-name').value,
            color: document.getElementById('shift-color').value,
            startTime: `${document.getElementById('start-hour').value}:${document.getElementById('start-min').value}`,
            endTime: `${document.getElementById('end-hour').value}:${document.getElementById('end-min').value}`
        };
        if(idx === -1) this.currentShifts.push(shift); else this.currentShifts[idx] = shift;
        this.renderTable(); this.resetForm();
    }

    resetForm() { document.getElementById('shift-form').reset(); document.getElementById('shift-index').value = "-1"; document.getElementById('form-title').textContent = '新增班別'; document.getElementById('btn-cancel').style.display = 'none'; }
}
