export const StaffListTemplate = {
    // 1. 主畫面佈局
    renderLayout(unitOptionsHtml, isAdmin, isOneUnit) {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-users"></i> 人員管理</h3>
                    <p class="text-muted small mb-0">管理單位內護理人員的資料、職級與系統權限。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-filter" class="form-select w-auto" ${isOneUnit ? 'disabled' : ''}>
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
                                        ${this.renderSortHeader('單位', 'unitId')}
                                        ${this.renderSortHeader('編號', 'staffId')}
                                        ${this.renderSortHeader('姓名', 'name')}
                                        ${this.renderSortHeader('職級', 'rank')}
                                        <th>組別</th>
                                        <th>Email</th>
                                        <th>角色</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-tbody">
                                    <tr><td colspan="8" class="text-center py-5 text-muted">準備載入...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderSortHeader(label, key) {
        return `<th class="sortable-th" style="cursor:pointer; user-select:none;" onclick="window.routerPage.handleSort('${key}')">${label} <i class="fas fa-sort text-muted opacity-25"></i></th>`;
    },

    // 2. 表格行渲染
    renderRows(displayList, unitMap) {
        if (displayList.length === 0) {
            return '<tr><td colspan="8" class="text-center text-muted py-5">無資料</td></tr>';
        }

        const getRoleLabel = (role) => {
            if(role==='unit_manager') return '<span class="badge bg-primary">管理者</span>';
            if(role==='unit_scheduler') return '<span class="badge bg-info text-dark">排班者</span>';
            return '<span class="badge bg-secondary">一般</span>';
        };

        return displayList.map(u => `
            <tr>
                <td>${unitMap[u.unitId] || u.unitId}</td>
                <td>${u.staffId || '-'}</td>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank}</span></td>
                <td>${u.group || '-'}</td>
                <td>${u.email}</td>
                <td>${getRoleLabel(u.role)}</td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal('${u.uid}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteStaff('${u.uid}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // 3. Modal 結構 (靜態 HTML，資料由 JS 回填)
    renderModalHtml(isAdmin) {
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
                                        <select id="edit-group" class="form-select">
                                            <option value="">(載入中...)</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold">到職日期</label>
                                    <input type="date" id="edit-hireDate" class="form-control">
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
};
