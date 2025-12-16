export const SwapReviewTemplate = {
    renderLayout(isManager) {
        const managerStyle = isManager ? 'display:block;' : 'display:none;';

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-check-double text-primary"></i> 換班審核中心</h3>
                    <button id="btn-refresh" class="btn btn-outline-secondary btn-sm"><i class="fas fa-sync-alt"></i> 刷新</button>
                </div>

                <div id="admin-impersonate-section" class="card mb-4 border-left-danger bg-light" style="display:none;">
                    <div class="card-body py-2 d-flex align-items-center gap-2 flex-wrap">
                        <strong class="text-danger"><i class="fas fa-user-secret"></i> 管理員檢視模式：</strong>
                        <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">單位</option></select>
                        <select id="admin-user-select" class="form-select form-select-sm w-auto" disabled><option value="">人員</option></select>
                        <button id="btn-impersonate" class="btn btn-sm btn-danger" disabled>切換視角</button>
                        
                        <span id="impersonation-status" class="ms-3 fw-bold text-dark" style="display:none;">
                            <i class="fas fa-eye text-primary"></i> 正在檢視：<span id="current-impersonating-name" class="text-primary"></span>
                            <button id="btn-exit-impersonate" class="btn btn-sm btn-link text-muted py-0">退出</button>
                        </span>
                    </div>
                </div>

                <div class="card shadow mb-4 border-left-info">
                    <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-info"><i class="fas fa-user-check me-1"></i> 待我同意 (同事申請)</h6>
                        <span class="badge bg-danger rounded-pill" id="badge-target-count" style="display:none;">0</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>申請人</th><th>日期</th><th>變更 (我 &harr; 他)</th><th>理由</th><th>操作</th></tr></thead>
                                <tbody id="target-review-tbody"><tr><td colspan="5" class="text-center py-4">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card shadow border-left-primary" id="manager-section" style="${managerStyle}">
                    <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-primary"><i class="fas fa-tasks me-1"></i> 待單位核准 (雙方已合意)</h6>
                        <span class="badge bg-danger rounded-pill" id="badge-manager-count" style="display:none;">0</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="alert alert-warning small m-3 mb-0"><strong>注意：</strong> 核准後將直接修改班表。</div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>申請人</th><th>被換班者</th><th>日期</th><th>變更內容</th><th>操作</th></tr></thead>
                                <tbody id="manager-review-tbody"><tr><td colspan="5" class="text-center py-4">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderTargetRows(list) {
        if (!list || list.length === 0) return `<tr><td colspan="5" class="text-center text-muted py-4">無待審核項目</td></tr>`;
        return list.map(r => `
            <tr>
                <td class="fw-bold text-primary">${r.requesterName}</td>
                <td>${r.requesterDate}</td>
                <td><span class="badge bg-secondary">${r.targetShift}</span> &harr; <span class="badge bg-primary">${r.requesterShift}</span></td>
                <td class="small text-muted">${r.reason||'-'}</td>
                <td>
                    <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.handleTargetReview('${r.id}','agree')">同意</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleTargetReview('${r.id}','deny')">拒絕</button>
                </td>
            </tr>
        `).join('');
    },

    renderManagerRows(list) {
        if (!list || list.length === 0) return `<tr><td colspan="5" class="text-center text-muted py-4">無待核准項目</td></tr>`;
        return list.map(r => `
            <tr>
                <td class="fw-bold">${r.requesterName}</td>
                <td class="fw-bold text-success">${r.targetUserName}</td>
                <td>${r.requesterDate}</td>
                <td>${r.requesterShift} &rarr; ${r.targetShift}</td>
                <td>
                    <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.handleManagerReview('${r.id}','approve')">核准</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleManagerReview('${r.id}','reject')">駁回</button>
                </td>
            </tr>
        `).join('');
    }
};
