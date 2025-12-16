export const SwapReviewTemplate = {
    renderLayout(isManager) {
        const managerStyle = isManager ? '' : 'display:none;';
        
        return `
            <div class="container-fluid mt-4">
                <div class="mb-4">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-check-double text-primary"></i> 換班審核中心</h3>
                    <p class="text-muted small">在此審核同事提出的換班申請，或進行單位的最終核決。</p>
                </div>

                <div class="card shadow mb-4 border-left-info">
                    <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-info"><i class="fas fa-user-check"></i> 待我同意 (同事申請)</h6>
                        <span class="badge bg-danger rounded-pill" id="badge-target-count" style="display:none;"></span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>申請日期</th>
                                        <th>申請人</th>
                                        <th>換班日期</th>
                                        <th>變更內容</th>
                                        <th>理由</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="target-review-tbody">
                                    <tr><td colspan="6" class="text-center py-4 text-muted">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card shadow border-left-primary" id="manager-section" style="${managerStyle}">
                    <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-primary"><i class="fas fa-tasks"></i> 待單位核准 (雙方已合意)</h6>
                        <span class="badge bg-danger rounded-pill" id="badge-manager-count" style="display:none;"></span>
                    </div>
                    <div class="card-body p-0">
                        <div class="alert alert-warning small m-3 mb-0">
                            <i class="fas fa-exclamation-triangle"></i> <strong>注意：</strong> 核准後，系統將直接修改當月的排班表內容。
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>申請人</th>
                                        <th>被換班者</th>
                                        <th>日期</th>
                                        <th>變更內容</th>
                                        <th>理由</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="manager-review-tbody">
                                    <tr><td colspan="6" class="text-center py-4 text-muted">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 渲染待我同意列表
    renderTargetRows(list) {
        if(list.length === 0) return '<tr><td colspan="6" class="text-center text-muted py-4">目前沒有待審核的換班申請</td></tr>';

        return list.map(req => `
            <tr>
                <td class="small text-muted">${req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : '剛剛'}</td>
                <td class="fw-bold text-primary">${req.requesterName}</td>
                <td class="fw-bold">${req.requesterDate}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="me-2 text-muted small">我:</span> <span class="badge bg-secondary me-2">${req.targetShift}</span>
                        <i class="fas fa-exchange-alt text-muted mx-2"></i>
                        <span class="me-2 text-muted small">他:</span> <span class="badge bg-primary">${req.requesterShift}</span>
                    </div>
                </td>
                <td class="small text-muted">${req.reason || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-success me-1" onclick="window.routerPage.handleTargetReview('${req.id}', 'agree')">
                        <i class="fas fa-check"></i> 同意
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.handleTargetReview('${req.id}', 'deny')">
                        <i class="fas fa-times"></i> 拒絕
                    </button>
                </td>
            </tr>
        `).join('');
    },

    // 渲染待管理者核准列表
    renderManagerRows(list) {
        if(list.length === 0) return '<tr><td colspan="6" class="text-center text-muted py-4">目前沒有待核准的項目</td></tr>';

        return list.map(req => `
            <tr>
                <td class="fw-bold text-primary">${req.requesterName}</td>
                <td class="fw-bold text-success">${req.targetUserName}</td>
                <td>${req.requesterDate}</td>
                <td>
                    <div class="small">
                        ${req.requesterName}: <span class="badge bg-secondary">${req.requesterShift}</span> &rarr; <span class="badge bg-success">${req.targetShift}</span>
                    </div>
                    <div class="small mt-1">
                        ${req.targetUserName}: <span class="badge bg-secondary">${req.targetShift}</span> &rarr; <span class="badge bg-success">${req.requesterShift}</span>
                    </div>
                </td>
                <td class="small text-muted">${req.reason || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.handleManagerReview('${req.id}', 'approve')">
                        <i class="fas fa-check-circle"></i> 核准
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleManagerReview('${req.id}', 'reject')">
                        <i class="fas fa-ban"></i> 駁回
                    </button>
                </td>
            </tr>
        `).join('');
    }
};
