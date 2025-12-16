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

                <div id="admin-impersonate-section" class="card mb-3 bg-light" style="display:none; border: 1px solid #dee2e6;">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        
                        <div class="d-flex align-items-center text-danger fw-bold me-2">
                            <i class="fas fa-user-secret fa-lg me-2"></i>
                            管理員模式：
                        </div>

                        <select id="admin-unit-select" class="form-select form-select-sm w-auto" style="min-width: 150px;">
                            <option value="">載入中...</option>
                        </select>

                        <select id="admin-user-select" class="form-select form-select-sm w-auto" style="min-width: 150px;" disabled>
                            <option value="">-- 請先選擇單位 --</option>
                        </select>

                        <button id="btn-impersonate" class="btn btn-danger btn-sm fw-bold px-3" disabled>
                            切換身分
                        </button>

                        <span id="impersonation-status" class="ms-3 text-primary fw-bold align-items-center" style="display:none;">
                            <i class="fas fa-eye me-1"></i> 正在模擬：<span id="current-impersonating-name"></span>
                            <button id="btn-exit-impersonate" class="btn btn-sm btn-outline-secondary ms-2 py-0" style="font-size: 0.8rem;">
                                恢復
                            </button>
                        </span>
                    </div>
                </div>

                <div id="step-select-schedule" class="card shadow mb-3">
                    <div class="card-body d-flex align-items-center gap-3 bg-white">
                        <label class="fw-bold text-nowrap">選擇已發布班表：</label>
                        <select id="schedule-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-load-grid" class="btn btn-primary text-nowrap">
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
                                        操作：1.點選<span class="badge bg-primary">您的班</span> 2.點選該日<span class="badge bg-success">對方的班</span>
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
                                    
                                    <div class="flex-grow-1 mb-3 overflow-auto border rounded bg-light p-2" style="max-height: 300px;">
                                        <ul class="list-group list-group-flush bg-transparent" id="swap-list-container">
                                            <li class="list-group-item text-center text-muted py-4 bg-transparent border-0">
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

                                    <button id="btn-submit-swap" class="btn btn-success w-100 shadow-sm" disabled>
                                        <i class="fas fa-paper-plane me-1"></i> 提交申請
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card shadow mt-4">
                    <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-secondary">我的申請紀錄</h6></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0 align-middle">
                                <thead class="table-light"><tr><th>日期</th><th>對象</th><th>內容</th><th>理由</th><th>狀態</th></tr></thead>
                                <tbody id="history-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ... (renderMatrix, renderSwapListItems, renderHistoryRows 保持原樣，與上一版相同) ...
    renderMatrix(schedule, staffList, currentUser, year, month) {
        const daysInMonth = new Date(year, month, 0).getDate();
        const assignments = schedule.assignments || {};
        const todayStr = new Date().toISOString().split('T')[0];

        let html = `<table class="table table-bordered table-sm text-center align-middle mb-0" style="font-size: 0.9rem;">`;
        html += `<thead class="table-light sticky-top"><tr><th style="min-width:80px; position:sticky; left:0; z-index:10; background:#f8f9fa;">人員</th>`;
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dateObj = new Date(dateStr);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const color = isWeekend ? 'text-danger' : '';
            html += `<th style="min-width:35px;" class="${color}">${d}</th>`;
        }
        html += `</tr></thead><tbody>`;

        staffList.forEach(s => {
            const isMe = s.uid === currentUser.uid;
            const rowClass = isMe ? 'table-info' : '';
            const stickyStyle = isMe ? 'background-color:#cff4fc;' : 'background-color:#fff;';
            
            html += `<tr class="${rowClass}">`;
            html += `<td class="fw-bold text-start ps-2" style="position:sticky; left:0; z-index:5; ${stickyStyle} border-right:2px solid #dee2e6;">
                        ${s.name}${isMe ? '<span class="badge bg-primary ms-1" style="font-size:0.7rem">我</span>' : ''}
                     </td>`;
            
            const userShifts = assignments[s.uid] || {};
            for(let d=1; d<=daysInMonth; d++) {
                const shift = userShifts[d] || '';
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                
                const isPast = dateStr < todayStr;
                const isEmpty = !shift; 
                const clickable = !isPast && !isEmpty;
                const cursor = clickable ? 'pointer' : 'not-allowed';
                const opacity = clickable ? '1' : '0.5';
                const bg = isPast ? '#f8f9fa' : '';

                html += `<td style="cursor:${cursor}; opacity:${opacity}; background-color:${bg}" 
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

    renderSwapListItems(items) {
        if (items.length === 0) {
            return `<li class="list-group-item text-center text-muted py-4 bg-transparent border-0">
                        <i class="fas fa-shopping-basket fa-2x mb-2 text-muted opacity-50"></i><br>
                        尚未選擇任何換班<br>請在左側點選日期加入
                    </li>`;
        }
        return items.map((item, idx) => `
            <li class="list-group-item position-relative bg-white mb-2 border rounded shadow-sm">
                <button class="btn btn-sm btn-outline-danger border-0 position-absolute top-0 end-0 m-1" 
                        onclick="window.routerPage.removeSwapFromList(${idx})" title="刪除此筆">
                    <i class="fas fa-times"></i>
                </button>
                <div class="fw-bold mb-1 border-bottom pb-1 text-secondary">
                    <i class="far fa-calendar-alt me-1"></i> ${item.dateStr}
                </div>
                <div class="d-flex justify-content-between align-items-center small mt-2">
                    <div class="text-center">
                        <div class="text-primary fw-bold">我</div>
                        <span class="badge bg-primary fs-6">${item.shift}</span>
                    </div>
                    <i class="fas fa-exchange-alt text-muted"></i>
                    <div class="text-center">
                        <div class="text-success fw-bold">${item.target.name}</div>
                        <span class="badge bg-success fs-6">${item.target.shift}</span>
                    </div>
                </div>
            </li>
        `).join('');
    },

    renderHistoryRows(requests) {
        if (!requests || requests.length === 0) return '<tr><td colspan="5" class="text-center text-muted p-4">無申請紀錄</td></tr>';
        
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
                <td class="fw-bold text-dark">${req.targetUserName}</td>
                <td>
                    <span class="badge bg-primary">${req.requesterShift}</span> 
                    <i class="fas fa-arrow-right text-muted mx-1"></i> 
                    <span class="badge bg-success">${req.targetShift}</span>
                </td>
                <td class="text-muted small">${req.reason || '-'}</td>
                <td>${getStatusBadge(req.status)}</td>
            </tr>`).join('');
    }
};
