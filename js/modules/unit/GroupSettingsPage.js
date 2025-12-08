import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class GroupSettingsPage {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null;
        this.availableUnits = [];
        this.groups = [];
        this.staffList = [];
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-layer-group"></i> 組別與分組設定</h2>
                    
                    <div class="d-flex align-items-center bg-white p-2 rounded shadow-sm border">
                        <label class="mb-0 fw-bold me-2 text-primary">設定單位：</label>
                        <select id="group-unit-select" class="form-select form-select-sm fw-bold" style="min-width: 200px;">
                            <option value="">載入中...</option>
                        </select>
                    </div>
                </div>

                <div id="group-content" class="row" style="display:none;">
                    <div class="col-lg-4">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-primary text-white">
                                <h6 class="m-0 font-weight-bold">1. 定義組別名稱</h6>
                            </div>
                            <div class="card-body">
                                <div class="input-group mb-3">
                                    <input type="text" id="new-group-name" class="form-control" placeholder="新組名 (如: A組)">
                                    <button class="btn btn-success" id="btn-add-group"><i class="fas fa-plus"></i></button>
                                </div>
                                <ul class="list-group" id="group-list-ul"></ul>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-8">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-success text-white d-flex justify-content-between align-items-center">
                                <h6 class="m-0 font-weight-bold">2. 人員分組分配</h6>
                                <button id="btn-save-assignments" class="btn btn-sm btn-light text-success fw-bold">
                                    <i class="fas fa-save"></i> 儲存變更
                                </button>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
                                    <table class="table table-hover align-middle mb-0">
                                        <thead class="table-light sticky-top">
                                            <tr><th>姓名</th><th>職級</th><th>目前組別</th><th>分配新組別</th></tr>
                                        </thead>
                                        <tbody id="staff-group-tbody"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="no-permission-alert" class="alert alert-warning text-center" style="display:none;">無權限或未指派單位</div>
            </div>
        `;
    }

    async afterRender() {
        this.currentUser = authService.getProfile();
        if (!this.currentUser) return;

        const unitSelect = document.getElementById('group-unit-select');
        
        // 1. 取得該使用者可操作的單位列表
        await this.fetchAvailableUnits();

        if (this.availableUnits.length === 0) {
            unitSelect.innerHTML = `<option value="">無可用單位</option>`;
            unitSelect.disabled = true;
            document.getElementById('no-permission-alert').style.display = 'block';
            return;
        }

        // 2. 填充選單
        unitSelect.innerHTML = this.availableUnits.map(u => 
            `<option value="${u.unitId}">${u.unitName}</option>`
        ).join('');

        // 3. 綁定切換
        unitSelect.addEventListener('change', (e) => {
            this.targetUnitId = e.target.value;
            this.loadData();
        });

        // 4. 預設選取
        this.targetUnitId = this.availableUnits[0].unitId;
        unitSelect.value = this.targetUnitId;
        document.getElementById('group-content').style.display = 'flex';
        await this.loadData();

        // 5. 綁定按鈕
        document.getElementById('btn-add-group').addEventListener('click', () => this.handleAddGroup());
        document.getElementById('btn-save-assignments').addEventListener('click', () => this.handleSaveAssignments());
        document.getElementById('group-list-ul').addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-del-group');
            if(btn) this.handleDeleteGroup(btn.dataset.idx);
        });
    }

    async fetchAvailableUnits() {
        const { role, uid, originalRole, unitId } = this.currentUser;
        // 系統管理員 (含模擬狀態) -> 看全部
        const isRealAdmin = role === 'system_admin' || originalRole === 'system_admin';

        try {
            if (isRealAdmin) {
                this.availableUnits = await UnitService.getAllUnits();
            } else if (role === 'unit_manager') {
                // 單位管理者 -> 看自己管理的單位
                this.availableUnits = await UnitService.getUnitsByManager(uid);
                // Fallback: 如果資料庫沒設定 managers，但 user.unitId 有值，至少顯示該單位
                if (this.availableUnits.length === 0 && unitId) {
                    const u = await UnitService.getUnitById(unitId);
                    if(u) this.availableUnits = [u];
                }
            } else {
                // 其他人 -> 鎖定所屬單位
                if(unitId) {
                    const u = await UnitService.getUnitById(unitId);
                    if(u) this.availableUnits = [u];
                }
            }
        } catch (e) {
            console.error(e);
            this.availableUnits = [];
        }
    }

    async loadData() {
        if(!this.targetUnitId) return;
        document.getElementById('staff-group-tbody').innerHTML = '<tr><td colspan="4" class="text-center p-3">載入中...</td></tr>';

        try {
            const [unit, staff] = await Promise.all([
                UnitService.getUnitById(this.targetUnitId),
                userService.getUsersByUnit(this.targetUnitId)
            ]);
            this.groups = unit.groups || [];
            this.staffList = staff;
            this.renderGroupList();
            this.renderStaffList();
        } catch (e) { console.error(e); alert("載入失敗"); }
    }

    renderGroupList() {
        const ul = document.getElementById('group-list-ul');
        if (this.groups.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-center text-muted">尚無組別</li>';
            return;
        }
        ul.innerHTML = this.groups.map((g, idx) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${g} <button class="btn btn-sm btn-outline-danger btn-del-group rounded-circle" data-idx="${idx}"><i class="fas fa-times"></i></button>
            </li>`).join('');
    }

    renderStaffList() {
        const tbody = document.getElementById('staff-group-tbody');
        if(this.staffList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-3">無人員資料</td></tr>';
            return;
        }
        const opts = `<option value="">(未分組)</option>` + this.groups.map(g => `<option value="${g}">${g}</option>`).join('');
        
        tbody.innerHTML = this.staffList.map(u => `
            <tr>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank||'N0'}</span></td>
                <td><span class="badge bg-info text-dark">${u.group||'-'}</span></td>
                <td><select class="form-select form-select-sm group-select" data-uid="${u.uid}">${opts.replace(`value="${u.group}"`, `value="${u.group}" selected`)}</select></td>
            </tr>`).join('');
    }

    async handleAddGroup() {
        const name = document.getElementById('new-group-name').value.trim();
        if(!name || this.groups.includes(name)) return;
        this.groups.push(name);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        document.getElementById('new-group-name').value = '';
        this.renderGroupList();
        this.renderStaffList();
    }

    async handleDeleteGroup(idx) {
        if(!confirm('確定刪除？')) return;
        this.groups.splice(idx, 1);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        this.renderGroupList();
        this.renderStaffList();
    }

    async handleSaveAssignments() {
        const btn = document.getElementById('btn-save-assignments');
        btn.disabled = true;
        const selects = document.querySelectorAll('.group-select');
        const updates = [];
        
        selects.forEach(sel => {
            const uid = sel.dataset.uid;
            const newGroup = sel.value;
            const original = this.staffList.find(u => u.uid === uid);
            if(original.group !== newGroup) {
                updates.push(userService.updateUser(uid, { group: newGroup }));
                original.group = newGroup;
            }
        });

        await Promise.all(updates);
        alert(`已更新 ${updates.length} 筆`);
        this.renderStaffList();
        btn.disabled = false;
    }
}
