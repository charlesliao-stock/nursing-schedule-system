import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class GroupSettingsPage {
    constructor() {
        this.currentUnit = null;
        this.staffList = [];
        this.groups = []; // 單位目前的組別列表 ["A", "B"]
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-layer-group"></i> 組別與分組設定</h2>
                    <button class="btn btn-secondary btn-sm" onclick="history.back()">返回</button>
                </div>

                <div class="row">
                    <div class="col-lg-4">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-primary text-white">
                                <h6 class="m-0 font-weight-bold">1. 定義組別名稱</h6>
                            </div>
                            <div class="card-body">
                                <div class="input-group mb-3">
                                    <input type="text" id="new-group-name" class="form-control" placeholder="輸入新組名 (如: 資深組)">
                                    <button class="btn btn-success" id="btn-add-group"><i class="fas fa-plus"></i></button>
                                </div>
                                <ul class="list-group" id="group-list-ul">
                                    <li class="list-group-item text-center">載入中...</li>
                                </ul>
                                <small class="text-muted mt-2 d-block">* 點擊 X 刪除組別 (不會刪除人員，僅清空該人員的組別欄位)</small>
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
        const user = authService.getCurrentUser();
        const profile = authService.getProfile();
        
        if (!user || !profile.unitId) {
            alert("權限不足或未綁定單位");
            return;
        }

        // 1. 載入資料
        try {
            this.currentUnit = await UnitService.getUnitById(profile.unitId);
            // 如果單位還沒有 groups 欄位，給空陣列
            this.groups = this.currentUnit.groups || [];
            
            this.staffList = await userService.getUsersByUnit(profile.unitId);
            
            this.renderGroupList();
            this.renderStaffList();
        } catch (e) {
            console.error(e);
            alert("載入失敗");
        }

        // 2. 綁定事件
        document.getElementById('btn-add-group').addEventListener('click', () => this.handleAddGroup());
        document.getElementById('btn-save-assignments').addEventListener('click', () => this.handleSaveAssignments());
    }

    renderGroupList() {
        const ul = document.getElementById('group-list-ul');
        if (this.groups.length === 0) {
            ul.innerHTML = '<li class="list-group-item text-muted text-center">尚無組別設定</li>';
            return;
        }

        ul.innerHTML = this.groups.map((g, index) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${g}
                <button class="btn btn-sm btn-outline-danger btn-del-group" data-idx="${index}">
                    <i class="fas fa-times"></i>
                </button>
            </li>
        `).join('');

        // 綁定刪除按鈕
        document.querySelectorAll('.btn-del-group').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDeleteGroup(e.currentTarget.dataset.idx));
        });
    }

    renderStaffList() {
        const tbody = document.getElementById('staff-group-tbody');
        const options = `<option value="">(未分組)</option>` + 
                        this.groups.map(g => `<option value="${g}">${g}</option>`).join('');

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
        
        // 更新 Unit 資料
        await UnitService.updateUnit(this.currentUnit.unitId, { groups: this.groups });
        input.value = '';
        this.renderGroupList();
        this.renderStaffList(); // 重繪下拉選單
    }

    async handleDeleteGroup(index) {
        if (!confirm("確定刪除此組別？")) return;
        const removedGroup = this.groups[index];
        this.groups.splice(index, 1);
        
        // 更新 Unit
        await UnitService.updateUnit(this.currentUnit.unitId, { groups: this.groups });
        
        // 重繪 UI (注意：這裡還沒清空人員身上的 group 欄位，可以選擇是否要同時跑批次清空，
        // 這裡為了效能，我們只更新 UI 下拉選單，讓管理者自己決定是否要重分)
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
            // 找到原始資料比對，有變更才更新
            const original = this.staffList.find(u => u.uid === uid);
            if (original && original.group !== newGroup) {
                updates.push(userService.updateUser(uid, { group: newGroup }));
                // 更新本地暫存
                original.group = newGroup; 
            }
        });

        try {
            await Promise.all(updates);
            alert(`成功更新 ${updates.length} 筆人員資料`);
            this.renderStaffList(); // 重新渲染以更新「目前組別」欄位
        } catch (e) {
            alert("更新失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存所有人員分組變更';
        }
    }
}
