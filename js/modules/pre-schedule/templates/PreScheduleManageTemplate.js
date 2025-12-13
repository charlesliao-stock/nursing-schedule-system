export const PreScheduleManageTemplate = {
    // 版本號 - 用於快取控制
    version: '2.1.0',
    
    // 1. 主框架
    renderLayout(year, month) {
        console.log(`🎨 [Debug] Template renderLayout (v${this.version}) 被呼叫`);

        return `
        <div class="page-wrapper" data-template-version="${this.version}">
            <div class="container-fluid p-4">
                <!-- 頂部標題列 -->
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center flex-wrap">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-calendar-check text-primary me-2"></i>預排管理與審核
                        </h2>
                        
                        <!-- 單位選擇器 (僅管理員可見) -->
                        <div id="unit-selector-container" class="ms-3" style="display:none;">
                            <select id="unit-selector" class="form-select fw-bold border-primary text-primary shadow-sm" 
                                    style="min-width: 200px;"
                                    onchange="window.routerPage.handleUnitChange(this.value)">
                                <option value="" disabled selected>切換單位...</option>
                            </select>
                        </div>

                        <span class="badge bg-white text-dark border ms-3 fs-6 shadow-sm">
                            ${year}年 ${month}月
                        </span>
                        
                        <small class="text-muted ms-2" style="font-size: 0.7rem;">v${this.version}</small>
                    </div>
                    
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary shadow-sm" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 返回
                        </button>
                        <button class="btn btn-primary shadow-sm" onclick="window.routerPage.saveReview()">
                            <i class="fas fa-save"></i> 儲存並轉入排班表
                        </button>
                    </div>
                </div>

                <!-- 統計卡片區 -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <div class="card shadow-sm border-0 h-100">
                            <div class="card-body">
                                <h6 class="text-muted mb-2">提交進度</h6>
                                <div class="d-flex align-items-end">
                                    <h3 class="mb-0 fw-bold text-success" id="submitted-count">0</h3>
                                    <span class="text-muted ms-2">/ <span id="total-staff-count">0</span> 人</span>
                                </div>
                                <div class="progress mt-2" style="height: 6px;">
                                    <div id="progress-bar" class="progress-bar bg-success" role="progressbar" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-9">
                        <div class="card shadow-sm border-0 h-100">
                            <div class="card-body d-flex align-items-center justify-content-between">
                                <div>
                                    <h6 class="text-muted mb-1">功能操作</h6>
                                    <div class="text-muted small">請點擊下方表格標題進行排序,或拖曳「#」欄位調整順序。</div>
                                </div>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-primary btn-sm" onclick="window.routerPage.exportExcel()">
                                        <i class="fas fa-file-excel"></i> 匯出報表
                                    </button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="window.routerPage.remindUnsubmitted()">
                                        <i class="fas fa-bell"></i> 催繳通知
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 審核表格 -->
                <div class="card shadow border-0">
                    <div class="card-body p-0">
                        <div id="review-table-container">
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary"></div>
                                <div class="mt-2 text-muted">載入中...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 詳細內容 Modal -->
            <div class="modal fade" id="detail-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title">
                                <i class="fas fa-edit me-2"></i>預排詳細內容
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="關閉"></button>
                        </div>
                        <div class="modal-body" id="modal-body-content">
                            <div class="text-center text-muted py-3">
                                <div class="spinner-border spinner-border-sm"></div>
                                <div class="mt-2">載入中...</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>關閉
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.routerPage.saveDetail()">
                                <i class="fas fa-save me-1"></i>儲存變更
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    // 2. 渲染審核表格
    renderReviewTable(staffList, submissions, year, month, options = {}) {
        const { sortKey = 'staffId', sortDir = 'asc' } = options;

        const getSortIcon = (key) => {
            if (sortKey !== key) return '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>';
            return sortDir === 'asc' 
                ? '<i class="fas fa-sort-up text-dark ms-1"></i>' 
                : '<i class="fas fa-sort-down text-dark ms-1"></i>';
        };

        let html = `
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" id="review-table">
                <thead class="bg-light sticky-top" style="z-index: 10;">
                    <tr>
                        <th style="width: 50px;" class="text-center">#</th>
                        
                        <th style="width: 100px; cursor: pointer;" onclick="window.routerPage.handleSort('staffId')">
                            員編 ${getSortIcon('staffId')}
                        </th>
                        
                        <th style="width: 120px;">姓名</th>
                        
                        <th style="width: 90px; cursor: pointer;" onclick="window.routerPage.handleSort('group')">
                            組別 ${getSortIcon('group')}
                        </th>

                        <th style="min-width: 350px;">預排內容 (含上月月底)</th>

                        <th style="min-width: 250px; max-width: 300px;">特註 / 偏好</th>

                        <th style="width: 100px; cursor: pointer;" onclick="window.routerPage.handleSort('status')">
                            狀態 ${getSortIcon('status')}
                        </th>
                        
                        <th style="width: 80px;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (staffList.length === 0) {
            html += `
                <tr>
                    <td colspan="8" class="text-center py-5 text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <div>目前尚無人員資料</div>
                    </td>
                </tr>
            `;
        } else {
            staffList.forEach((staff, index) => {
                const sub = submissions[staff.uid] || {};
                const wishes = sub.wishes || {};
                
                const isSubmitted = sub.isSubmitted;
                const statusBadge = isSubmitted 
                    ? `<span class="badge bg-success-subtle text-success border border-success px-2 py-1">已送出</span>` 
                    : `<span class="badge bg-secondary-subtle text-secondary border px-2 py-1">未填寫</span>`;
                const updateTime = sub.updatedAt ? new Date(sub.updatedAt.seconds * 1000).toLocaleDateString('zh-TW') : '';

                // 特註與偏好
                let noteHtml = '';
                if (sub.note) {
                    noteHtml += `<div class="mb-1 text-dark" style="white-space: pre-wrap; font-size: 0.9rem;">${this.escapeHtml(sub.note)}</div>`;
                }
                const wishSummary = this.getWishSummary(wishes);
                if (wishSummary) {
                    noteHtml += `<div class="text-primary small"><i class="fas fa-star me-1"></i>${wishSummary}</div>`;
                }
                if (!noteHtml) noteHtml = '<span class="text-muted small">-</span>';

                const gridHtml = this.renderGridVisual(staff, wishes, year, month);

                html += `
                    <tr draggable="true" 
                        data-uid="${staff.uid}" 
                        data-index="${index}"
                        class="review-row"
                        ondragstart="window.routerPage.handleDragStart(event)" 
                        ondragover="window.routerPage.handleDragOver(event)" 
                        ondrop="window.routerPage.handleDrop(event)"
                        ondragend="window.routerPage.handleDragEnd(event)">
                        
                        <td class="text-center text-muted" style="cursor: grab;" title="拖曳排序">
                            <i class="fas fa-grip-vertical"></i>
                        </td>
                        <td class="fw-bold text-secondary">${this.escapeHtml(staff.staffId || '')}</td>
                        <td>
                            <div class="fw-bold text-dark">${this.escapeHtml(staff.name)}</div>
                            <div class="small text-muted">${this.escapeHtml(staff.rank || '')}</div>
                        </td>
                        <td><span class="badge bg-light text-dark border">${this.escapeHtml(staff.group || '-')}</span></td>
                        <td class="py-2">${gridHtml}</td>
                        <td class="text-start align-top py-3">${noteHtml}</td>
                        <td class="text-center">
                            ${statusBadge}
                            ${updateTime ? `<div class="small text-muted mt-1" style="font-size:0.75rem">${updateTime}</div>` : ''}
                        </td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-primary rounded-circle" 
                                    style="width:32px; height:32px;"
                                    onclick="window.routerPage.openDetailModal('${staff.uid}')" 
                                    title="編輯">
                                <i class="fas fa-pen"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table></div>`;
        return html;
    },

    // 3. 視覺化格子
    renderGridVisual(staff, wishes, year, month) {
        let html = '<div class="d-flex align-items-center overflow-auto pb-1" style="max-width: 450px;">';

        const prevDays = staff.prevMonthDays || []; 
        const prevShifts = staff.prevMonthShifts || {};

        // 渲染上月最後幾天
        prevDays.forEach(d => {
            const shift = prevShifts[d] || '';
            let styleClass = shift 
                ? 'bg-secondary text-white opacity-50 border-secondary' 
                : 'bg-white text-muted border-secondary border-dashed';
            
            const onClick = `onclick="window.routerPage.editPrevShift('${staff.uid}', ${d})"`;
            
            html += `
                <div class="text-center me-1 rounded border ${styleClass}" 
                     style="min-width: 24px; cursor: pointer;" 
                     title="上月 ${d} 日 (點擊編輯)" ${onClick}>
                    <div class="bg-light border-bottom text-muted" style="font-size: 0.6rem; line-height: 12px;">${d}</div>
                    <div style="font-size: 0.75rem; font-weight: bold; line-height: 18px;">${this.escapeHtml(shift || '?')}</div>
                </div>
            `;
        });

        // 分隔線
        if (prevDays.length > 0) {
            html += '<div class="border-end mx-2" style="height: 30px; border-color: #ddd;"></div>';
        }

        // 渲染當月預排
        let hasWishes = false;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        for (let d = 1; d <= daysInMonth; d++) {
            if (wishes[d]) {
                hasWishes = true;
                const w = wishes[d];
                let bgClass = 'bg-primary text-white border-primary';
                if (w === 'OFF') bgClass = 'bg-secondary text-white border-secondary';
                if (w === 'M_OFF') bgClass = 'bg-dark text-white border-dark';

                html += `
                    <div class="text-center me-1 rounded border ${bgClass}" style="min-width: 24px;">
                        <div class="bg-white text-dark border-bottom opacity-75" style="font-size: 0.6rem; line-height: 12px;">${d}</div>
                        <div style="font-size: 0.75rem; font-weight: bold; line-height: 18px;">${this.escapeHtml(w)}</div>
                    </div>
                `;
            }
        }

        if (!hasWishes) {
            html += '<span class="text-muted small ms-1">無預排</span>';
        }

        html += '</div>';
        return html;
    },

    // 4. 偏好統計
    getWishSummary(wishes) {
        if (!wishes) return '';
        const counts = {};
        Object.values(wishes).forEach(w => {
            counts[w] = (counts[w] || 0) + 1;
        });
        const parts = [];
        if (counts['OFF']) parts.push(`OFF:${counts['OFF']}`);
        if (counts['M_OFF']) parts.push(`管休:${counts['M_OFF']}`);
        
        Object.keys(counts).forEach(key => {
            if (key !== 'OFF' && key !== 'M_OFF') {
                parts.push(`${key}:${counts[key]}`);
            }
        });
        return parts.join(', ');
    },

    // 5. HTML 轉義 (防止 XSS)
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
