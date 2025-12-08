import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
        this.currentShifts = [];
        this.currentUser = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        const isSystemAdmin = this.currentUser.role === 'system_admin';
        
        let headerControl = '';
        if (isSystemAdmin) {
            headerControl = `
                <div class="mb-4 d-flex align-items-center bg-light p-2 rounded">
                    <label class="fw-bold me-2 text-danger"><i class="fas fa-user-shield"></i> 管理員模式 - 選擇單位：</label>
                    <select id="shift-settings-unit" class="form-select form-select-sm w-auto">
                        <option value="">載入中...</option>
                    </select>
                </div>`;
        } else {
            this.currentUnitId = this.currentUser.unitId;
            headerControl = `
                <div class="mb-4">
                    <span class="badge bg-info text-dark fs-6"><i class="fas fa-hospital"></i> 本單位：<span id="unit-name-display">載入中...</span></span>
                </div>`;
        }

        const hourOptions = Array.from({length: 24}, (_, i) => `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container-fluid mt-4">
                <h2 class="h3 mb-4 text-gray-800"><i class="fas fa-clock"></i> 班別設定</h2>
                ${headerControl}

                <div id="shifts-container" style="display:none;">
                    <div class="row">
                        <div class="col-lg-7">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 bg-white border-bottom-primary d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 font-weight-bold text-primary">班別列表</h6>
                                    <small class="text-muted">拖曳可排序(待實作)</small>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle mb-0">
                                            <thead class="table-light">
                                                <tr>
                                                    <th>代號</th><th>名稱</th><th>時間 (起-迄)</th><th>顏色</th><th class="text-end">操作</th>
                                                </tr>
                                            </thead>
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
                                            <div class="col-4">
                                                <label class="form-label small fw-bold">代號</label>
                                                <input type="text" id="shift-code" class="form-control" placeholder="D" required maxlength="5">
                                            </div>
                                            <div class="col-8">
                                                <label class="form-label small fw-bold">名稱</label>
                                                <input type="text" id="shift-name" class="form-control" placeholder="白班" required>
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">時間範圍</label>
                                            <div class="input-group">
                                                <select id="start-hour" class="form-select">${hourOptions}</select>
                                                <span class="input-group-text">:</span>
                                                <select id="start-min" class="form-select">${minOptions}</select>
                                                <span class="input-group-text mx-1">至</span>
                                                <select id="end-hour" class="form-select">${hourOptions}</select>
                                                <span class="input-group-text">:</span>
                                                <select id="end-min" class="form-select">${minOptions}</select>
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">代表顏色</label>
                                            <input type="color" id="shift-color" class="form-control form-control-color w-100" value="#3b82f6">
                                        </div>

                                        <div class="d-grid gap-2">
                                            <button type="submit" class="btn btn-success"><i class="fas fa-plus-circle"></i> 加入/更新列表</button>
                                            <button type="button" id="btn-cancel" class="btn btn-secondary btn-sm" style="display:none;">取消編輯</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                            
                            <div class="mt-3">
                                <button id="btn-save-all" class="btn btn-primary w-100 shadow-lg py-3">
                                    <i class="fas fa-save fa-lg"></i> 儲存所有班別變更
                                </button>
                                <small class="text-muted d-block text-center mt-2">* 記得按此按鈕寫入資料庫</small>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="no-unit-alert" class="alert alert-warning text-center" style="display:none;">
                    請先選擇單位
                </div>
            </div>
        `;
    }

    async afterRender() {
        const isAdmin = this.currentUser.role === 'system_admin';
        const unitSelect = document.getElementById('shift-settings-unit');
        
        // 載入邏輯
        const loadShifts = async () => {
            if(!this.currentUnitId) {
                document.getElementById('shifts-container').style.display = 'none';
                document.getElementById('no-unit-alert').style.display = 'block';
                return;
            }
            try {
                const unit = await UnitService.getUnitById(this.currentUnitId);
                this.currentShifts = unit?.settings?.shifts || [];
                this.renderTable();
                document.getElementById('shifts-container').style.display = 'block';
                document.getElementById('no-unit-alert').style.display = 'none';
            } catch(e) { console.error(e); }
        };

        // 初始化
        if (isAdmin) {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">請選擇...</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', (e) => {
                this.currentUnitId = e.target.value;
                loadShifts();
            });
            if(units.length > 0) {
                unitSelect.value = units[0].unitId;
                this.currentUnitId = units[0].unitId;
                loadShifts();
            }
        } else {
            const unit = await UnitService.getUnitById(this.currentUnitId);
            if(unit) document.getElementById('unit-name-display').textContent = unit.unitName;
            loadShifts();
        }

        // Form events
        document.getElementById('shift-form').addEventListener('submit', (e) => { e.preventDefault(); this.addOrUpdateShift(); });
        document.getElementById('btn-cancel').addEventListener('click', () => this.resetForm());
        
        // 全域儲存
        document.getElementById('btn-save-all').addEventListener('click', async () => {
            if(!this.currentUnitId) return;
            try {
                // 注意：這裡是更新 settings.shifts
                // 需要確認 UnitService 是否有 updateUnitShifts，若無則用 updateUnit
                await UnitService.updateUnit(this.currentUnitId, { "settings.shifts": this.currentShifts });
                alert('✅ 班別設定已儲存');
            } catch(e) {
                alert('儲存失敗: ' + e.message);
            }
        });
        
        // Global handlers
        window.handleEditShift = (index) => this.loadShiftToForm(index);
        window.handleDeleteShift = (index) => this.deleteShift(index);
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        if (this.currentShifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-muted">尚無班別設定</td></tr>';
            return;
        }
        tbody.innerHTML = this.currentShifts.map((s, idx) => `
            <tr>
                <td class="fw-bold text-primary">${s.code}</td>
                <td>${s.name}</td>
                <td><small>${s.startTime} ~ ${s.endTime}</small></td>
                <td><span class="badge rounded-pill shadow-sm" style="background-color:${s.color}; width:24px; height:24px; border:1px solid #ddd;">&nbsp;</span></td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-light border me-1" onclick="window.handleEditShift(${idx})"><i class="fas fa-edit text-primary"></i></button>
                    <button class="btn btn-sm btn-light border" onclick="window.handleDeleteShift(${idx})"><i class="fas fa-trash text-danger"></i></button>
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
        document.getElementById('btn-cancel').style.display = 'inline-block';
        
        // 變更按鈕樣式
        const submitBtn = document.querySelector('#shift-form button[type="submit"]');
        submitBtn.className = 'btn btn-warning text-dark';
        submitBtn.innerHTML = '<i class="fas fa-check"></i> 更新暫存';
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

        if (index === -1) this.currentShifts.push(newShift);
        else this.currentShifts[index] = newShift;

        this.renderTable();
        this.resetForm();
    }

    deleteShift(index) {
        if(!confirm('確定刪除此班別？(記得最後按儲存)')) return;
        this.currentShifts.splice(index, 1);
        this.renderTable();
    }

    resetForm() {
        document.getElementById('shift-form').reset();
        document.getElementById('shift-index').value = "-1";
        document.getElementById('form-title').textContent = '新增班別';
        document.getElementById('btn-cancel').style.display = 'none';
        
        const submitBtn = document.querySelector('#shift-form button[type="submit"]');
        submitBtn.className = 'btn btn-success';
        submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> 加入/更新列表';
    }
}
