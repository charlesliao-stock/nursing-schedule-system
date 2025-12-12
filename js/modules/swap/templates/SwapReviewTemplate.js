export const SwapReviewTemplate = {
    // 1. 主畫面佈局
    renderLayout(isManager) {
        // 管理者區塊樣式
        const managerSectionStyle = isManager ? 'display:block;' : 'display:none;';

        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-check-double"></i> 換班審核中心</h3></div>

                <div class="card shadow mb-4 border-left-info">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-info"><i class="fas fa-user-check"></i> 待我同意的換班 (同事申請)</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>日期</th><th>申請人</th><th>原班 &rarr; 我的班</th><th>原因</th><th>操作</th></tr></thead>
                                <tbody id="target-review-tbody"><tr><td colspan="5" class="text-center py-3">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card shadow border-left-primary" id="manager-section" style="${managerSectionStyle}">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-primary"><i class="fas fa-tasks"></i> 待單位核准的換班 (雙方已合意)</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>日期</th><th>申請人</th><th>對象</th><th>內容</th><th>原因</th><th>操作</th></tr></thead>
                                <tbody id="manager-review-tbody"><tr><td colspan="6" class="text-center py-3">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 渲染 "待我同意" 列表
    renderTargetRows(list) {
        if(list.length === 0) return '<tr><td colspan="5" class="text-center text-muted py-3">無待審核項目</td></tr>';

        return list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.requestorName}</td>
                <td><span class="badge bg-secondary">${req.requestorShift}</span> &rarr; <span class="badge bg-primary">${req.targetShift}</span></td>
                <td>${req.reason}</td>
                <td>
                    <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.handleTargetReview('${req.id}', 'agree')">同意</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleTargetReview('${req.id}', 'reject')">拒絕</button>
                </td>
            </tr>
        `).join('');
    },

    // 3. 渲染 "待主管核准" 列表
    renderManagerRows(list) {
        if(list.length === 0) return '<tr><td colspan="6" class="text-center text-muted py-3">無待核准項目</td></tr>';

        return list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.requestorName}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} <i class="fas fa-exchange-alt text-muted"></i> ${req.targetShift}</td>
                <td>${req.reason}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-1" onclick="window.routerPage.handleManagerReview('${req.id}', 'approve')">核准</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleManagerReview('${req.id}', 'reject')">駁回</button>
                </td>
            </tr>
        `).join('');
    }
};
