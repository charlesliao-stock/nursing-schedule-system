// ... imports ...
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { authService } from "../../services/firebase/AuthService.js"; // Auth

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
        this.selectedIds = new Set();
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        const unitMap = {};
        units.forEach(u => unitMap[u.unitId] = u.unitName);
        this.unitMap = unitMap;
        
        let unitOptions = '';
        if (isSystemAdmin) {
            unitOptions = '<option value="">全部單位</option>' + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            const myUnit = units.find(u => u.unitId === user.unitId);
            if (myUnit) unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
        }

        // ... HTML 結構與之前相同，僅修改 Select 屬性 ...
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
                            <select id="unit-filter" class="form-select form-select-sm" style="width:auto;" ${!isSystemAdmin ? 'disabled' : ''}>
                                ${unitOptions}
                            </select>
                        </div>
                    </div>
                    <div class="card-body"><div class="table-responsive"><table class="table table-bordered table-hover" id="staffTable" width="100%"><thead class="table-light"><tr><th style="width:40px" class="text-center"><input type="checkbox" id="select-all" class="form-check-input"></th><th>ID</th><th>姓名</th><th>Email</th><th>職級</th><th>單位</th><th class="text-center">管</th><th class="text-center">排</th><th>操作</th></tr></thead><tbody id="staff-tbody"></tbody></table></div></div>
                </div>
                ${this.renderModals(unitOptions, isSystemAdmin)}
            </div>
        `;
    }
    
    renderModals(unitOptions, isAdmin) {
        // 為了節省長度，這裡回傳 Modal HTML 字串
        // 重點：edit-unit 欄位在非管理員時應 disabled
        const disabledAttr = !isAdmin ? 'disabled' : '';
        return `
            <div id="staff-modal" class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">編輯人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><form id="staff-form"><input type="hidden" id="edit-id"><div class="mb-3"><label>ID</label><input type="text" id="edit-staffId" class="form-control" disabled></div><div class="mb-3"><label>姓名</label><input type="text" id="edit-name" class="form-control" required></div><div class="mb-3"><label>Email</label><input type="email" id="edit-email" class="form-control" disabled></div><div class="mb-3"><label>職級</label><select id="edit-level" class="form-select"><option value="N0">N0</option><option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option><option value="N4">N4</option><option value="AHN">AHN</option><option value="HN">HN</option></select></div><div class="mb-3"><label>單位</label><select id="edit-unit" class="form-select" ${disabledAttr}>${unitOptions}</select></div><div class="card bg-light border-0 mb-3"><div class="card-body py-2"><h6 class="card-title small text-muted">權限</h6><div class="form-check"><input type="checkbox" id="edit-is-manager" class="form-check-input"><label class="form-check-label">管理者</label></div><div class="form-check"><input type="checkbox" id="edit-is-scheduler" class="form-check-input"><label class="form-check-label">排班者</label></div></div></div></form></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save-edit" class="btn btn-primary">儲存</button></div></div></div></div>
            <div id="import-staff-modal" class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">匯入人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>請上傳 CSV。</p><input type="file" id="staff-csv-file" accept=".csv" class="form-control"><div id="staff-import-result" class="mt-2"></div></div><div class="modal-footer"><button id="start-staff-import" class="btn btn-primary">開始匯入</button></div></div></div></div>
        `;
    }

    async afterRender() {
        // ... (綁定事件邏輯保持不變) ...
        const unitFilter = document.getElementById('unit-filter');
        
        // 初始載入
        const loadStaff = async (unitId) => {
            const tbody = document.getElementById('staff-tbody');
            tbody.innerHTML = '<tr><td colspan="9">載入中...</td></tr>';
            let staff = [];
            if (unitId) staff = await userService.getUnitStaff(unitId);
            else staff = await userService.getAllStaff(); // 只有 admin 能選到空值
            this.staffList = staff;
            this.renderTable();
        };

        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));
        loadStaff(unitFilter.value); // 自動根據預設值載入

        // ... (Modal 與 批次操作事件綁定 同前版) ...
        // 請確保引用完整的 afterRender 邏輯
    }
    
    renderTable() { /*... 同前版 ...*/ }
}
