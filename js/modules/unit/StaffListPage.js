import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.displayList = [];
        this.unitMap = {};
        this.currentUser = null;
        this.editModal = null;
        this.sortConfig = { key: 'staffId', direction: 'asc' };
        this.currentUnitGroups = []; // 暫存組別清單
    }

    async render() {
        // ... (省略與之前相同的 render 開頭部分) ...
        // 為節省篇幅，這部分與上一版相同，重點在 Modal 結構與 openModal
        
        this.currentUser = authService.getProfile();
        const isAdmin = this.currentUser.role === 'system_admin' || this.currentUser.originalRole === 'system_admin';
        
        let unitOptionsHtml = '<option value="">載入中...</option>';
        if (isAdmin) {
            const units = await UnitService.getAllUnits();
            units.forEach(u => this.unitMap[u.unitId] = u.unitName);
            unitOptionsHtml = `<option value="">全部單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            const units = await UnitService.getUnitsByManager(this.currentUser.uid);
            if(units.length === 0 && this.currentUser.unitId) {
                const u = await UnitService.getUnitById(this.currentUser.unitId);
                if(u) units.push(u);
            }
            units.forEach(u => this.unitMap[u.unitId] = u.unitName);
            unitOptionsHtml = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        }

        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-users"></i> 人員管理</h3></div>
                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-filter" class="form-select w-auto" ${!isAdmin && Object.keys(this.unitMap).length <= 1 ? 'disabled' : ''}>
                            ${unitOptionsHtml}
                        </select>
                        <div class="vr mx-2"></div>
                        <button id="btn-add-staff" class="btn btn-primary w-auto text-nowrap"><i class="fas fa-plus"></i> 新增人員</button>
                        <div class="ms-auto"><input type="text" id="keyword-search" class="form-control form-control-sm" placeholder="搜尋姓名/編號..."></div>
                    </div>
                </div>
                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        ${this.renderSortableHeader('單位', 'unitId')}
                                        ${this.renderSortableHeader('編號', 'staffId')}
                                        ${this.renderSortableHeader('姓名', 'name')}
                                        ${this.renderSortableHeader('職級', 'rank')}
                                        <th>組別</th>
                                        <th>Email</th>
                                        <th>角色</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-tbody"><tr><td colspan="8" class="text-center py-5 text-muted">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                ${this.renderModal(isAdmin)}
            </div>
        `;
    }

    renderSortableHeader(label, key) { return `<th class="sortable-th" style="cursor:pointer;" onclick="window.routerPage.handleSort('${key}')">${label} <i class="fas fa-sort text-muted"></i></th>`; }

    renderModal(isAdmin) {
        return `
            <div class="modal fade" id="staff-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title fw-bold" id="modal-title">新增人員</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">
                            <form id="staff-form">
                                <input type="hidden" id="edit-uid">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6"><label class="form-label fw-bold">所屬單位</label><select id="edit-unit" class="form-select" ${!isAdmin ? 'disabled' : ''}></select></div>
                                    <div class="col-md-6"><label class="form-label fw-bold">員工編號</label><input type="text" id="edit-staffId" class="form-control" required></div>
                                </div>
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6"><label class="form-label fw-bold">姓名</label><input type="text" id="edit-name" class="form-control" required></div>
                                    <div class="col-md-6"><label class="form-label fw-bold">Email</label><input type="email" id="edit-email" class="form-control" required></div>
                                </div>
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">職級</label>
                                        <select id="edit-level" class="form-select">
                                            <option value="N0">N0</option><option value="N1">N1</option><option value="N2">N2</option>
                                            <option value="N3">N3</option><option value="N4">N4</option><option value="AHN">AHN</option><option value="HN">HN</option><option value="NP">NP</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">組別</label>
                                        <select id="edit-group" class="form-select">
                                            <option value="">(載入中...)</option>
                                        </select>
                                    </div>
                                </div>
                                <hr>
                                <div class="mb-3"><label class="form-label fw-bold text-primary">排班參數</label><div class="row g-2 mb-2"><div class="col-6"><label class="small text-muted">連上上限</label><input type="number" id="edit-maxConsecutive" class="form-control form-control-sm" min="1"></div><div class="col-6"><label class="small text-muted">連夜上限</label><input type="number" id="edit-maxConsecutiveNights" class="form-control form-control-sm" min="1"></div></div><div class="d-flex gap-3"><div class="form-check"><input type="checkbox" id="edit-isPregnant" class="form-check-input"><label class="form-check-label text-danger">懷孕 (不排夜)</label></div><div class="form-check"><input type="checkbox" id="edit-canBatch" class="form-check-input"><label class="form-check-label">可包班</label></div></div></div>
                                <div class="mb-3"><label class="form-label fw-bold text-primary">系統權限</label><div class="d-flex gap-3"><div class="form-check"><input type="checkbox" id="edit-is-manager" class="form-check-input"><label class="form-check-label">管理者</label></div><div class="form-check"><input type="checkbox" id="edit-is-scheduler" class="form-check-input"><label class="form-check-label">排班者</label></div></div></div>
                            </form>
                        </div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button></div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if(!this.currentUser) return;
        window.routerPage = this;
        this.editModal = new bootstrap.Modal(document.getElementById('staff-modal'));
        const unitSelect = document.getElementById('unit-filter');
        
        unitSelect.addEventListener('change', () => this.loadData());
        document.getElementById('btn-add-staff').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save').addEventListener('click', () => this.handleSave());
        document.getElementById('keyword-search').addEventListener('input', (e) => this.filterData(e.target.value));

        // 監聽 Modal 中的單位切換，動態更新組別選單
        document.getElementById('edit-unit').addEventListener('change', (e) => this.updateGroupOptions(e.target.value));

        if(unitSelect.options.length > 0) this.loadData();
    }

    async updateGroupOptions(unitId, selectedGroup = '') {
        const groupSelect = document.getElementById('edit-group');
        groupSelect.innerHTML = '<option value="">載入中...</option>';
        
        if (!unitId) {
            groupSelect.innerHTML = '<option value="">請先選擇單位</option>';
            return;
        }

        try {
            const unit = await UnitService.getUnitById(unitId);
            const groups = unit.groups || [];
            
            let html = '<option value="">(無組別)</option>';
            html += groups.map(g => `<option value="${g}">${g}</option>`).join('');
            groupSelect.innerHTML = html;
            
            if (selectedGroup) groupSelect.value = selectedGroup;
        } catch(e) {
            groupSelect.innerHTML = '<option value="">讀取失敗</option>';
        }
    }

    async openModal(uid = null) {
        document.getElementById('staff-form').reset();
        const editUnit = document.getElementById('edit-unit');
        editUnit.innerHTML = document.getElementById('unit-filter').innerHTML;
        if(editUnit.options[0].value === "") editUnit.remove(0);

        if(uid) {
            document.getElementById('modal-title').textContent = "編輯人員";
            const u = this.staffList.find(x => x.uid === uid);
            document.getElementById('edit-uid').value = uid;
            document.getElementById('edit-unit').value = u.unitId;
            document.getElementById('edit-staffId').value = u.staffId;
            document.getElementById('edit-name').value = u.name;
            document.getElementById('edit-email').value = u.email;
            document.getElementById('edit-email').disabled = true;
            document.getElementById('edit-level').value = u.rank;
            
            // ✅ 更新組別下拉選單
            await this.updateGroupOptions(u.unitId, u.group);

            document.getElementById('edit-isPregnant').checked = !!u.constraints?.isPregnant;
            document.getElementById('edit-canBatch').checked = !!u.constraints?.canBatch;
            document.getElementById('edit-maxConsecutive').value = u.constraints?.maxConsecutive || 6;
            document.getElementById('edit-maxConsecutiveNights').value = u.constraints?.maxConsecutiveNights || 4;
            document.getElementById('edit-is-manager').checked = u.role === 'unit_manager';
            document.getElementById('edit-is-scheduler').checked = u.role === 'unit_scheduler';
        } else {
            document.getElementById('modal-title').textContent = "新增人員";
            document.getElementById('edit-uid').value = "";
            document.getElementById('edit-email').disabled = false;
            // 若有預設單位，載入該單位的組別
            const defaultUnit = editUnit.value;
            if(defaultUnit) await this.updateGroupOptions(defaultUnit);
        }
        this.editModal.show();
    }

    // ... (其他方法 handleSave, loadData, renderTable 等保持不變，請從上一版完整複製)
    async loadData() { /* 省略... */ const unitId = document.getElementById('unit-filter').value; this.staffList = unitId ? await userService.getUsersByUnit(unitId) : []; this.applySortAndFilter(); }
    applySortAndFilter() { /* 省略... */ this.displayList = this.staffList; this.renderTable(); }
    renderTable() { /* ... */ }
    async handleSave() { /* ... 請使用上一版的邏輯，只是 edit-group 取值變成 select.value ... */ }
    async deleteStaff(uid) { if(confirm("刪除?")) { await userService.deleteStaff(uid); this.loadData(); } }
}
