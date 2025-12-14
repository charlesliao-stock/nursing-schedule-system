export const SwapApplyTemplate = {
    // 1. 主畫面佈局
    renderLayout(year, month) {
        return `
            <div class="container-fluid mt-4">
                <h2 class="mb-4"><i class="fas fa-exchange-alt"></i> 申請換班</h2>
                <div class="alert alert-info"><i class="fas fa-info-circle"></i> 請在下方班表中，<strong>點選您想要換班的日期</strong>。</div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex justify-content-between align-items-center">
                        <h6 class="m-0 font-weight-bold text-primary">本月班表 (${year}-${month})</h6>
                        <input type="month" id="swap-month" class="form-control form-control-sm w-auto" value="${year}-${String(month).padStart(2,'0')}">
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive" id="schedule-container">
                            <div class="p-5 text-center">載入中...</div>
                        </div>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-success">我的申請紀錄</h6></div>
                    <div class="card-body p-0">
                        <table class="table table-hover mb-0">
                            <thead class="table-light"><tr><th>日期</th><th>對象</th><th>內容</th><th>狀態</th></tr></thead>
                            <tbody id="history-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 班表渲染 (含點擊邏輯)
    renderScheduleTable(schedule, staffList, currentUserId, year, month) {
        if (!schedule) return '<div class="p-5 text-center text-muted">本月尚無班表</div>';

        const days = new Date(year, month, 0).getDate();
        let html = '<table class="table table-bordered text-center mb-0"><thead><tr><th>人員</th>';
        for(let d=1; d<=days; d++) html += `<th>${d}</th>`;
        html += '</tr></thead><tbody>';

        staffList.forEach(s => {
            html += `<tr><td class="fw-bold">${s.name}</td>`;
            for(let d=1; d<=days; d++) {
                const shift = schedule.assignments?.[s.uid]?.[d] || '';
                const isMe = s.uid === currentUserId;
                const style = isMe ? 'cursor:pointer; background-color:#e0f2fe;' : '';
                const click = isMe ? `onclick="window.routerPage.openSwapModal(${d}, '${shift}')"` : '';
                
                // M_OFF 顯示為 OFF
                const displayShift = shift === 'M_OFF' ? 'OFF' : shift;
                
                html += `<td style="${style}" ${click}>${displayShift}</td>`;
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    },

    // 3. 歷史紀錄行
    renderHistoryRows(requests) {
        if (requests.length === 0) return '<tr><td colspan="4" class="text-center text-muted p-3">無申請紀錄</td></tr>';
        
        const getStatusBadge = (status) => {
            const map = {
                'pending': '<span class="badge bg-secondary">待審核</span>',
                'pending_target': '<span class="badge bg-warning text-dark">待同事同意</span>',
                'pending_manager': '<span class="badge bg-info text-dark">待主管核准</span>',
                'approved': '<span class="badge bg-success">已通過</span>',
                'rejected': '<span class="badge bg-danger">已拒絕</span>'
            };
            return map[status] || status;
        };

        return requests.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} &rarr; ${req.targetShift}</td>
                <td>${getStatusBadge(req.status)}</td>
            </tr>`).join('');
    },

    // 4. Modal HTML
    renderModal() {
        return `
            <div class="modal fade" id="swap-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">提出換班申請</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">
                            <form id="swap-form">
                                <div class="mb-3"><label>日期</label><input type="text" id="modal-date" class="form-control" disabled></div>
                                <div class="mb-3"><label>我的班別</label><input type="text" id="modal-my-shift" class="form-control" disabled></div>
                                <div class="mb-3"><label>換班對象</label><select id="modal-target" class="form-select"></select></div>
                                <div class="mb-3"><label>對方的班別</label><input type="text" id="modal-target-shift" class="form-control" disabled></div>
                                <div class="mb-3"><label>原因</label><textarea id="modal-reason" class="form-control" rows="2"></textarea></div>
                            </form>
                        </div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-submit-swap" class="btn btn-primary">送出申請</button></div>
                    </div>
                </div>
            </div>
        `;
    }
};
