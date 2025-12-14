export const GroupSettingsTemplate = {
    renderLayout() {
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
            </div>
        `;
    },

    renderGroupList(groups) {
        if(groups.length === 0) return '<li class="list-group-item text-center text-muted py-3">無組別</li>';
        
        return groups.map((g, i) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${g} 
                <button class="btn btn-sm text-danger" onclick="window.routerPage.deleteGroup(${i})">
                    <i class="fas fa-times"></i>
                </button>
            </li>
        `).join('');
    },

    renderStaffRows(staffList, groups) {
        const opts = `<option value="">(未分組)</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');
        
        return staffList.map(u => `
            <tr>
                <td class="text-muted small">${u.staffId || '-'}</td>
                <td class="fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank}</span></td>
                <td>
                    <select class="form-select form-select-sm group-select" data-uid="${u.uid}" style="width:120px; margin:0 auto;">
                        ${opts.replace(`value="${u.group}"`, `value="${u.group}" selected`)}
                    </select>
                </td>
            </tr>
        `).join('');
    },

    renderModal() {
        return `
            <div class="modal fade" id="group-modal" tabindex="-1">
                <div class="modal-dialog modal-sm">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title fw-bold">新增組別</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body"><label class="form-label fw-bold">組別名稱</label><input type="text" id="new-group-name" class="form-control" placeholder="例如: A組"></div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save-group" class="btn btn-primary w-auto">新增</button></div>
                    </div>
                </div>
            </div>
        `;
    }
};
