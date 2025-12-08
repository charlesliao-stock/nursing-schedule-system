import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null;
        this.shifts = [];
        this.unitsList = [];
    }

    async render() {
        this.currentUser = authService.getProfile();
        const isAdmin = this.currentUser.role === 'system_admin';
        
        let headerControl = '';
        if (isAdmin) {
             headerControl = `
                <select id="admin-unit-select" class="form-select form-select-sm" style="width: auto;">
                    <option value="">載入中...</option>
                </select>
            `;
        } else {
             headerControl = `<span class="badge bg-info fs-6" id="unit-name-display">本單位</span>`;
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-clock"></i> 班別設定</h2>
                    <div class="d-flex align-items-center gap-2">
                        <label class="mb-0 fw-bold">設定單位：</label>
                        ${headerControl}
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex justify-content-between align-items-center">
                        <h6 class="m-0 font-weight-bold text-primary">班別列表</h6>
                        <button id="btn-add-shift" class="btn btn-sm btn-success"><i class="fas fa-plus"></i> 新增班別</button>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover" id="shift-table">
                                <thead class="table-light">
                                    <tr>
                                        <th>代碼</th>
                                        <th>名稱</th>
                                        <th>時間範圍</th>
                                        <th>顏色</th>
                                        <th>時數</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="shift-tbody">
                                    <tr><td colspan="6" class="text-center">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <button id="btn-save-shifts" class="btn btn-primary w-100 mt-3">儲存變更</button>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if (!this.currentUser) return;
        const isAdmin = this.currentUser.role === 'system_admin';

        // 1. 初始化單位選擇
        if (isAdmin) {
            this.unitsList = await UnitService.getAllUnits();
            const select = document.getElementById('admin-unit-select');
            select.innerHTML = this.unitsList.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            if (this.unitsList.length > 0) {
                this.targetUnitId = this.unitsList[0].unitId;
                select.value = this.targetUnitId;
            }

            select.addEventListener('change', (e) => {
                this.targetUnitId = e.target.value;
                this.loadShifts();
            });
        } else {
            this.targetUnitId = this.currentUser.unitId;
            const unit = await UnitService.getUnitById(this.targetUnitId);
            if(unit) document.getElementById('unit-name-display').textContent = unit.unitName;
        }

        // 2. 載入班別
        if (this.targetUnitId) await this.loadShifts();

        // 3. 綁定按鈕
        document.getElementById('btn-add-shift').addEventListener('click', () => this.addEmptyRow());
        document.getElementById('btn-save-shifts').addEventListener('click', () => this.saveShifts());
        
        // 刪除按鈕 (Event Delegation)
        document.getElementById('shift-tbody').addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-shift')) {
                e.target.closest('tr').remove();
            }
        });
    }

    async loadShifts() {
        const tbody = document.getElementById('shift-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">讀取中...</td></tr>';
        
        try {
            const unit = await UnitService.getUnitById(this.targetUnitId);
            this.shifts = unit.shifts || []; // 若無則為空
            this.renderTable();
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">讀取失敗: ${e.message}</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('shift-tbody');
        if (this.shifts.length === 0) {
            this.addEmptyRow(); // 預設給一列
            return;
        }

        tbody.innerHTML = this.shifts.map(s => `
            <tr class="shift-row">
                <td><input type="text" class="form-control form-control-sm shift-code" value="${s.code}" maxlength="3"></td>
                <td><input type="text" class="form-control form-control-sm shift-name" value="${s.name}"></td>
                <td>
                    <div class="input-group input-group-sm">
                        <input type="time" class="form-control shift-start" value="${s.startTime}">
                        <span class="input-group-text">-</span>
                        <input type="time" class="form-control shift-end" value="${s.endTime}">
                    </div>
                </td>
                <td><input type="color" class="form-control form-control-color shift-color" value="${s.color || '#ffffff'}"></td>
                <td><input type="number" class="form-control form-control-sm shift-hours" value="${s.hours || 8}"></td>
                <td><button class="btn btn-sm btn-outline-danger btn-delete-shift"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
    }

    addEmptyRow() {
        const tbody = document.getElementById('shift-tbody');
        // 清除 "無資料" 提示
        if(tbody.querySelector('td[colspan]')) tbody.innerHTML = '';

        const tr = document.createElement('tr');
        tr.className = 'shift-row';
        tr.innerHTML = `
            <td><input type="text" class="form-control form-control-sm shift-code" placeholder="代碼"></td>
            <td><input type="text" class="form-control form-control-sm shift-name" placeholder="名稱"></td>
            <td>
                <div class="input-group input-group-sm">
                    <input type="time" class="form-control shift-start" value="08:00">
                    <span class="input-group-text">-</span>
                    <input type="time" class="form-control shift-end" value="16:00">
                </div>
            </td>
            <td><input type="color" class="form-control form-control-color shift-color" value="#36b9cc"></td>
            <td><input type="number" class="form-control form-control-sm shift-hours" value="8"></td>
            <td><button class="btn btn-sm btn-outline-danger btn-delete-shift"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    }

    async saveShifts() {
        if(!this.targetUnitId) return alert('未選擇單位');

        const rows = document.querySelectorAll('.shift-row');
        const newShifts = [];

        rows.forEach(row => {
            const code = row.querySelector('.shift-code').value.trim();
            if(code) {
                newShifts.push({
                    code: code,
                    name: row.querySelector('.shift-name').value.trim(),
                    startTime: row.querySelector('.shift-start').value,
                    endTime: row.querySelector('.shift-end').value,
                    color: row.querySelector('.shift-color').value,
                    hours: parseFloat(row.querySelector('.shift-hours').value) || 0
                });
            }
        });

        try {
            await UnitService.updateUnit(this.targetUnitId, { shifts: newShifts });
            alert('✅ 班別設定已更新');
        } catch (e) {
            alert('儲存失敗: ' + e.message);
        }
    }
}
