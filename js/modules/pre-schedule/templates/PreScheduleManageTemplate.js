export const PreScheduleManageTemplate = {
    
    // 1. 主頁面結構
    renderMain() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>預班管理</h3></div>
                
                <div class="card shadow-sm mb-4">
                    <div class="card-body d-flex align-items-center gap-2">
                        <label class="fw-bold">單位：</label>
                        <select id="unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-add" class="btn btn-primary ms-auto">
                            <i class="fas fa-plus"></i> 新增預班表
                        </button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <table class="table table-hover align-middle mb-0 text-center">
                            <thead class="table-light">
                                <tr>
                                    <th>月份</th>
                                    <th>開放區間</th>
                                    <th>參與人數</th>
                                    <th>狀態</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody id="table-body">
                                <tr><td colspan="5" class="py-5 text-muted">請選擇單位以載入資料</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div id="shift-context-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;"></div>
                
                <div class="modal fade" id="review-modal" tabindex="-1">
                    <div class="modal-dialog modal-fullscreen">
                        <div class="modal-content">
                            <div class="modal-header bg-light">
                                <h5 class="modal-title fw-bold" id="review-modal-title">預班審核</h5>
                                <div class="ms-auto d-flex gap-2">
                                    <span class="badge bg-warning text-dark d-flex align-items-center">橘色: 員工自填</span>
                                    <span class="badge bg-info text-dark d-flex align-items-center">藍色: 管理代填</span>
                                    <button class="btn btn-primary btn-sm" id="btn-save-review"><i class="fas fa-save"></i> 儲存</button>
                                    <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">關閉</button>
                                </div>
                            </div>
                            <div class="modal-body p-0">
                                <div class="table-responsive h-100">
                                    <table class="table table-bordered table-sm text-center table-hover mb-0" id="review-table">
                                        <thead class="table-light sticky-top" id="review-thead" style="z-index: 10;"></thead>
                                        <tbody id="review-tbody"></tbody>
                                        <tfoot class="table-light sticky-bottom" id="review-tfoot" style="z-index: 10;"></tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="pre-modal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header bg-light">
                                <h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5>
                                <button class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div id="pre-form-content"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary">儲存設定</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 右鍵選單內容
    renderContextMenu(shiftTypes) {
        return `
            ${Object.entries(shiftTypes).map(([key, cfg]) => 
                `<button class="list-group-item list-group-item-action py-2 text-center fw-bold" 
                   style="color:${cfg.text}; background-color:${cfg.bg};"
                   onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
            ).join('')}
            <button class="list-group-item list-group-item-action py-2 text-center text-muted" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
        `;
    },

    // 3. 新增/編輯表單
    renderForm(defaultYear, defaultMonth, m) {
        return `
            <form id="pre-schedule-form">
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2">基本設定</h6>
                <div class="row mb-3">
                    <div class="col-md-3"><label class="form-label fw-bold">年份</label><input type="number" id="form-year" class="form-control" value="${defaultYear}"></div>
                    <div class="col-md-3"><label class="form-label fw-bold">月份</label><select id="form-month" class="form-select">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1==m?'selected':''}>${i+1}月</option>`).join('')}</select></div>
                    <div class="col-md-3"><label class="form-label fw-bold">開放日期</label><input type="date" id="form-open" class="form-control" required></div>
                    <div class="col-md-3"><label class="form-label fw-bold">截止日期</label><input type="date" id="form-close" class="form-control" required></div>
                </div>
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">預班全域限制</h6>
                <div class="row mb-3">
                    <div class="col-md-4"><label class="form-label fw-bold">每人最多預班數 (OFF)</label><input type="number" id="form-max-off" class="form-control" value="8"></div>
                    <div class="col-md-4"><label class="form-label fw-bold">其中假日上限</label><input type="number" id="form-max-holiday" class="form-control" value="2"></div>
                    <div class="col-md-4"><label class="form-label fw-bold">每日保留人力</label><input type="number" id="form-reserved" class="form-control" value="0"></div>
                </div>
                <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="form-show-names" checked><label class="form-check-label" for="form-show-names">允許查看誰已預班</label></div>
                
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">組別預班限制</h6>
                <div id="group-constraints-container" class="row g-3 mb-3"><div class="text-muted small">請先設定單位組別...</div></div>
                
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">參與人員管理</h6>
                <div class="d-flex mb-2 gap-2"><input type="text" id="search-staff-input" class="form-control form-control-sm w-auto" placeholder="輸入姓名或職編搜尋..."><button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.routerPage.handleSearchStaff()"><i class="fas fa-search"></i> 加入清單</button></div>
                <div class="border rounded p-0 bg-white" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-sm table-hover mb-0 align-middle">
                        <thead class="table-light sticky-top"><tr><th style="width: 40px;"><input type="checkbox" id="check-all-staff"></th><th>職編</th><th>姓名</th><th>職級</th><th>組別設定</th><th>備註</th><th>操作</th></tr></thead>
                        <tbody id="staff-selection-tbody"><tr><td colspan="7" class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr></tbody>
                    </table>
                </div>
            </form>
        `;
    },

    // 4. 列表項目
    renderListItem(item, statusBadge) {
        return `
            <tr>
                <td class="fw-bold">${item.year}-${String(item.month).padStart(2,'0')}</td>
                <td>${item.settings.openDate} ~ ${item.settings.closeDate}</td>
                <td>${item.staffIds.length} 人</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openReview('${item.id}')">
                        <i class="fas fa-list-check"></i> 審核
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-1" onclick="window.routerPage.openModal('${item.id}')">
                        <i class="fas fa-edit"></i> 編輯
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    },

    // 5. 組別限制區塊
    renderGroupConstraints(unitGroups, savedConstraints) {
        if (unitGroups.length === 0) return '<div class="col-12 text-muted">此單位尚未設定組別</div>';
        
        return unitGroups.map(g => {
            const c = savedConstraints[g] || {};
            return `
                <div class="col-12 border rounded p-2 bg-light">
                    <div class="fw-bold mb-2 text-primary"><i class="fas fa-users-cog"></i> ${g} 組限制</div>
                    <div class="d-flex gap-2 flex-wrap">
                        <div class="input-group input-group-sm w-auto"><span class="input-group-text">每班至少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="min" value="${c.min||''}" style="width:60px;" placeholder="不限"></div>
                        <div class="input-group input-group-sm w-auto"><span class="input-group-text">小夜最少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="minE" value="${c.minE||''}" style="width:60px;" placeholder="不限"></div>
                        <div class="input-group input-group-sm w-auto"><span class="input-group-text">大夜最少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="minN" value="${c.minN||''}" style="width:60px;" placeholder="不限"></div>
                        <div class="vr"></div>
                        <div class="input-group input-group-sm w-auto"><span class="input-group-text">小夜最多</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="maxE" value="${c.maxE||''}" style="width:60px;" placeholder="不限"></div>
                        <div class="input-group input-group-sm w-auto"><span class="input-group-text">大夜最多</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="maxN" value="${c.maxN||''}" style="width:60px;" placeholder="不限"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // 6. 人員選擇表格行
    renderStaffSelectionRows(staffList, unitGroups) {
        const groupOpts = `<option value="">(未分組)</option>` + unitGroups.map(g => `<option value="${g}">${g}</option>`).join('');
        
        return staffList.map((s, idx) => `
            <tr>
                <td><input type="checkbox" class="form-check-input staff-select-cb" data-uid="${s.uid}" ${s.selected ? 'checked' : ''} onchange="window.routerPage.toggleStaffSelection('${s.uid}')"></td>
                <td><small>${s.staffId || '-'}</small></td>
                <td class="fw-bold">${s.name}</td>
                <td><small>${s.rank || ''}</small></td>
                <td>
                    <select class="form-select form-select-sm" onchange="window.routerPage.updateLocalGroup('${s.uid}', this.value)">
                        ${groupOpts.replace(`value="${s.group}"`, `value="${s.group}" selected`)}
                    </select>
                </td>
                <td><small class="text-muted text-truncate" style="max-width:100px;">${s.notes || ''}</small></td>
                <td><button type="button" class="btn btn-xs btn-outline-danger" onclick="window.routerPage.removeStaffFromList(${idx})"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');
    }
};
