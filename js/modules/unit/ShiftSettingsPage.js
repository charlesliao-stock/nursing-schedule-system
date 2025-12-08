import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() { 
        this.shifts = []; 
        this.targetUnitId = null; 
        this.modal = null; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-clock"></i> 班別設定</h3>
                    <p class="text-muted small mb-0">設定單位的班別代號、時間起訖與顏色標記。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <div class="vr mx-2"></div>
                        <button id="btn-add" class="btn btn-primary text-nowrap">
                            <i class="fas fa-plus"></i> 新增班別
                        </button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>代號</th>
                                        <th>名稱</th>
                                        <th>時間</th>
                                        <th>顏色</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="table-body">
                                    <tr><td colspan="5" class="text-center py-5 text-muted">請先選擇單位</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="shift-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title fw-bold" id="modal-title">新增班別</h5>
                                <button class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="shift-form">
                                    <input type="hidden" id="edit-idx">
                                    <div class="row g-3 mb-3">
                                        <div class="col-4">
                                            <label class="form-label fw-bold">代號</label>
                                            <input type="text" id="shift-code" class="form-control" placeholder="D" required>
                                        </div>
                                        <div class="col-8">
                                            <label class="form-label fw-bold">名稱</label>
                                            <input type="text" id="shift-name" class="form-control" placeholder="白班" required>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">時間</label>
                                        <div class="input-group">
                                            <input type="time" id="start-time" class="form-control" value="08:00">
                                            <span class="input-group-text">~</span>
                                            <input type="time" id="end-time" class="form-control" value="16:00">
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">顏色</label>
                                        <input type="color" id="shift-color" class="form-control w-100" value="#3b82f6">
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('shift-modal'));
        const unitSelect = document.getElementById('unit-select');
        
        // 載入單位邏輯
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let availableUnits = [];
        if(isAdmin) {
            availableUnits = await UnitService.getAllUnits();
        } else {
            availableUnits = await UnitService.getUnitsByManager(user.uid);
            // Fallback
            if(availableUnits.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) availableUnits.push(u);
            }
        }

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = '<option value="">無可用單位</option>';
            unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            // 綁定事件
            unitSelect.addEventListener('change', () => this.loadData(unitSelect.value));
            document.getElementById('btn-add').addEventListener('click', () => this.openModal());
            document.getElementById('btn-save').addEventListener('click', () => this.saveShift());

            // 預設載入第一筆
            this.loadData(availableUnits[0].unitId);
        }
    }

    async loadData(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        const tbody = document.getElementById('table-body');
        
        try {
            const unit = await UnitService.getUnitById(uid);
            
            // ✅ Crash Fix: 檢查 unit 是否存在
            if (!unit) {
                this.shifts = [];
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-danger">無法讀取單位資料</td></tr>';
                return;
            }

            // 安全讀取 settings
            this.shifts = unit.settings?.shifts || [];
            this.renderTable();
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-danger">載入失敗</td></tr>';
        }
    }

    renderTable() {
        const tbody = document.getElementById('table-body');
        if(this.shifts.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">此單位尚無班別設定</td></tr>'; 
            return; 
        }
        
        tbody.innerHTML = this.shifts.map((s, i) => `
            <tr>
                <td class="fw-bold" style="color:${s.color}">${s.code}</td>
                <td>${s.name}</td>
                <td>${s.startTime} ~ ${s.endTime}</td>
                <td><span class="badge rounded-pill border" style="background:${s.color}; width:24px; height:24px;">&nbsp;</span></td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${i})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteShift(${i})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        
        window.routerPage = this;
    }

    openModal(idx = null) {
        const title = document.getElementById('modal-title');
        document.getElementById('shift-form').reset();
        document.getElementById('edit-idx').value = idx !== null ? idx : -1;
        
        if(idx !== null) {
            title.textContent = "編輯班別";
            const s = this.shifts[idx];
            document.getElementById('shift-code').value = s.code;
            document.getElementById('shift-name').value = s.name;
            document.getElementById('shift-color').value = s.color;
            document.getElementById('start-time').value = s.startTime;
            document.getElementById('end-time').value = s.endTime;
        } else {
            title.textContent = "新增班別";
        }
        this.modal.show();
    }

    async saveShift() {
        const idx = parseInt(document.getElementById('edit-idx').value);
        const data = {
            code: document.getElementById('shift-code').value,
            name: document.getElementById('shift-name').value,
            color: document.getElementById('shift-color').value,
            startTime: document.getElementById('start-time').value,
            endTime: document.getElementById('end-time').value
        };

        if(idx === -1) this.shifts.push(data);
        else this.shifts[idx] = data;

        await UnitService.updateUnit(this.targetUnitId, { "settings.shifts": this.shifts });
        this.modal.hide();
        this.renderTable();
    }
    
    async deleteShift(idx) {
        if(!confirm('確定刪除？')) return;
        this.shifts.splice(idx, 1);
        await UnitService.updateUnit(this.targetUnitId, { "settings.shifts": this.shifts });
        this.renderTable();
    }
}
