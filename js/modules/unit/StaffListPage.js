import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { authService } from "../../services/firebase/AuthService.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
        this.selectedIds = new Set();
        this.currentUser = null;
    }

    async render() {
        // ... (Render HTML 保持不變，為節省篇幅省略，請直接沿用上一版的 render) ...
        // ... 重點是底下的 renderModals 和 afterRender ...
        this.currentUser = authService.getProfile();
        const isSystemAdmin = this.currentUser.role === 'system_admin';
        const units = await UnitService.getAllUnits();
        const unitMap = {};
        units.forEach(u => unitMap[u.unitId] = u.unitName);
        this.unitMap = unitMap;
        let unitOptions = isSystemAdmin ? '<option value="">全部單位</option>'+units.map(u=>`<option value="${u.unitId}">${u.unitName}</option>`).join('') : '';
        if (!isSystemAdmin) {
            const myUnit = units.find(u => u.unitId === this.currentUser.unitId);
            if (myUnit) unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
        }

        // 回傳 HTML (請確保與前版相同，包含 checkbox id="select-all")
        return `
            <div class="main-content container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-users-cog"></i> 人員管理</h2>
                    <div>
                        <button id="import-btn" class="btn btn-secondary btn-sm me-2"><i class="fas fa-file-import"></i> 匯入人員</button>
                        <button id="add-staff-btn" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> 新增人員</button>
                        <button id="back-btn" class="btn btn-outline-secondary btn-sm ms-2">返回</button>
                    </div>
                </div>
                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                            <h6 class="m-0 font-weight-bold text-primary">人員列表</h6>
                            <div id="batch-actions" class="d-none align-items-center gap-2 bg-light p-1 rounded border">
                                <span class="small fw-bold ms-2">已選 <span id="selected-count">0</span> 人</span>
                                <button id="btn-batch-delete" class="btn btn-sm btn-danger">刪除</button>
                            </div>
                        </div>
                        <div class="d-flex align-items-center">
                            <label class="me-2 mb-0 small fw-bold">篩選單位：</label>
                            <select id="unit-filter" class="form-select form-select-sm" style="width:auto;" ${!isSystemAdmin?'disabled':''}>${unitOptions}</select>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover" id="staffTable" width="100%">
                                <thead class="table-light"><tr><th style="width:40px" class="text-center"><input type="checkbox" id="select-all" class="form-check-input"></th><th>ID</th><th>姓名</th><th>Email</th><th>職級</th><th>單位</th><th class="text-center">管</th><th class="text-center">排</th><th>操作</th></tr></thead>
                                <tbody id="staff-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                ${this.renderModals(unitOptions, isSystemAdmin)}
            </div>`;
    }

    renderModals(unitOptions, isAdmin) {
        // Fix 3: 編輯 Modal 加入橫向排列的 懷孕/包班 設定
        return `
            <div id="staff-modal" class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">編輯人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><form id="staff-form"><input type="hidden" id="edit-id"><div class="mb-3"><label>ID</label><input type="text" id="edit-staffId" class="form-control" disabled></div><div class="mb-3"><label>姓名</label><input type="text" id="edit-name" class="form-control" required></div><div class="mb-3"><label>Email</label><input type="email" id="edit-email" class="form-control" disabled></div><div class="mb-3"><label>職級</label><select id="edit-level" class="form-select"><option value="N0">N0</option><option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option><option value="N4">N4</option><option value="AHN">AHN</option><option value="HN">HN</option></select></div><div class="mb-3"><label>單位</label><select id="edit-unit" class="form-select" ${!isAdmin?'disabled':''}>${unitOptions}</select></div>
            
            <div class="card bg-light border-0 mb-3"><div class="card-body py-2">
                <h6 class="card-title small text-muted">排班參數</h6>
                <div class="row">
                    <div class="col-6"><div class="form-check form-switch"><input type="checkbox" id="edit-isPregnant" class="form-check-input"><label class="form-check-label text-danger fw-bold">懷孕 (不排夜)</label></div></div>
                    <div class="col-6"><div class="form-check form-switch"><input type="checkbox" id="edit-canBatch" class="form-check-input"><label class="form-check-label">可包班</label></div></div>
                </div>
            </div></div>

            <div class="card bg-light border-0 mb-3"><div class="card-body py-2"><h6 class="card-title small text-muted">權限</h6><div class="d-flex gap-3"><div class="form-check"><input type="checkbox" id="edit-is-manager" class="form-check-input"><label class="form-check-label">管理者</label></div><div class="form-check"><input type="checkbox" id="edit-is-scheduler" class="form-check-input"><label class="form-check-label">排班者</label></div></div></div></div></form></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save-edit" class="btn btn-primary">儲存</button></div></div></div></div>
            <div id="import-staff-modal" class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">匯入人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>請上傳 CSV。</p><input type="file" id="staff-csv-file" accept=".csv" class="form-control"><div id="staff-import-result" class="mt-2"></div></div><div class="modal-footer"><button id="start-staff-import" class="btn btn-primary">開始匯入</button></div></div></div></div>
        `;
    }

    async afterRender() {
        const modalEl = document.getElementById('staff-modal');
        this.editModal = new bootstrap.Modal(modalEl);
        const importModalEl = document.getElementById('import-staff-modal');
        this.importModal = new bootstrap.Modal(importModalEl);

        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('add-staff-btn').addEventListener('click', () => router.navigate('/unit/staff/create'));
        document.getElementById('import-btn').addEventListener('click', () => this.importModal.show());

        const unitFilter = document.getElementById('unit-filter');
        const tbody = document.getElementById('staff-tbody');
        const selectAllCheckbox = document.getElementById('select-all');
        const batchToolbar = document.getElementById('batch-actions');
        const countSpan = document.getElementById('selected-count');

        const updateBatchUI = () => {
            countSpan.textContent = this.selectedIds.size;
            if (this.selectedIds.size > 0) {
                batchToolbar.classList.remove('d-none');
                batchToolbar.classList.add('d-flex');
            } else {
                batchToolbar.classList.add('d-none');
                batchToolbar.classList.remove('d-flex');
            }
        };

        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3">載入中...</td></tr>';
            this.selectedIds.clear();
            updateBatchUI();
            if(selectAllCheckbox) selectAllCheckbox.checked = false;

            try {
                let staff = [];
                const targetId = this.currentUser.role === 'system_admin' ? unitId : this.currentUser.unitId;
                if (targetId) staff = await userService.getUnitStaff(targetId);
                else if (this.currentUser.role === 'system_admin') staff = await userService.getAllStaff();
                this.staffList = staff;
                this.renderTable();
            } catch (error) {
                console.error(error);
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">載入失敗</td></tr>';
            }
        };

        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        // Fix 4: 全選功能
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll('.row-select');
            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) this.selectedIds.add(cb.value);
                else this.selectedIds.delete(cb.value);
            });
            updateBatchUI();
        });

        // 委派事件處理單選與按鈕
        tbody.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-select')) {
                if (e.target.checked) this.selectedIds.add(e.target.value);
                else this.selectedIds.delete(e.target.value);
                updateBatchUI();
            }
        });

        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if(!btn) return;
            const id = btn.dataset.id;
            
            if (btn.classList.contains('edit-btn')) {
                const s = this.staffList.find(x => x.id === id);
                document.getElementById('edit-id').value = s.id;
                document.getElementById('edit-name').value = s.name;
                document.getElementById('edit-staffId').value = s.staffId;
                document.getElementById('edit-email').value = s.email;
                document.getElementById('edit-level').value = s.level;
                document.getElementById('edit-unit').value = s.unitId;
                document.getElementById('edit-is-manager').checked = !!(s.permissions?.canManageUnit);
                document.getElementById('edit-is-scheduler').checked = !!(s.permissions?.canEditSchedule);
                
                // 載入 Constraints
                document.getElementById('edit-isPregnant').checked = !!(s.constraints?.isPregnant);
                document.getElementById('edit-canBatch').checked = !!(s.constraints?.canBatch);

                this.editModal.show();
            }
            // Delete logic...
        });

        // Save logic
        document.getElementById('btn-save-edit').addEventListener('click', async () => {
            const id = document.getElementById('edit-id').value;
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: document.getElementById('edit-unit').value,
                // 更新 constraints
                constraints: {
                    isPregnant: document.getElementById('edit-isPregnant').checked,
                    canBatch: document.getElementById('edit-canBatch').checked,
                    maxConsecutive: 6 // 預設
                }
            };
            const isManager = document.getElementById('edit-is-manager').checked;
            const isScheduler = document.getElementById('edit-is-scheduler').checked;
            
            await userService.updateStaff(id, updateData);
            await userService.toggleUnitManager(id, updateData.unitId, isManager);
            await userService.toggleUnitScheduler(id, updateData.unitId, isScheduler);
            
            this.editModal.hide();
            loadStaff(unitFilter.value);
        });

        // 初始載入
        const initialUnit = unitFilter.value;
        if (initialUnit) loadStaff(initialUnit);
        else if (isSystemAdmin) loadStaff("");
    }

    renderTable() {
        const tbody = document.getElementById('staff-tbody');
        if (this.staffList.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3 text-muted">無資料</td></tr>'; return; }
        tbody.innerHTML = this.staffList.map(s => {
            const isManager = s.permissions?.canManageUnit || s.role === 'unit_manager';
            const isScheduler = s.permissions?.canEditSchedule || s.role === 'unit_scheduler';
            return `<tr><td class="text-center align-middle"><input type="checkbox" class="form-check-input row-select" value="${s.id}"></td><td class="align-middle font-monospace">${s.staffId||'-'}</td><td class="align-middle fw-bold">${s.name}</td><td class="align-middle small text-muted">${s.email}</td><td class="align-middle">${s.level||'N0'}</td><td class="align-middle"><span class="badge bg-light text-dark border">${this.unitMap[s.unitId]||s.unitId}</span></td><td class="align-middle text-center">${isManager?'<i class="fas fa-check-circle text-success"></i>':'-'}</td><td class="align-middle text-center">${isScheduler?'<i class="fas fa-check-circle text-primary"></i>':'-'}</td><td class="align-middle"><button class="btn btn-sm btn-outline-primary edit-btn me-1" data-id="${s.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${s.id}"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
    }
}
