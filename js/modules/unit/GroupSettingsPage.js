import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class GroupSettingsPage {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null;
        this.currentUnit = null;
        this.staffList = [];
        this.groups = [];
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
             headerControl = `<span class="badge bg-warning text-dark fs-6" id="unit-name-display">本單位</span>`;
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-layer-group"></i> 組別與分組設定</h2>
                    <div class="d-flex align-items-center gap-2">
                        <label class="mb-0 fw-bold">設定單位：</label>
                        ${headerControl}
                    </div>
                </div>

                <div class="row">
                    <div class="col-lg-4">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-primary text-white">
                                <h6 class="m-0 font-weight-bold">1. 定義組別名稱</h6>
                            </div>
                            <div class="card-body">
                                <div class="input-group mb-3">
                                    <input type="text" id="new-group-name" class="form-control" placeholder="輸入新組名 (如: A組)">
                                    <button class="btn btn-success" id="btn-add-group"><i class="fas fa-plus"></i></button>
                                </div>
                                <ul class="list-group" id="group-list-ul">
                                    <li class="list-group-item text-center">載入中...</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-8">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-success text-white">
                                <h6 class="m-0 font-weight-bold">2. 人員分組分配</h6>
                            </div>
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover align-middle">
                                        <thead class="table-light">
                                            <tr>
                                                <th>姓名</th>
                                                <th>職級</th>
                                                <th>目前組別</th>
                                                <th>分配新組別</th>
                                            </tr>
                                        </thead>
                                        <tbody id="staff-group-tbody">
                                            <tr><td colspan="4" class="text-center">載入中...</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <button id="btn-save-assignments" class="btn btn-primary w-100 mt-3 shadow">
                                    <i class="fas fa-save"></i> 儲存所有人員分組變更
                                </button>
                            </div>
                        </div>
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
                this.loadData();
            });
        } else {
            this.targetUnitId = this.currentUser.unitId;
            const unit = await UnitService.getUnitById(this.targetUnitId);
            if(unit) document.getElementById('unit-name-display').textContent = unit.unitName;
        }

        // 2. 載入資料
        if (this.targetUnitId) await this.loadData();

        // 3. 綁定事件
        document.getElementById('btn-add-group').addEventListener('click', () => this.handleAddGroup());
        document.getElementById('btn-save-assignments').addEventListener('click', () => this.handleSaveAssignments());
        
        // 綁定刪除組別 (Delegation)
        document.getElementById('group-list-ul').addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-del-group');
            if(btn) this.handleDeleteGroup(btn.dataset.idx);
        });
    }

    async loadData() {
        if(!this.targetUnitId) return;

        try {
            this.currentUnit = await UnitService.getUnitById(this.targetUnitId);
            this.groups = this.currentUnit.groups || [];
            
            this.staffList = await userService.getUsersByUnit(this.targetUnitId);
            
            this.renderGroupList();
            this.renderStaffList();
        } catch (e) {
            console.error(e);
            alert("載入失敗");
        }
    }

    renderGroupList() {
        const ul = document.getElementById('group-list-ul');
        if (this.groups.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-muted text-center">尚無組別</li>';
            return;
        }
        ul.innerHTML = this.groups.map((g, index) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${g}
                <button class="btn btn-sm btn-outline-danger btn-del-group" data-idx="${index}"><i class="fas fa-times"></i></button>
            </li>
        `).join('');
    }

    renderStaffList() {
        const tbody = document.getElementById('staff-group-tbody');
        const options = `<option value="">(未分組)</option>` + this.groups.map(g => `<option value="${g}">${g}</option>`).join('');

        tbody.innerHTML = this.staffList.map(u => `
            <tr>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                <td><span class="badge bg-info text-dark">${u.group || '-'}</span></td>
                <td>
                    <select class="form-select form-select-sm group-select" data-uid="${u.uid}">
                        ${options.replace(`value="${u.group}"`, `value="${u.group}" selected`)}
                    </select>
                </td>
            </tr>
        `).join('');
    }

    async handleAddGroup() {
        const input = document.getElementById('new-group-name');
        const name = input.value.trim();
        if (!name) return;
        if (this.groups.includes(name)) { alert("組名重複"); return; }

        this.groups.push(name);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        input.value = '';
        this.renderGroupList();
        this.renderStaffList();
    }

    async handleDeleteGroup(index) {
        if (!confirm("確定刪除此組別？")) return;
        this.groups.splice(index, 1);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        this.renderGroupList();
        this.renderStaffList();
    }

    async handleSaveAssignments() {
        const selects = document.querySelectorAll('.group-select');
        const updates = [];
        const btn = document.getElementById('btn-save-assignments');
        btn.disabled = true;
        btn.innerHTML = '儲存中...';

        selects.forEach(sel => {
            const uid = sel.dataset.uid;
            const newGroup = sel.value;
            const original = this.staffList.find(u => u.uid === uid);
            if (original && original.group !== newGroup) {
                updates.push(userService.updateUser(uid, { group: newGroup }));
                original.group = newGroup; 
            }
        });

        try {
            await Promise.all(updates);
            alert(`✅ 成功更新 ${updates.length} 筆人員資料`);
            this.renderStaffList();
        } catch (e) {
            alert("更新失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存所有人員分組變更';
        }
    }
}
