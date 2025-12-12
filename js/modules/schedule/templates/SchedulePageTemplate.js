export const SchedulePageTemplate = {
    // 1. 主框架
    renderLayout(year, month) {
        return `
            <div class="schedule-container">
                <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-secondary me-3" onclick="window.location.hash='/schedule/list'">
                            <i class="fas fa-arrow-left"></i> 回列表
                        </button>
                        <div>
                            <span class="h4 align-middle fw-bold text-gray-800">
                                ${year}年 ${month}月 排班作業
                            </span>
                            <span id="schedule-status-badge" class="badge bg-secondary ms-2">載入中</span>
                        </div>
                    </div>
                    
                    <div id="loading-indicator" style="display:none;" class="text-primary fw-bold">
                        <i class="fas fa-spinner fa-spin"></i> 處理中...
                    </div>

                    <div class="d-flex align-items-center bg-white border rounded px-3 py-1 shadow-sm" style="min-width: 180px;">
                        <div class="me-3 text-end flex-grow-1">
                            <div class="small text-muted fw-bold" style="font-size: 0.75rem;">排班品質總分</div>
                            <div class="h4 mb-0 fw-bold text-primary" id="score-display">--</div>
                        </div>
                        <button class="btn btn-sm btn-outline-info rounded-circle" style="width:32px;height:32px;" 
                                onclick="window.routerPage.showScoreDetails()" title="查看評分詳情">
                            <i class="fas fa-info"></i>
                        </button>
                    </div>
                </div>
                
                <div class="schedule-toolbar d-flex justify-content-between mb-3">
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm shadow-sm" onclick="window.location.hash='/unit/settings/rules'">
                            <i class="fas fa-cog"></i> 規則與權重
                        </button>
                        <button id="btn-clear" class="btn btn-outline-danger btn-sm shadow-sm">
                            <i class="fas fa-undo"></i> 重置回預班狀態
                        </button>
                    </div>

                    <div class="d-flex gap-2">
                        <button id="btn-auto-schedule" class="btn btn-primary shadow-sm" style="background-color: #6366f1; border:none;">
                            <i class="fas fa-magic"></i> 智慧排班 (AI)
                        </button>
                        <button id="btn-validate" class="btn btn-secondary shadow-sm btn-sm">
                            <i class="fas fa-check-circle"></i> 檢查
                        </button>
                        <button id="btn-publish" class="btn btn-success shadow-sm btn-sm">
                            <i class="fas fa-paper-plane"></i> 發布
                        </button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper border rounded"></div>

                <div class="modal fade" id="score-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white"><h5 class="modal-title">評分詳情</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body p-0"><div id="score-details-body"></div></div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="versions-modal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header bg-gradient-primary text-white"><h5 class="modal-title">AI 排班結果</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body p-0">
                                <ul class="nav nav-tabs nav-fill bg-light" id="versionTabs" role="tablist">
                                    <li class="nav-item"><button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#v1">版本 1</button></li>
                                    <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v2">版本 2</button></li>
                                    <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v3">版本 3</button></li>
                                </ul>
                                <div class="tab-content" id="versionTabsContent">
                                    <div class="tab-pane fade show active" id="v1"></div>
                                    <div class="tab-pane fade" id="v2"></div>
                                    <div class="tab-pane fade" id="v3"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 渲染主表格 Grid (核心邏輯分離)
    renderGrid(dataCtx, validationResult, options = {}) {
        const { year, month, daysInMonth, staffList, unitSettings } = dataCtx;
        const { assignments } = dataCtx.scheduleData;
        const { staffReport, coverageErrors } = validationResult;
        const { isInteractive = true, isDropZone = false, versionIdx = null } = options;

        const shiftDefs = unitSettings?.settings?.shifts || [];
        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);
        shiftMap['OFF'] = { color: '#e5e7eb', name: '休' };
        shiftMap['M_OFF'] = { color: '#6f42c1', name: '管休' };

        let headerHtml = '<thead><tr><th class="sticky-col bg-light" style="min-width:140px; z-index:20;">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            let thClass = (dateObj.getDay()===0||dateObj.getDay()===6) ? 'text-danger' : '';
            if (coverageErrors && coverageErrors[d]) thClass += ' bg-warning'; 
            headerHtml += `<th class="${thClass}" style="min-width:40px;">${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        headerHtml += '</tr></thead>';

        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            const uid = staff.uid;
            const staffAssignments = assignments[uid] || {};
            const staffErrors = staffReport[uid]?.errors || {};
            
            // 互動模式才顯示刪除按鈕
            const deleteBtn = isInteractive 
                ? `<i class="fas fa-times text-danger ms-2" style="cursor:pointer;" onclick="window.routerPage.deleteStaff('${uid}')"></i>` 
                : '';

            bodyHtml += `<tr>
                <td class="sticky-col bg-white" style="z-index:10;">
                    <div class="d-flex justify-content-between align-items-center">
                        <div><strong>${staff.name}</strong><br><span class="text-muted small">${staff.rank || ''}</span></div>
                        ${deleteBtn}
                    </div>
                </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const code = staffAssignments[d] || '';
                let style = '';
                if(code === 'M_OFF') style = 'background-color:#6f42c1; color:white;';
                else if (code && shiftMap[code]) style = `background-color:${shiftMap[code].color}40; border-bottom: 2px solid ${shiftMap[code].color}`;
                
                const errorMsg = staffErrors[d];
                const borderStyle = errorMsg ? 'border: 2px solid red !important;' : '';
                const title = errorMsg ? `title="${errorMsg}"` : '';
                const cellClass = isInteractive ? 'shift-cell' : ''; 
                const cursor = isInteractive ? 'cursor:pointer;' : '';
                const dropAttrs = isDropZone ? `ondragover="event.preventDefault()" ondrop="window.routerPage.handleDrop(event, '${uid}', ${d}, ${versionIdx})"` : '';

                bodyHtml += `<td class="${cellClass}" data-staff-id="${uid}" data-day="${d}" style="${cursor} ${style}; ${borderStyle}" ${title} ${dropAttrs}>${code === 'M_OFF' ? 'OFF' : code}</td>`;
            }
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';
        return `<table class="schedule-table table table-bordered table-sm text-center mb-0">${headerHtml}${bodyHtml}</table>`;
    },

    // 3. 渲染評分詳情
    renderScoreDetails(result) {
        const d = result.details;
        const renderItem = (label, obj, extra='') => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>${label}</span>
                <div class="text-end"><span class="badge bg-primary rounded-pill">${obj.score.toFixed(0)}分</span><small class="text-muted ms-2">${extra}</small></div>
            </li>`;

        return `
            <div class="p-3 bg-light text-center border-bottom">
                <h1 class="display-4 fw-bold mb-0 ${result.totalScore>=80?'text-success':'text-primary'}">${result.totalScore}</h1>
                <div class="small text-muted">總分</div>
                ${result.passed ? '<span class="badge bg-success">Hard Constraints Pass</span>' : '<span class="badge bg-danger">Hard Constraints Fail</span>'}
            </div>
            <ul class="list-group list-group-flush">
                ${renderItem('公平性', d.fairness, `SD:${d.fairness.hoursSD||'-'}`)}
                ${renderItem('滿意度', d.satisfaction)}
                ${renderItem('效率', d.efficiency, d.efficiency.coverage)}
                ${renderItem('健康', d.health)}
                ${renderItem('品質', d.quality)}
                ${renderItem('成本', d.cost)}
            </ul>
        `;
    },

    // 4. 渲染缺班池 (Drop Zone)
    renderMissingPool(missing) {
        if (missing.length === 0) return '<div class="alert alert-success py-1 mb-2 small"><i class="fas fa-check"></i> 人力需求已全數滿足</div>';
        
        let poolHtml = '<div class="card mb-2 border-danger"><div class="card-header bg-danger text-white py-1 small">缺班池 (請拖曳補班)</div><div class="card-body p-2 d-flex flex-wrap gap-2">';
        missing.forEach(m => { 
            poolHtml += `<span class="badge bg-dark p-2" style="cursor:grab;" draggable="true" ondragstart="window.routerPage.handleDragStart(event, '${m.shift}')">${m.day}日: ${m.shift} <span class="badge bg-light text-dark rounded-pill ms-1">${m.count}</span></span>`; 
        });
        poolHtml += '</div></div>';
        return poolHtml;
    }
};
