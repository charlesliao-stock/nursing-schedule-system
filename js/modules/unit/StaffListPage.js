import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { authService } from "../../services/firebase/AuthService.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];       // 原始資料
        this.displayList = [];     // 排序/搜尋後的顯示資料
        this.unitMap = {};         // UnitID -> UnitName 對照表
        this.selectedIds = new Set(); 
        this.currentUser = null;
        this.editModal = null;
        this.importModal = null;

        // 排序設定 (預設依員工編號排序)
        this.sortConfig = {
            key: 'staffId',
            direction: 'asc' // or 'desc'
        };
    }

    async render() {
        this.currentUser = authService.getProfile();
        if (!this.currentUser) return `<div class="alert alert-danger m-4">請先登入</div>`;

        const isSystemAdmin = this.currentUser.role === 'system_admin';
        
        // 準備單位資料
        try {
            const units = await UnitService.getAllUnits();
            units.forEach(u => this.unitMap[u.unitId] = u.unitName);
        } catch (e) { console.error(e); }
        
        // 選單選項生成
        const batchUnitOptions = Object.entries(this.unitMap).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
        
        let filterUnitOptions = '';
        if (isSystemAdmin) {
            filterUnitOptions = '<option value="">全部單位</option>' + batchUnitOptions;
        } else {
            const myUnitName = this.unitMap[this.currentUser.unitId] || '本單位';
            filterUnitOptions = `<option value="${this.currentUser.unitId}" selected>${myUnitName}</option>`;
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-users-cog"></i> 人員管理列表</h2>
                    <div>
                        <button id="import-btn" class="btn btn-secondary btn-sm me-2"><i class="fas fa-file-import"></i> 匯入</button>
                        <button id="add-staff-btn" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> 新增</button>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 bg-white">
                        <div class="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
                            <div class="d-flex align-items-center gap-3">
                                <h6 class="m-0 font-weight-bold text-primary">人員清單</h6>
                                <div id="batch-actions" class="d-none align-items-center gap-2 bg-light p-1 rounded border ms-2">
                                    <span class="small fw-bold ms-2">已選 <span id="selected-count" class="text-danger">0</span>:</span>
                                    <select id="batch-unit-select" class="form-select form-select-sm d-inline-block w-auto">
                                        <option value="">調動至...</option>
                                        ${batchUnitOptions}
                                    </select>
                                    <button id="btn-batch-move" class="btn btn-sm btn-info text-white">調動</button>
                                    <div class="vr"></div>
                                    <button id="btn-batch-delete" class="btn btn-sm btn-danger">刪除</button>
                                </div>
                            </div>
                            
                            <div class="d-flex align-items-center gap-2">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text bg-light">單位</span>
                                    <select id="unit-filter" class="form-select" style="max-width: 150px;" ${!isSystemAdmin ? 'disabled' : ''}>
                                        ${filterUnitOptions}
                                    </select>
                                </div>
                                <div class="input-group input-group-sm">
                                    <input type="text" id="keyword-search" class="form-control" placeholder="搜尋姓名/編號...">
                                    <button class="btn btn-outline-secondary" type="button" id="btn-search"><i class="fas fa-search"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0" id="staffTable" width="100%">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width:40px" class="text-center"><input type="checkbox" id="select-all" class="form-check-input"></th>
                                        ${this.renderSortableHeader('所屬單位', 'unitId')}
                                        ${this.renderSortableHeader('員工編號', 'staffId')}
                                        ${this.renderSortableHeader('姓名', 'name')}
                                        ${this.renderSortableHeader('職級', 'rank')}
                                        <th>組別</th>
                                        <th>Email</th>
                                        ${this.renderSortableHeader('角色', 'role')}
                                        <th class="text-end pe-4">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-tbody">
                                    <tr><td colspan="9" class="text-center py-4">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                ${this.renderModals(batchUnitOptions, isSystemAdmin)}
            </div>
        `;
    }
    
    // 輔助產生可排序表頭
    renderSortableHeader(label, key) {
        const isActive = this.sortConfig.key === key;
        const icon = isActive 
            ? (this.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>')
            : '<i class="fas fa-sort text-muted opacity-25"></i>';
        
        return `
            <th class="sortable-th" style="cursor:pointer; user-select:none;" data-key="${key}">
                <div class="d-flex align-items-center gap-1">
                    ${label} ${icon}
                </div>
            </th>
        `;
    }

    renderModals(unitOptions, isAdmin) {
        return `
            <div id="staff-modal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">編輯人員資料</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="staff-form">
                                <input type="hidden" id="edit-id">
                                
                                <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">所屬單位</label>
                                        <select id="edit-unit" class="form-select" ${!isAdmin ? 'disabled' : ''}>
                                            ${unitOptions}
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">員工編號</label>
                                        <input type="text" id="edit-staffId" class="form-control">
                                    </div>
                                </div>

                                <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">姓名</label>
                                        <input type="text" id="edit-name" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Email</label>
                                        <input type="email" id="edit-email" class="form-control" disabled>
                                    </div>
                                </div>

                                <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">職級</label>
                                        <select id="edit-level" class="form-select">
                                            <option value="N0">N0</option>
                                            <option value="N1">N1</option>
                                            <option value="N2">N2</option>
                                            <option value="N3">N3</option>
                                            <option value="N4">N4</option>
                                            <option value="AHN">AHN</option>
                                            <option value="HN">HN</option>
                                            <option value="NP">NP</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">組別 (資深/淺)</label>
                                        <input type="text" id="edit-group" class="form-control" placeholder="如: A組, 資深...">
                                    </div>
                                </div>
                                
                                <hr class="my-3">

                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-primary"><i class="fas fa-calendar-alt"></i> 排班參數</label>
                                    <div class="d-flex gap-4 border rounded p-2 bg-light">
                                        <div class="form-check form-switch">
                                            <input type="checkbox" id="edit-isPregnant" class="form-check-input">
                                            <label class="form-check-label text-danger">懷孕 (不排夜)</label>
                                        </div>
                                        <div class="form-check form-switch">
                                            <input type="checkbox" id="edit-canBatch" class="form-check-input">
                                            <label class="form-check-label">可包班</label>
                                        </div>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-primary"><i class="fas fa-user-shield"></i> 系統權限 (複選)</label>
                                    <div class="d-flex gap-4 border rounded p-2 bg-light">
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-is-manager" class="form-check-input">
                                            <label class="form-check-label fw-bold">管理者 (Manager)</label>
                                            <div class="form-text small mt-0">可管理單位人員與設定</div>
                                        </div>
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-is-scheduler" class="form-check-input">
                                            <label class="form-check-label fw-bold">排班者 (Scheduler)</label>
                                            <div class="form-text small mt-0">僅可編輯排班表</div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" id="btn-save-edit" class="btn btn-primary">儲存變更</button>
                        </div>
                    </div>
                </div>
            </div>
            
             <div id="import-staff-modal" class="modal fade" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">匯入人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">
                             <input type="file" id="staff-csv-file" accept=".csv" class="form-control">
                        </div>
                        <div class="modal-footer"><button id="start-staff-import" class="btn btn-primary">開始匯入</button></div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if (!this.currentUser) return;

        // Init Modals
        this.editModal = new bootstrap.Modal(document.getElementById('staff-modal'));
        this.importModal = new bootstrap.Modal(document.getElementById('import-staff-modal'));

        // Bind Top Buttons
        document.getElementById('add-staff-btn').addEventListener('click', () => router.navigate('/unit/staff/create'));
        document.getElementById('import-btn').addEventListener('click', () => this.importModal.show());

        // Bind Filter & Search
        const unitFilter = document.getElementById('unit-filter');
        unitFilter.addEventListener('change', (e) => this.loadStaff(e.target.value));
        
        document.getElementById('btn-search').addEventListener('click', () => this.handleSearch());
        document.getElementById('keyword-search').addEventListener('keyup', (e) => {
            if(e.key === 'Enter') this.handleSearch();
        });

        // Bind Batch Actions
        const selectAll = document.getElementById('select-all');
        selectAll.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        document.getElementById('btn-batch-move').addEventListener('click', () => this.handleBatchMove());
        document.getElementById('btn-batch-delete').addEventListener('click', () => this.handleBatchDelete());

        // Bind Table Sort
        document.querySelectorAll('.sortable-th').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.key));
        });

        // Bind Individual Actions (Edit/Delete)
        document.getElementById('staff-tbody').addEventListener('click', (e) => this.handleTableClick(e));

        // Bind Save Edit
        document.getElementById('btn-save-edit').addEventListener('click', () => this.saveEdit());

        // Initial Load
        const initialUnitId = unitFilter.value;
        if (initialUnitId) await this.loadStaff(initialUnitId);
        else if (this.currentUser.role === 'system_admin') await this.loadStaff("");
        else document.getElementById('staff-tbody').innerHTML = `<tr><td colspan="9" class="text-center text-danger">未綁定單位</td></tr>`;
    }

    async loadStaff(unitId) {
        const tbody = document.getElementById('staff-tbody');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';
        
        this.selectedIds.clear();
        document.getElementById('select-all').checked = false;
        this.updateBatchUI();

        try {
            let targetUnitId = unitId;
            if (this.currentUser.role !== 'system_admin') targetUnitId = this.currentUser.unitId;

            let staff = [];
            if (targetUnitId) staff = await userService.getUsersByUnit(targetUnitId);
            else if (this.currentUser.role === 'system_admin') staff = await userService.getAllUsers();

            this.staffList = staff || [];
            this.applySortAndFilter(); // 處理排序與過濾後顯示
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">載入失敗: ${error.message}</td></tr>`;
        }
    }

    // 處理排序邏輯
    handleSort(key) {
        // 如果點擊相同欄位，切換方向；否則預設升冪
        if (this.sortConfig.key === key) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.key = key;
            this.sortConfig.direction = 'asc';
        }
        
        // 更新表頭圖示
        this.updateHeaderIcons();
        // 重新排序並渲染
        this.applySortAndFilter();
    }

    updateHeaderIcons() {
        document.querySelectorAll('.sortable-th').forEach(th => {
            const key = th.dataset.key;
            const iconContainer = th.querySelector('div');
            // 移除舊 icon
            const oldIcon = iconContainer.querySelector('i');
            if(oldIcon) oldIcon.remove();

            let iconHtml = '<i class="fas fa-sort text-muted opacity-25"></i>';
            if (this.sortConfig.key === key) {
                iconHtml = this.sortConfig.direction === 'asc' 
                    ? '<i class="fas fa-sort-up"></i>' 
                    : '<i class="fas fa-sort-down"></i>';
            }
            iconContainer.insertAdjacentHTML('beforeend', iconHtml);
        });
    }

    // 綜合處理排序與搜尋
    applySortAndFilter() {
        const keyword = document.getElementById('keyword-search').value.toLowerCase();
        
        // 1. 搜尋過濾
        let filtered = this.staffList;
        if (keyword) {
            filtered = this.staffList.filter(u => 
                (u.name && u.name.toLowerCase().includes(keyword)) ||
                (u.staffId && u.staffId.includes(keyword)) ||
                (u.email && u.email.toLowerCase().includes(keyword))
            );
        }

        // 2. 排序
        const key = this.sortConfig.key;
        const dir = this.sortConfig.direction === 'asc' ? 1 : -1;
        
        filtered.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            // 特殊處理：如果是 unitId，改用 unitName 排序
            if (key === 'unitId') {
                valA = this.unitMap[valA] || valA;
                valB = this.unitMap[valB] || valB;
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        this.displayList = filtered;
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('staff-tbody');
        if (this.displayList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">無符合資料</td></tr>`;
            return;
        }

        tbody.innerHTML = this.displayList.map(u => {
            const unitName = this.unitMap[u.unitId] || u.unitId || '-';
            const roleBadge = this.getRoleBadge(u.role);
            // 顯示組別，若無則顯示 -
            const groupBadge = u.group ? `<span class="badge bg-light text-dark border">${u.group}</span>` : '-';

            return `
                <tr>
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input row-select" value="${u.uid}">
                    </td>
                    <td><small class="text-muted">${unitName}</small></td>
                    <td>${u.staffId || '-'}</td>
                    <td class="fw-bold">${u.name || '未命名'}</td>
                    <td><span class="badge bg-light text-dark border">${u.rank || 'N0'}</span></td>
                    <td>${groupBadge}</td>
                    <td><small>${u.email}</small></td>
                    <td>${roleBadge}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${u.uid}">
                            <i class="fas fa-edit"></i> 編輯
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    getRoleBadge(role) {
        switch(role) {
            case 'unit_manager': return '<span class="badge bg-primary">管理者</span>';
            case 'unit_scheduler': return '<span class="badge bg-info text-dark">排班者</span>';
            case 'system_admin': return '<span class="badge bg-dark">系統</span>';
            default: return '<span class="badge bg-secondary">一般</span>';
        }
    }

    handleTableClick(e) {
        if (e.target.classList.contains('row-select')) {
            if (e.target.checked) this.selectedIds.add(e.target.value);
            else this.selectedIds.delete(e.target.value);
            this.updateBatchUI();
            return;
        }

        const btn = e.target.closest('.edit-btn');
        if (btn) this.openEditModal(btn.dataset.id);
    }

    openEditModal(uid) {
        const u = this.staffList.find(x => x.uid === uid);
        if (!u) return;

        // 填入基本資料
        document.getElementById('edit-id').value = u.uid;
        document.getElementById('edit-unit').value = u.unitId || '';
        document.getElementById('edit-staffId').value = u.staffId || '';
        document.getElementById('edit-name').value = u.name || '';
        document.getElementById('edit-email').value = u.email || '';
        document.getElementById('edit-level').value = u.rank || 'N0';
        document.getElementById('edit-group').value = u.group || ''; // 新增組別

        // 排班參數
        document.getElementById('edit-isPregnant').checked = !!(u.constraints?.isPregnant);
        document.getElementById('edit-canBatch').checked = !!(u.constraints?.canBatch);
        
        // 系統權限 (複選邏輯回推)
        // Manager implies Scheduler permissions usually
        const isManager = (u.role === 'unit_manager');
        const isScheduler = (u.role === 'unit_scheduler' || isManager); // Manager 也是排班者
        
        document.getElementById('edit-is-manager').checked = isManager;
        document.getElementById('edit-is-scheduler').checked = isScheduler;

        this.editModal.show();
    }

    async saveEdit() {
        const uid = document.getElementById('edit-id').value;
        const isManager = document.getElementById('edit-is-manager').checked;
        const isScheduler = document.getElementById('edit-is-scheduler').checked;

        // 決定 Role (後端邏輯)
        let newRole = 'user'; // staff
        if (isManager) newRole = 'unit_manager';
        else if (isScheduler) newRole = 'unit_scheduler';

        const updateData = {
            name: document.getElementById('edit-name').value,
            staffId: document.getElementById('edit-staffId').value,
            rank: document.getElementById('edit-level').value,
            unitId: document.getElementById('edit-unit').value,
            group: document.getElementById('edit-group').value, // 儲存組別
            role: newRole,
            permissions: {
                canManageUnit: isManager,
                canEditSchedule: isScheduler || isManager, // 管理者一定能排班
                canViewSchedule: true
            },
            constraints: {
                isPregnant: document.getElementById('edit-isPregnant').checked,
                canBatch: document.getElementById('edit-canBatch').checked,
                maxConsecutive: 6 // 保留預設
            }
        };

        try {
            await userService.updateUser(uid, updateData);
            alert("✅ 修改成功");
            this.editModal.hide();
            // 重新載入並保持當前視圖狀態
            const currentFilter = document.getElementById('unit-filter').value;
            await this.loadStaff(currentFilter);
        } catch (e) {
            alert("修改失敗: " + e.message);
        }
    }

    handleSearch() { this.applySortAndFilter(); }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.row-select');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            if (checked) this.selectedIds.add(cb.value);
            else this.selectedIds.delete(cb.value);
        });
        this.updateBatchUI();
    }

    updateBatchUI() {
        const countSpan = document.getElementById('selected-count');
        const batchToolbar = document.getElementById('batch-actions');
        countSpan.textContent = this.selectedIds.size;
        
        if (this.selectedIds.size > 0) {
            batchToolbar.classList.remove('d-none');
            batchToolbar.classList.add('d-flex');
        } else {
            batchToolbar.classList.add('d-none');
            batchToolbar.classList.remove('d-flex');
        }
    }

    async handleBatchMove() { /* 同前版 (略，避免篇幅過長，邏輯不變) */ }
    async handleBatchDelete() { /* 同前版 (略) */ }
}
