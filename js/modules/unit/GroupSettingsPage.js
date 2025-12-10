import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class GroupSettingsPage {
    constructor() { 
        this.groups = []; 
        this.staffList = []; 
        this.targetUnitId = null; 
        this.modal = null; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-layer-group"></i> 組別設定</h3>
                    <p class="text-muted small mb-0">定義單位內的分組並進行人員分配。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-select" class="form-select w-auto"><option value="">載入中...</option></select>
                        </div>
                </div>

                <div class="row">
                    <div class="col-md-4">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                <h6 class="m-0 fw-bold text-primary">已定義組別</h6>
                                <button id="btn-add" class="btn btn-sm btn-outline-primary"><i class="fas fa-plus"></i> 新增</button>
                            </div>
                            <ul class="list-group list-group-flush" id="group-list">
                                <li class="list-group-item text-center text-muted py-4">載入中...</li>
                            </ul>
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="card shadow">
                            <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                <h6 class="m-0 fw-bold text-success">人員分配預覽</h6>
                                <button id="btn-save-assign" class="btn btn-sm btn-primary w-auto">儲存分配變更</button>
                            </div>
                            <div class="card-body p-0 table-responsive" style="max-height: 600px;">
                                <table class="table table-hover mb-0 align-middle text-center">
                                    <thead class="table-light sticky-top">
                                        <tr>
                                            <th>職編</th> <th>姓名</th>
                                            <th>職級</th>
                                            <th>組別</th>
                                        </tr>
                                    </thead>
                                    <tbody id="staff-tbody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="group-modal" tabindex="-1">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header"><h5 class="modal-title fw-bold">新增組別</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body"><label class="form-label fw-bold">組別名稱</label><input type="text" id="new-group-name" class="form-control" placeholder="例如: A組"></div>
                            <div class="modal-footer"><button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save-group" class="btn btn-primary w-auto">新增</button></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('group-modal'));
        const unitSelect = document.getElementById('unit-select');
        window.routerPage = this; // 供 onclick 呼叫
        
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        let availableUnits = isAdmin ? await UnitService.getAllUnits() : await UnitService.getUnitsByManager(user.uid);
        if(availableUnits.length === 0 && user.unitId) {
            const u = await UnitService.getUnitById(user.unitId);
            if(u) availableUnits.push(u);
        }

        if (availableUnits.length === 0) { unitSelect.innerHTML = '<option value="">無權限</option>'; unitSelect.disabled = true; }
        else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.addEventListener('change', () => this.loadData(unitSelect.value));
            document.getElementById('btn-add').addEventListener('click', () => { document.getElementById('new-group-name').value = ''; this.modal.show(); });
            document.getElementById('btn-save-group').addEventListener('click', () => this.addGroup());
            document.getElementById('btn-save-assign').addEventListener('click', () => this.saveAssignments());
            this.loadData(availableUnits[0].unitId);
        }
    }

    async loadData(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        try {
            const [unit, staff] = await Promise.all([UnitService.getUnitById(uid), userService.getUsersByUnit(uid)]);
            if (!unit) { alert("無法讀取"); return; }
            this.groups = unit.groups || [];
            
            // ✅ 排序：依職編 (StaffId) 排序
            this.staffList = staff.sort((a, b) => (a.staffId || '').localeCompare(b.staffId || ''));
            
            this.renderGroups(); 
            this.renderStaff();
        } catch (e) { console.error(e); }
    }

    renderGroups() {
        const ul = document.getElementById('group-list');
        if(this.groups.length === 0) { ul.innerHTML = '<li class="list-group-item text-center text-muted py-3">無組別</li>'; return; }
        ul.innerHTML = this.groups.map((g, i) => `<li class="list-group-item d-flex justify-content-between align-items-center">${g} <button class="btn btn-sm text-danger" onclick="window.routerPage.deleteGroup(${i})"><i class="fas fa-times"></i></button></li>`).join('');
    }

    renderStaff() {
        const tbody = document.getElementById('staff-tbody');
        const opts = `<option value="">(未分組)</option>` + this.groups.map(g => `<option value="${g}">${g}</option>`).join('');
        
        tbody.innerHTML = this.staffList.map(u => `
            <tr>
                <td class="text-muted small">${u.staffId || '-'}</td>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank}</span></td>
                <td>
                    <select class="form-select form-select-sm group-select" data-uid="${u.uid}" style="width:120px; margin:0 auto;">
                        ${opts.replace(`value="${u.group}"`, `value="${u.group}" selected`)}
                    </select>
                </td>
            </tr>`).join('');
    }

    async addGroup() {
        const name = document.getElementById('new-group-name').value.trim();
        if(!name) return;
        this.groups.push(name);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        this.modal.hide(); this.renderGroups(); this.renderStaff();
    }

    async deleteGroup(idx) { 
        if(confirm('刪除組別？(該組別的人員將變為未分組)')) { 
            this.groups.splice(idx, 1); 
            await UnitService.updateUnit(this.targetUnitId, { groups: this.groups }); 
            this.renderGroups(); this.renderStaff(); 
        } 
    }
    
    async saveAssignments() {
        const updates = [];
        document.querySelectorAll('.group-select').forEach(sel => {
            const uid = sel.dataset.uid;
            const val = sel.value;
            const original = this.staffList.find(x => x.uid === uid);
            if((original.group || '') !== val) { 
                updates.push(userService.updateUser(uid, { group: val })); 
                original.group = val; 
            }
        });
        await Promise.all(updates);
        alert('✅ 儲存成功');
    }
}
