export const UnitListTemplate = {
    renderLayout() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-hospital"></i> 單位管理</h3></div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex justify-content-end">
                        <div class="me-auto">
                            <input type="text" id="unit-search" class="form-control form-control-sm" placeholder="搜尋單位...">
                        </div>
                        <button id="btn-add-unit" class="btn btn-primary w-auto text-nowrap"><i class="fas fa-plus"></i> 新增單位</button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        ${this.renderSortHeader('代碼', 'unitCode')}
                                        ${this.renderSortHeader('名稱', 'unitName')}
                                        <th>管理者</th>
                                        <th>排班者</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody"><tr><td colspan="5" class="text-center py-5">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderSortHeader(label, key) {
        return `<th style="cursor:pointer;" onclick="window.routerPage.handleSort('${key}')">${label} <i class="fas fa-sort text-muted"></i></th>`;
    },

    renderRows(displayList) {
        if (displayList.length === 0) return '<tr><td colspan="5" class="text-center py-5 text-muted">無資料</td></tr>';
        
        return displayList.map(u => `
            <tr>
                <td class="fw-bold">${u.unitCode}</td>
                <td>${u.unitName}</td>
                <td><span class="badge bg-primary rounded-pill">${(u.managers||[]).length} 人</span></td>
                <td><span class="badge bg-info rounded-pill text-dark">${(u.schedulers||[]).length} 人</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.routerPage.openModal('${u.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteUnit('${u.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Modal Template
    renderModalHtml() {
        return `
            <div class="modal fade" id="unit-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title fw-bold" id="modal-title">單位資訊</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="unit-form">
                                <input type="hidden" id="edit-id">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label fw-bold">單位代碼</label>
                                        <input type="text" id="unit-code" class="form-control" required>
                                    </div>
                                    <div class="col-md-8">
                                        <label class="form-label fw-bold">單位名稱</label>
                                        <input type="text" id="unit-name" class="form-control" required>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold">描述</label>
                                    <textarea id="unit-desc" class="form-control" rows="2"></textarea>
                                </div>

                                <div id="staff-selection-area" style="display:none;">
                                    <hr>
                                    <h6 class="fw-bold text-primary mb-3">權限人員指派</h6>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">單位管理者 (可多選)</label>
                                            <div class="border rounded p-2" style="max-height: 200px; overflow-y: auto;" id="list-managers">
                                                <div class="text-muted small">請先建立單位</div>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">排班人員 (可多選)</label>
                                            <div class="border rounded p-2" style="max-height: 200px; overflow-y: auto;" id="list-schedulers">
                                                <div class="text-muted small">請先建立單位</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" id="btn-save" class="btn btn-primary">儲存</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};
