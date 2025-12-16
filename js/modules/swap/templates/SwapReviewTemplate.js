export const SwapReviewTemplate = {
    // 1. 主畫面佈局
    renderLayout(isManager) {
        // 管理者區塊的顯示控制
        const managerStyle = isManager ? 'display:block;' : 'display:none;';

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h3 class="text-gray-800 fw-bold"><i class="fas fa-check-double text-primary"></i> 換班審核中心</h3>
                        <p class="text-muted small mb-0">在此審核同事提出的換班申請，或進行單位的最終核決。</p>
                    </div>
                </div>

                <div class="card shadow mb-4 border-left-info">
                    <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-info">
                            <i class="fas fa-user-check me-1"></i> 待我同意 (同事申請)
                        </h6>
                        <span class="badge bg-danger rounded-pill" id="badge-target-count" style="display:none;">0</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 15%">申請時間</th>
                                        <th style="width: 15%">申請人</th>
                                        <th style="width: 15%">換班日期</th>
                                        <th style="width: 25%">變更內容 (我 &harr; 他)</th>
                                        <th style="width: 15%">理由</th>
                                        <th style="width: 15%" class="text-center">操作</th>
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
                        <h6 class="m-0 fw-bold text-primary">
                            <i class="fas fa-tasks me-1"></i> 待單位核准 (雙方已合意)
                        </h6>
                        <span class="badge bg-danger rounded-pill" id="badge-manager-count" style="display:none;">0</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="alert alert-warning small m-3 mb-0 border-0 bg-warning-subtle text-warning-emphasis">
                            <i class="fas fa-exclamation-triangle me-1"></i> 
                            <strong>注意：</strong> 核准後，系統將直接修改並覆蓋當月的排班表內容。
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 15%">申請人</th>
                                        <th style="width: 15%">被換班者</th>
                                        <th style="width: 15%">日期</th>
                                        <th style="width: 25%">變更內容</th>
                                        <th style="width: 15%">理由</th>
                                        <th style="width: 15%" class="text-center">操作</th>
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

    // 2. 渲染 "待我同意" 列表 (Target View)
    renderTargetRows(list) {
        if (!list || list.length === 0) {
            return `<tr><td colspan="6" class="text-center text-muted py-5 bg-light">目前沒有待審核的換班申請</td></tr>`;
        }

        return list.map(req => {
            // 格式化時間 (如果有的話)
            const dateStr = req.createdAt?.seconds 
                ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() 
                : '剛剛';

            return `
            <tr>
                <td class="small text-muted">${dateStr}</td>
                <td class="fw-bold text-primary">${req.requesterName}</td>
                <td class="fw-bold text-dark">${req.requesterDate}</td>
                <td>
                    <div class="d-flex align-items-center bg-light rounded p-1 border">
                        <div class="me-2 text-nowrap">
                            <span class="text-muted small">我:</span> 
                            <span class="badge bg-secondary">${req.targetShift}</span>
                        </div>
                        <i class="fas fa-exchange-alt text-muted mx-2"></i>
                        <div class="text-nowrap">
                            <span class="text-muted small">他:</span> 
                            <span class="badge bg-primary">${req.requesterShift}</span>
                        </div>
                    </div>
                </td>
                <td class="small text-muted text-truncate" style="max-width: 150px;" title="${req.reason}">
                    ${req.reason || '-'}
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-success me-1" 
                            onclick="window.routerPage.handleTargetReview('${req.id}', 'agree')"
                            title="同意換班">
                        <i class="fas fa-check"></i> 同意
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="window.routerPage.handleTargetReview('${req.id}', 'deny')"
                            title="拒絕申請">
                        <i class="fas fa-times"></i> 拒絕
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    },

    // 3. 渲染 "待管理者核准" 列表 (Manager View)
    renderManagerRows(list) {
        if (!list || list.length === 0) {
            return `<tr><td colspan="6" class="text-center text-muted py-5 bg-light">目前沒有待核准的項目</td></tr>`;
        }

        return list.map(req => `
            <tr>
                <td class="fw-bold text-primary">${req.requesterName}</td>
                <td class="fw-bold text-success">${req.targetUserName}</td>
                <td class="fw-bold">${req.requesterDate}</td>
                <td>
                    <div class="d-flex flex-column small">
                        <div class="mb-1">
                            <i class="fas fa-user text-primary me-1"></i> ${req.requesterName}: 
                            <span class="badge bg-secondary">${req.requesterShift}</span> &rarr; <span class="badge bg-success">${req.targetShift}</span>
                        </div>
                        <div>
                            <i class="fas fa-user text-success me-1"></i> ${req.targetUserName}: 
                            <span class="badge bg-secondary">${req.targetShift}</span> &rarr; <span class="badge bg-success">${req.requesterShift}</span>
                        </div>
                    </div>
                </td>
                <td class="small text-muted text-truncate" style="max-width: 150px;" title="${req.reason}">
                    ${req.reason || '-'}
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-success me-1" 
                            onclick="window.routerPage.handleManagerReview('${req.id}', 'approve')"
                            title="核准並寫入班表">
                        <i class="fas fa-check-circle"></i> 核准
                    </button>
                    <button class="btn btn-sm btn-danger" 
                            onclick="window.routerPage.handleManagerReview('${req.id}', 'reject')"
                            title="駁回申請">
                        <i class="fas fa-ban"></i> 駁回
                    </button>
                </td>
            </tr>
        `).join('');
    }
};
