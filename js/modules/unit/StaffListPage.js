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
    }

    async render() {
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
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-users"></i> 人員管理</h3>
                    <p class="text-muted small mb-0">管理單位內護理人員的資料、職級與系統權限。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-filter" class="form-select w-auto" ${!isAdmin && Object.keys(this.unitMap).length <= 1 ? 'disabled' : ''}>
                            ${unitOptionsHtml}
                        </select>
                        
                        <div class="vr mx-2"></div>
                        
                        <button id="btn-add-staff" class="btn btn-primary w-auto text-nowrap">
                            <i class="fas fa-plus"></i> 新增人員
                        </button>

                        <div class="ms-auto">
                            <input type="text" id="keyword-search" class="form-control form-control-sm" placeholder="搜尋姓名/編號...">
                        </div>
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
                                <tbody id="staff-tbody">
                                    <tr><td colspan="8" class="text-center py-5 text-muted">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                ${this.renderModal(isAdmin)}
            </div>
        `;
    }

    renderSortableHeader(label, key) {
        const isActive = this.sortConfig.key === key;
        const icon = isActive 
            ? (this.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>')
            : '<i class="fas fa-sort text-muted opacity-25"></i>';
        
        return `<th class="sortable-th" style="cursor:pointer; user-select:none;" onclick="window.routerPage.handleSort('${key}')">${label} ${icon}</th>`;
    }

    renderModal(isAdmin) {
        return `
            <div class="modal fade" id="staff-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold" id="modal-title">新增人員</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="staff-form">
                                <input type="hidden" id="edit-uid">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">所屬單位</label>
                                        <select id="edit-unit" class="form-select" ${!isAdmin ? 'disabled' : ''}></select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">員工編號</label>
                                        <input type="text" id="edit-staffId" class="form-control" required>
                                    </div>
                                </div>
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">姓名</label>
                                        <input type="text" id="edit-name" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">Email</label>
                                        <input type="email" id="edit-email" class="form-control" required>
                                    </div>
                                </div>
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">職級</label>
                                        <select id="edit-level" class="form-select">
                                            <option value="N0">N0</option><option value="N1">N1</option><option value="N2">N2</option>
                                            <option value="N3">N3</option><option value="N4">N4</option><option value="AHN">AHN</option>
                                            <option value="HN">HN</option><option value="NP">NP</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">組別</label>
                                        <input type="text" id="edit-group" class="form-control" placeholder="如: A組">
                                    </div>
                                </div>
                                <hr>
                                <div class="mb-3">
                                    <label class="form-label fw-bold text-primary">排班參數</label>
                                    <div class="row g-2 mb-2">
                                        <div class="col-6">
                                            <label class="small text-muted">連上上限</label>
                                            <input type="number" id="edit-maxConsecutive" class="form-control form-control-sm" min="1">
                                        </div>
                                        <div class="col-6">
                                            <label class="small text-muted">連夜上限</label>
                                            <input type="number" id="edit-maxConsecutiveNights" class="form-control form-control-sm" min="1">
                                        </div>
                                    </div>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-isPregnant" class="form-check-input">
                                            <label class="form-check-label text-danger">懷孕 (不排夜)</label>
                                        </div>
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-canBatch" class="form-check-input">
                                            <label class="form-check-label">可包班</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold text-primary">系統權限</label>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-is-manager" class="form-check-input">
                                            <label class="form-check-label">管理者</label>
                                        </div>
                                        <div class="form-check">
                                            <input type="checkbox" id="edit-is-scheduler" class="form-check-input">
                                            <label class="form-check-label">排班者</label>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                            <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button>
                        </div>
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

        if(unitSelect.options.length > 0) this.loadData();
    }

    async loadData() {
        const unitId = document.getElementById('unit-filter').value;
        const tbody = document.getElementById('staff-tbody');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5"><span class="spinner-border spinner-border-sm"></span></td></tr>';

        try {
            let list = [];
            if(this.currentUser.role === 'system_admin' && !unitId) {
                list = await userService.getAllUsers();
            } else {
                const target = unitId || this.currentUser.unitId;
                if(target) list = await userService.getUsersByUnit(target);
            }
            this.staffList = list;
            this.applySortAndFilter();
        } catch(e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">載入失敗</td></tr>';
        }
    }

    handleSort(key) {
        if (this.sortConfig.key === key) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.key = key;
            this.sortConfig.direction = 'asc';
        }
        this.updateHeaderIcons();
        this.applySortAndFilter();
    }

    updateHeaderIcons() {
        document.querySelectorAll('.sortable-th').forEach(th => {
            const onclickVal = th.getAttribute('onclick');
            if(!onclickVal) return;
            const keyMatch = onclickVal.match(/'([^']+)'/);
            if (!keyMatch) return;
            const key = keyMatch[1];
            
            const iconContainer = th.querySelector('i');
            if (iconContainer) iconContainer.className = 'fas fa-sort text-muted small';

            if (this.sortConfig.key === key) {
                if (iconContainer) {
                    iconContainer.className = this.sortConfig.direction === 'asc' 
                        ? 'fas fa-sort-up' 
                        : 'fas fa-sort-down';
                    iconContainer.classList.remove('text-muted');
                }
            }
        });
    }

    applySortAndFilter() {
        const keyword = document.getElementById('keyword-search').value.toLowerCase();
        
        let filtered = this.staffList;
        if (keyword) {
            filtered = this.staffList.filter(u => 
                (u.name && u.name.toLowerCase().includes(keyword)) ||
                (u.staffId && u.staffId.includes(keyword)) ||
                (u.email && u.email.toLowerCase().includes(keyword))
            );
        }

        const key = this.sortConfig.key;
        const dir = this.sortConfig.direction === 'asc' ? 1 : -1;

        filtered.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            if (key === 'unitId') {
                valA = this.unitMap[valA] || valA;
                valB = this.unitMap[valB] || valB;
            }

            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            
            if (!isNaN(numA) && !isNaN(numB) && String(numA) === String(valA)) {
                return (numA - numB) * dir;
            }
            
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        this.displayList = filtered;
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('staff-tbody');
        if(this.displayList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-5">無資料</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.displayList.map(u => `
            <tr>
                <td>${this.unitMap[u.unitId] || u.unitId}</td>
                <td>${u.staffId || '-'}</td>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank}</span></td>
                <td>${u.group || '-'}</td>
                <td>${u.email}</td>
                <td>${this.getRoleLabel(u.role)}</td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal('${u.uid}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteStaff('${u.uid}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    getRoleLabel(role) {
        if(role==='unit_manager') return '<span class="badge bg-primary">管理者</span>';
        if(role==='unit_scheduler') return '<span class="badge bg-info text-dark">排班者</span>';
        return '<span class="badge bg-secondary">一般</span>';
    }

    openModal(uid = null) {
        const modalTitle = document.getElementById('modal-title');
        document.getElementById('staff-form').reset();
        
        const editUnit = document.getElementById('edit-unit');
        editUnit.innerHTML = document.getElementById('unit-filter').innerHTML;
        if(editUnit.options[0].value === "") editUnit.remove(0);

        if(uid) {
            modalTitle.textContent = "編輯人員";
            const u = this.staffList.find(x => x.uid === uid);
            document.getElementById('edit-uid').value = uid;
            document.getElementById('edit-unit').value = u.unitId;
            document.getElementById('edit-staffId').value = u.staffId;
            document.getElementById('edit-name').value = u.name;
            document.getElementById('edit-email').value = u.email;
            document.getElementById('edit-email').disabled = true;
            document.getElementById('edit-level').value = u.rank;
            document.getElementById('edit-group').value = u.group || '';
            document.getElementById('edit-isPregnant').checked = !!u.constraints?.isPregnant;
            document.getElementById('edit-canBatch').checked = !!u.constraints?.canBatch;
            document.getElementById('edit-maxConsecutive').value = u.constraints?.maxConsecutive || 6;
            // ✅ 新增
            document.getElementById('edit-maxConsecutiveNights').value = u.constraints?.maxConsecutiveNights || 4;
            
            document.getElementById('edit-is-manager').checked = u.role === 'unit_manager';
            document.getElementById('edit-is-scheduler').checked = u.role === 'unit_scheduler';
        } else {
            modalTitle.textContent = "新增人員";
            document.getElementById('edit-uid').value = "";
            document.getElementById('edit-email').disabled = false;
        }
        this.editModal.show();
    }

    async handleSave() {
        const uid = document.getElementById('edit-uid').value;
        const isManager = document.getElementById('edit-is-manager').checked;
        const isScheduler = document.getElementById('edit-is-scheduler').checked;
        
        let newRole = 'user';
        if(isManager) newRole = 'unit_manager';
        else if(isScheduler) newRole = 'unit_scheduler';

        const data = {
            name: document.getElementById('edit-name').value,
            unitId: document.getElementById('edit-unit').value,
            staffId: document.getElementById('edit-staffId').value,
            rank: document.getElementById('edit-level').value,
            group: document.getElementById('edit-group').value,
            role: newRole,
            permissions: {
                canManageUnit: isManager,
                canEditSchedule: isScheduler || isManager,
                canViewSchedule: true
            },
            constraints: {
                isPregnant: document.getElementById('edit-isPregnant').checked,
                canBatch: document.getElementById('edit-canBatch').checked,
                maxConsecutive: parseInt(document.getElementById('edit-maxConsecutive').value) || 6,
                // ✅ 新增
                maxConsecutiveNights: parseInt(document.getElementById('edit-maxConsecutiveNights').value) || 4
            }
        };
        
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            if(uid) {
                await userService.updateUser(uid, data);
                alert("✅ 修改成功");
            } else {
                const email = document.getElementById('edit-email').value;
                const res = await userService.createStaff({ ...data, email }, "123456");
                if(res.success) alert("✅ 新增成功 (預設密碼: 123456)");
                else alert("新增失敗: " + res.error);
            }
            this.editModal.hide();
            this.loadData();
        } catch(e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '儲存';
        }
    }

    filterData(keyword) {
        this.applySortAndFilter();
    }
    
    async deleteStaff(uid) { if(confirm("確定刪除此人員？")) { await userService.deleteStaff(uid); this.loadData(); } }
}
