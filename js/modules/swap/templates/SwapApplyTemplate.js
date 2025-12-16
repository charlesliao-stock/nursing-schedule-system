export const SwapApplyTemplate = {
    // 1. 主畫面佈局
    renderLayout() {
        // 理由選項
        const reasons = ['單位人力調整', '公假', '病假', '喪假', '支援', '個人因素', '其他'];
        const reasonOptions = reasons.map(r => `<option value="${r}">${r}</option>`).join('');

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3><i class="fas fa-exchange-alt text-primary me-2"></i>申請換班 (多筆)</h3>
                </div>

                <div id="step-select-schedule" class="card shadow mb-3">
                    <div class="card-body d-flex align-items-center gap-3">
                        <label class="fw-bold">選擇已發布班表：</label>
                        <select id="schedule-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-load-grid" class="btn btn-primary">
                            <i class="fas fa-table me-1"></i> 載入班表
                        </button>
                    </div>
                </div>

                <div id="swap-workspace" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-3">
                                <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                    <div class="small text-muted">
                                        <i class="fas fa-info-circle me-1"></i>
                                        操作：1.點選<span class="badge bg-primary">您的班</span> 2.點選該日<span class="badge bg-success">對方的班</span> (限同日互換)
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div id="schedule-grid-container" class="table-responsive" style="max-height: 70vh;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow border-left-primary h-100">
                                <div class="card-header bg-primary text-white fw-bold d-flex justify-content-between">
                                    <span>換班申請單</span>
                                    <span class="badge bg-white text-primary" id="swap-count-badge">0 筆</span>
                                </div>
                                <div class="card-body d-flex flex-column">
                                    
                                    <div class="flex-grow-1 mb-3 overflow-auto" style="max-height: 300px;">
                                        <ul class="list-group" id="swap-list-container">
                                            <li class="list-group-item text-center text-muted py-4">
                                                尚未選擇任何換班<br>請在左側點選日期加入
                                            </li>
                                        </ul>
                                    </div>

                                    <hr>

                                    <div class="mb-3">
                                        <label class="form-label small fw-bold">換班理由 (必填)</label>
                                        <select id="swap-reason-select" class="form-select form-select-sm mb-2">
                                            ${reasonOptions}
                                        </select>
                                        <input type="text" id="swap-reason-text" class="form-control form-control-sm" placeholder="請輸入其他理由..." style="display:none;">
                                    </div>

                                    <button id="btn-submit-swap" class="btn btn-success w-100" disabled>
                                        <i class="fas fa-paper-plane me-1"></i> 提交申請
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card shadow mt-4">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-secondary">我的申請紀錄</h6></div>
                    <div class="card-body p-0">
                        <table class="table table-hover mb-0">
                            <thead class="table-light"><tr><th>日期</th><th>對象</th><th>內容</th><th>理由</th><th>狀態</th></tr></thead>
                            <tbody id="history-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 班表矩陣渲染
    renderMatrix(schedule, staffList, currentUser, year, month) {
        const daysInMonth = new Date(year, month, 0).getDate();
        const assignments = schedule.assignments || {};
        const todayStr = new Date().toISOString().split('T')[0];

        let html = `<table class="table table-bordered table-sm text-center align-middle mb-0" style="font-size: 0.9rem;">`;
        html += `<thead class="table-light sticky-top"><tr><th style="min-width:80px">人員</th>`;
        for(let d=1; d<=daysInMonth; d++) html += `<th style="min-width:35px;">${d}</th>`;
        html += `</tr></thead><tbody>`;

        staffList.forEach(s => {
            const isMe = s.uid === currentUser.uid;
            html += `<tr class="${isMe ? 'table-info' : ''}">`;
            html += `<td class="fw-bold text-start ps-2">${s.name}${isMe ? '<span class="badge bg-primary ms-1">我</span>' : ''}</td>`;
            
            const userShifts = assignments[s.uid] || {};
            for(let d=1; d<=daysInMonth; d++) {
                const shift = userShifts[d] || '';
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                
                // 過去日期或空班不可點
                const isPast = dateStr < todayStr;
                const isEmpty = !shift; 
                const clickable = !isPast && !isEmpty;
                const cursor = clickable ? 'pointer' : 'not-allowed';
                const opacity = clickable ? '1' : '0.5';

                html += `<td style="cursor:${cursor}; opacity:${opacity}" 
                            class="swap-cell" id="cell-${d}-${s.uid}"
                            data-uid="${s.uid}" data-day="${d}" data-shift="${shift}" data-name="${s.name}" data-date="${dateStr}"
                            onclick="window.routerPage.handleCellClick(this, ${clickable})">
                            ${shift}
                        </td>`;
            }
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        return html;
    },

    // 3. 渲染換班清單 (購物車項目)
    renderSwapListItems(items) {
        if (items.length === 0) {
            return `<li class="list-group-item text-center text-muted py-4">尚未選擇任何換班<br>請在左側點選日期加入</li>`;
        }
        return items.map(item => `
            <li class="list-group-item position-relative">
                <button class="btn btn-sm btn-outline-danger border-0 position-absolute top-0 end-0 m-1" 
                        onclick="window.routerPage.removeSwapFromList(${item.day})">
                    <i class="fas fa-times"></i>
                </button>
                <div class="fw-bold mb-1">${item.dateStr}</div>
                <div class="d-flex justify-content-between align-items-center small">
                    <div class="text-center">
                        <div class="text-primary">我</div>
                        <span class="badge bg-primary">${item.shift}</span>
                    </div>
                    <i class="fas fa-exchange-alt text-muted"></i>
                    <div class="text-center">
                        <div class="text-success">${item.target.name}</div>
                        <span class="badge bg-success">${item.target.shift}</span>
                    </div>
                </div>
            </li>
        `).join('');
    },

    // 4. 渲染歷史紀錄
    renderHistoryRows(requests) {
        if (requests.length === 0) return '<tr><td colspan="5" class="text-center text-muted p-3">無申請紀錄</td></tr>';
        
        const getStatusBadge = (status) => {
            const map = {
                'pending_target': '<span class="badge bg-warning text-dark">待同事同意</span>',
                'pending_manager': '<span class="badge bg-info text-dark">待主管核准</span>',
                'approved': '<span class="badge bg-success">已通過</span>',
                'rejected': '<span class="badge bg-danger">已拒絕</span>'
            };
            return map[status] || status;
        };

        return requests.map(req => `
            <tr>
                <td>${req.requesterDate}</td>
                <td>${req.targetUserName}</td>
                <td><span class="badge bg-primary">${req.requesterShift}</span> &rarr; <span class="badge bg-success">${req.targetShift}</span></td>
                <td>${req.reason || '-'}</td>
                <td>${getStatusBadge(req.status)}</td>
            </tr>`).join('');
    }
};
