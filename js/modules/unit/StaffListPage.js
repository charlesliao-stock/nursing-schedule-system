import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { authService } from "../../services/firebase/AuthService.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];       // 存放目前顯示的人員資料
        this.unitMap = {};         // UnitID -> UnitName 對照表
        this.selectedIds = new Set(); // 批次操作選取的 ID
        this.currentUser = null;
        this.editModal = null;
        this.importModal = null;
    }

    async render() {
        // 1. 取得當前使用者與 Profile
        this.currentUser = authService.getProfile();
        if (!this.currentUser) {
            return `<div class="alert alert-danger m-4">讀取使用者資料失敗，請重新登入</div>`;
        }

        const isSystemAdmin = this.currentUser.role === 'system_admin';
        console.log(`[StaffList] Current Role: ${this.currentUser.role}, UnitID: ${this.currentUser.unitId}`);
        
        // 2. 準備單位選單資料
        let units = [];
        try {
            units = await UnitService.getAllUnits();
            units.forEach(u => this.unitMap[u.unitId] = u.unitName);
        } catch (e) {
            console.error("無法讀取單位列表:", e);
        }
        
        // 建立篩選與批次調動用的選項
        const batchUnitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        
        // 建立頂部篩選器 (系統管理員可選全部，單位管理者鎖定自己)
        let filterUnitOptions = '';
        if (isSystemAdmin) {
            filterUnitOptions = '<option value="">全部單位</option>' + batchUnitOptions;
        } else {
            // 單位管理者邏輯
            if (this.currentUser.unitId) {
                const myUnitName = this.unitMap[this.currentUser.unitId] || '本單位';
                filterUnitOptions = `<option value="${this.currentUser.unitId}" selected>${myUnitName}</option>`;
            } else {
                filterUnitOptions = `<option value="" selected disabled>未綁定單位</option>`;
            }
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-users-cog"></i> 人員管理</h2>
                    <div>
                        <button id="import-btn" class="btn btn-secondary btn-sm me-2">
                            <i class="fas fa-file-import"></i> 匯入人員
                        </button>
                        <button id="add-staff-btn" class="btn btn-primary btn-sm">
                            <i class="fas fa-plus"></i> 新增人員
                        </button>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 bg-white">
                        <div class="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
                            
                            <div class="d-flex align-items-center gap-3">
                                <h6 class="m-0 font-weight-bold text-primary">人員列表</h6>
                                
                                <div id="batch-actions" class="d-none align-items-center gap-2 bg-light p-1 rounded border ms-2">
                                    <span class="small fw-bold ms-2">已選 <span id="selected-count" class="text-danger">0</span> 人:</span>
                                    <select id="batch-unit-select" class="form-select form-select-sm d-inline-block w-auto">
                                        <option value="">選擇調動單位...</option>
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
                                    <input type="text" id="keyword-search" class="form-control" placeholder="搜尋姓名/ID...">
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
                                        <th style="width:40px" class="text-center">
                                            <input type="checkbox" id="select-all" class="form-check-input">
                                        </th>
                                        <th>姓名</th>
                                        <th>Email</th>
                                        <th>職級</th>
                                        <th>單位</th>
                                        <th class="text-center">角色</th>
                                        <th class="text-center">懷孕</th>
                                        <th class="text-end pe-4">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-tbody">
                                    <tr><td colspan="8" class="text-center py-4">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                ${this.renderModals(batchUnitOptions, isSystemAdmin)}
            </div>
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
                                <input type="hidden" id="edit-id"> <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small">姓名</label>
                                        <input type="text" id="edit-name" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small">員工編號 (ID)</label>
                                        <input type="text" id="edit-staffId" class="form-control" disabled>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label small">Email (帳號)</label>
                                    <input type="email" id="edit-email" class="form-control" disabled>
                                </div>

                                <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label small">職級</label>
                                        <select id="edit-level" class="form-select">
                                            <option value="N0">N0</option>
                                            <option value="N1">N1</option>
                                            <option value="N2">N2</option>
                                            <option value="N3">N3</option>
                                            <option value="N4">N4</option>
                                            <option value="AHN">AHN</option>
                                            <option value="HN">HN</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small">所屬單位</label>
                                        <select id="edit-unit" class="form-select" ${!isAdmin ? 'disabled' : ''}>
                                            ${unitOptions}
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="card bg-light border-0 mb-3">
                                    <div class="card-body py-2">
                                        <h6 class="card-title small text-muted fw-bold">排班參數</h6>
                                        <div class="d-flex gap-3">
                                            <div class="form-check form-switch">
                                                <input type="checkbox" id="edit-isPregnant" class="form-check-input">
                                                <label class="form-check-label text-danger fw-bold">懷孕 (不排夜)</label>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input type="checkbox" id="edit-canBatch" class="form-check-input">
                                                <label class="form-check-label">可包班</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="card bg-light border-0 mb-3">
                                    <div class="card-body py-2">
                                        <h6 class="card-title small text-muted fw-bold">系統權限</h6>
                                        <div class="d-flex gap-3">
                                            <div class="form-check">
                                                <input type="checkbox" id="edit-is-manager" class="form-check-input">
                                                <label class="form-check-label">管理者 (Manager)</label>
                                            </div>
                                            <div class="form-check">
                                                <input type="checkbox" id="edit-is-scheduler" class="form-check-input">
                                                <label class="form-check-label">排班者 (Scheduler)</label>
                                            </div>
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
                        <div class="modal-header">
                            <h5 class="modal-title">批次匯入人員</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>請上傳 CSV 檔案，格式範例：<br><code>name, email, level, staffId</code></p>
                            <input type="file" id="staff-csv-file" accept=".csv" class="form-control">
                            <div id="staff-import-result" class="mt-2 text-primary small"></div>
                        </div>
                        <div class="modal-footer">
                            <button id="start-staff-import" class="btn btn-primary">開始匯入</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if (!this.currentUser) return;

        // 初始化 Modals
        const modalEl = document.getElementById('staff-modal');
        if (modalEl) this.editModal = new bootstrap.Modal(modalEl);
        
        const importModalEl = document.getElementById('import-staff-modal');
        if (importModalEl) this.importModal = new bootstrap.Modal(importModalEl);

        // 綁定頂部按鈕
        document.getElementById('add-staff-btn').addEventListener('click', () => {
             // 假設新增是跳轉頁面
             router.navigate('/unit/staff/create');
        });
        document.getElementById('import-btn').addEventListener('click', () => this.importModal.show());

        // 綁定篩選器變更事件
        const unitFilter = document.getElementById('unit-filter');
        unitFilter.addEventListener('change', (e) => this.loadStaff(e.target.value));

        // 綁定全選 Checkbox
        const selectAllCheckbox = document.getElementById('select-all');
        selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));

        // 綁定搜尋按鈕
        document.getElementById('btn-search').addEventListener('click', () => this.handleSearch());

        // 綁定批次操作
        document.getElementById('btn-batch-move').addEventListener('click', () => this.handleBatchMove());
        document.getElementById('btn-batch-delete').addEventListener('click', () => this.handleBatchDelete());

        // 綁定單筆操作 (表格內按鈕) - 使用 Event Delegation
        document.getElementById('staff-tbody').addEventListener('click', (e) => this.handleTableClick(e));

        // 綁定儲存編輯
        document.getElementById('btn-save-edit').addEventListener('click', () => this.saveEdit());

        // --- 初始載入資料 ---
        // 取得篩選器預設值 (如果是單位管理者，已經被設為 disabled + selected)
        const initialUnitId = unitFilter.value;
        if (initialUnitId) {
            await this.loadStaff(initialUnitId);
        } else if (this.currentUser.role === 'system_admin') {
            await this.loadStaff(""); // 載入全部
        } else {
            // 單位管理者但沒有 unitId
            document.getElementById('staff-tbody').innerHTML = 
                `<tr><td colspan="8" class="text-center text-danger">錯誤：您的帳號未綁定單位 ID，無法顯示人員。</td></tr>`;
        }
    }

    async loadStaff(unitId) {
        const tbody = document.getElementById('staff-tbody');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';
        
        // 重置選取狀態
        this.selectedIds.clear();
        document.getElementById('select-all').checked = false;
        this.updateBatchUI();

        try {
            let staff = [];
            
            // ✨ 關鍵邏輯：如果是 admin，依傳入參數查；如果是單位管理者，強制鎖定 unitId
            let targetUnitId = unitId;
            if (this.currentUser.role !== 'system_admin') {
                targetUnitId = this.currentUser.unitId;
            }

            console.log(`[StaffList] Querying staff for unitId: ${targetUnitId || 'ALL'}`);

            if (targetUnitId) {
                // 查詢特定單位
                staff = await userService.getUsersByUnit(targetUnitId);
            } else if (this.currentUser.role === 'system_admin') {
                // 查詢全部 (僅限 admin)
                staff = await userService.getAllUsers();
            }

            this.staffList = staff || [];
            this.renderTable();

        } catch (error) {
            console.error("Load Staff Error:", error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">載入失敗: ${error.message}</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('staff-tbody');
        if (this.staffList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">此單位尚無人員資料</td></tr>`;
            return;
        }

        tbody.innerHTML = this.staffList.map(u => {
            const roleBadge = this.getRoleBadge(u.role);
            const unitName = this.unitMap[u.unitId] || u.unitId || '-';
            const isPreg = u.constraints?.isPregnant ? '<i class="fas fa-baby text-danger" title="懷孕"></i>' : '-';
            
            return `
                <tr>
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input row-select" value="${u.uid}">
                    </td>
                    <td class="fw-bold">${u.name || '未命名'}</td>
                    <td>${u.email}</td>
                    <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                    <td>${unitName}</td>
                    <td class="text-center">${roleBadge}</td>
                    <td class="text-center">${isPreg}</td>
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${u.uid}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    getRoleBadge(role) {
        switch(role) {
            case 'system_admin': return '<span class="badge bg-dark">系統管理員</span>';
            case 'unit_manager': return '<span class="badge bg-primary">單位管理者</span>';
            case 'unit_scheduler': return '<span class="badge bg-info text-dark">排班人員</span>';
            default: return '<span class="badge bg-secondary">一般人員</span>';
        }
    }

    handleTableClick(e) {
        // 處理 Checkbox 點擊
        if (e.target.classList.contains('row-select')) {
            if (e.target.checked) this.selectedIds.add(e.target.value);
            else this.selectedIds.delete(e.target.value);
            this.updateBatchUI();
            return;
        }

        // 處理編輯按鈕
        const btn = e.target.closest('.edit-btn');
        if (btn) {
            const uid = btn.dataset.id;
            this.openEditModal(uid);
        }
    }

    openEditModal(uid) {
        const u = this.staffList.find(x => x.uid === uid);
        if (!u) return;

        // 填入表單
        document.getElementById('edit-id').value = u.uid;
        document.getElementById('edit-name').value = u.name || '';
        document.getElementById('edit-staffId').value = u.staffId || '';
        document.getElementById('edit-email').value = u.email || '';
        document.getElementById('edit-level').value = u.rank || 'N0'; // 注意欄位名是 rank 還是 level
        document.getElementById('edit-unit').value = u.unitId || '';
        
        // 排班參數
        document.getElementById('edit-isPregnant').checked = !!(u.constraints?.isPregnant);
        document.getElementById('edit-canBatch').checked = !!(u.constraints?.canBatch);
        
        // 權限 (根據 role 判斷 Checkbox)
        document.getElementById('edit-is-manager').checked = (u.role === 'unit_manager');
        document.getElementById('edit-is-scheduler').checked = (u.role === 'unit_scheduler');

        this.editModal.show();
    }

    async saveEdit() {
        const uid = document.getElementById('edit-id').value;
        const newName = document.getElementById('edit-name').value;
        const newRank = document.getElementById('edit-level').value;
        const newUnitId = document.getElementById('edit-unit').value;
        
        const isPreg = document.getElementById('edit-isPregnant').checked;
        const canBatch = document.getElementById('edit-canBatch').checked;
        
        const isManager = document.getElementById('edit-is-manager').checked;
        const isScheduler = document.getElementById('edit-is-scheduler').checked;

        // 決定 Role
        let newRole = 'staff';
        if (isManager) newRole = 'unit_manager';
        else if (isScheduler) newRole = 'unit_scheduler';

        const updateData = {
            name: newName,
            rank: newRank,
            unitId: newUnitId,
            role: newRole,
            constraints: {
                isPregnant: isPreg,
                canBatch: canBatch
            }
        };

        try {
            await userService.updateUser(uid, updateData);
            alert("✅ 儲存成功");
            this.editModal.hide();
            // 重新整理列表
            const currentFilter = document.getElementById('unit-filter').value;
            this.loadStaff(currentFilter);
        } catch (e) {
            alert("儲存失敗: " + e.message);
        }
    }

    // --- 批次功能 ---

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

    async handleBatchMove() {
        const targetUnitId = document.getElementById('batch-unit-select').value;
        if (!targetUnitId) return alert('請選擇要調動到的單位');
        if (this.selectedIds.size === 0) return;

        if (confirm(`確定將這 ${this.selectedIds.size} 位人員調動到新單位嗎？`)) {
            try {
                const ids = Array.from(this.selectedIds);
                // 假設 UserService 有這個方法，如果沒有需要去新增
                await userService.batchUpdateUnit(ids, targetUnitId);
                alert('調動成功');
                this.loadStaff(document.getElementById('unit-filter').value);
            } catch (e) {
                alert('調動失敗: ' + e.message);
            }
        }
    }

    async handleBatchDelete() {
        if (this.selectedIds.size === 0) return;
        if (confirm(`⚠️ 警告：確定要刪除這 ${this.selectedIds.size} 位人員嗎？此動作無法復原！`)) {
             try {
                const ids = Array.from(this.selectedIds);
                await userService.batchDeleteUsers(ids);
                alert('刪除成功');
                this.loadStaff(document.getElementById('unit-filter').value);
            } catch (e) {
                alert('刪除失敗: ' + e.message);
            }
        }
    }

    handleSearch() {
        const keyword = document.getElementById('keyword-search').value.toLowerCase();
        if (!keyword) {
            this.renderTable(); // 恢復原狀
            return;
        }
        
        // 前端篩選
        const filtered = this.staffList.filter(u => 
            (u.name && u.name.toLowerCase().includes(keyword)) ||
            (u.email && u.email.toLowerCase().includes(keyword)) ||
            (u.staffId && u.staffId.includes(keyword))
        );
        
        // 暫時替換顯示列表 (不影響 this.staffList)
        const originalList = this.staffList;
        this.staffList = filtered;
        this.renderTable();
        this.staffList = originalList; // 還原以免影響邏輯
    }
}
