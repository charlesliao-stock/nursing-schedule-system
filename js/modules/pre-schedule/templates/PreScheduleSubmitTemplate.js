export const PreScheduleSubmitTemplate = {
    // 1. 主框架
    renderLayout(year, month) {
        return `
            <style>
                .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; background-color: #fff; padding: 10px; }
                .calendar-header { text-align: center; font-weight: bold; padding: 8px 0; background-color: #f8f9fa; border-radius: 4px; color: #495057; }
                .calendar-cell { border: 1px solid #dee2e6; border-radius: 4px; min-height: 100px; padding: 5px; position: relative; background-color: #fff; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; justify-content: space-between; }
                .calendar-cell:hover:not(.disabled) { border-color: #0d6efd; background-color: #f8f9fa; transform: translateY(-2px); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .calendar-cell.weekend { background-color: #fdf2f2; }
                .weekend-text { color: #dc3545; font-weight: bold; }
                .calendar-cell.disabled { background-color: #e9ecef; cursor: not-allowed; opacity: 0.7; }
                .day-number { font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
                .shift-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; font-weight: bold; text-align: center; width: 100%; margin-bottom: auto; }
                .bottom-stats { font-size: 0.75rem; text-align: right; color: #6c757d; margin-top: 5px; }
                .bottom-stats.full { color: #dc3545; font-weight: bold; }
                #user-shift-menu { background-color: #ffffff !important; opacity: 1 !important; border: 1px solid rgba(0,0,0,0.15); box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.175); }
            </style>
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求。</p>
                </div>
                <div id="admin-impersonate-section" class="card shadow-sm mb-3 border-left-danger bg-light" style="display:none;">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <strong class="text-danger"><i class="fas fa-user-secret"></i> 管理員模式：</strong>
                        <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">選擇單位</option></select>
                        <select id="admin-user-select" class="form-select form-select-sm w-auto"><option value="">選擇人員</option></select>
                        <button id="btn-impersonate" class="btn btn-sm btn-danger">切換身份</button>
                    </div>
                </div>
                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <div class="input-group w-auto">
                            <button class="btn btn-outline-secondary" id="btn-prev-year"><i class="fas fa-chevron-left"></i></button>
                            <span class="input-group-text bg-white fw-bold" id="display-year" style="min-width:80px; justify-content:center;">${year}</span>
                            <button class="btn btn-outline-secondary" id="btn-next-year"><i class="fas fa-chevron-right"></i></button>
                        </div>
                        <span class="fw-bold me-2">年</span>
                        <select id="month-select" class="form-select w-auto">
                            ${Array.from({length:12}, (_,i)=>i+1).map(m=>`<option value="${m}" ${m===month?'selected':''}>${m}月</option>`).join('')}
                        </select>
                        <button id="btn-load" class="btn btn-primary"><i class="fas fa-search"></i> 讀取</button>
                    </div>
                </div>
                <div id="list-view" class="card shadow">
                    <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-primary">可預班月份清單</h6></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0 text-center">
                                <thead class="table-light"><tr><th>月份</th><th>單位</th><th>開放日期</th><th>狀態</th><th>操作</th></tr></thead>
                                <tbody id="schedule-list-tbody"><tr><td colspan="5" class="py-5 text-muted">請點選讀取</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div id="detail-view" style="display:none;">
                    <div class="d-flex align-items-center mb-3">
                        <button class="btn btn-outline-secondary btn-sm me-3" id="btn-back"><i class="fas fa-arrow-left"></i> 返回清單</button>
                        <h4 class="m-0 fw-bold text-gray-800" id="calendar-header-title"></h4>
                    </div>
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-body p-3 bg-light">
                                    <div class="d-flex justify-content-end mb-2 small text-muted">
                                        <span class="me-3"><i class="fas fa-mouse-pointer"></i> 左鍵: OFF/取消</span>
                                        <span><i class="fas fa-mouse-pointer"></i> 右鍵: 選單</span>
                                    </div>
                                    <div id="calendar-container" class="calendar-grid"></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-4">
                            <div class="card shadow mb-4 border-left-info sticky-top" style="top: 80px; z-index: 10;">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-info">排班偏好設定</h6></div>
                                <div class="card-body">
                                    <div class="mb-3 d-flex justify-content-between">
                                        <span>總數 <span class="badge bg-primary" id="count-total">0</span> / <span id="limit-total"></span></span>
                                        <span>假日 <span class="badge bg-info" id="count-holiday">0</span> / <span id="limit-holiday"></span></span>
                                    </div>
                                    <hr>
                                    <div id="preference-container"></div>
                                    <div class="mb-3 mt-3">
                                        <label class="fw-bold small">備註</label>
                                        <textarea class="form-control form-control-sm" id="wish-notes" rows="2"></textarea>
                                    </div>
                                    <button id="btn-submit" class="btn btn-success w-100"><i class="fas fa-paper-plane"></i> 提交預班</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="user-shift-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;"></div>
            </div>
        `;
    },

    renderContextMenu(shiftTypes) { return ``; },

    renderPreferencesForm(canBatch, maxTypes, savedPrefs = {}, unitShifts = [], settings = {}) {
        let html = '';
        const limit = settings.shiftTypesLimit || 2; 
        const allow3 = settings.allowThreeTypesVoluntary !== false; 
        const showMixOption = (limit === 3) || (limit === 2 && allow3);

        if (canBatch) {
            html += `
                <div class="mb-3">
                    <label class="fw-bold d-block mb-1 small text-primary"><i class="fas fa-moon"></i> 包班意願 (選擇一種)</label>
                    <div class="btn-group w-100 btn-group-sm" role="group">
                        <input type="radio" class="btn-check" name="batchPref" id="batch-none" value="" ${!savedPrefs.batch ? 'checked' : ''}>
                        <label class="btn btn-outline-secondary" for="batch-none">無</label>
                        <input type="radio" class="btn-check" name="batchPref" id="batch-e" value="E" ${savedPrefs.batch==='E' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning text-dark" for="batch-e">包小夜</label>
                        <input type="radio" class="btn-check" name="batchPref" id="batch-n" value="N" ${savedPrefs.batch==='N' ? 'checked' : ''}>
                        <label class="btn btn-outline-dark" for="batch-n">包大夜</label>
                    </div>
                </div>
            `;
        } 
        
        if (showMixOption) {
            const mixPref = savedPrefs.monthlyMix || '2'; 
            html += `
                <div class="mb-3">
                    <label class="fw-bold d-block mb-1 small text-primary"><i class="fas fa-random"></i> 本月班別種類偏好</label>
                    <div class="btn-group w-100 btn-group-sm" role="group">
                        <input type="radio" class="btn-check" name="monthlyMix" id="mix-2" value="2" ${mixPref==='2' ? 'checked' : ''}>
                        <label class="btn btn-outline-secondary" for="mix-2">單純 (2種)</label>
                        <input type="radio" class="btn-check" name="monthlyMix" id="mix-3" value="3" ${mixPref==='3' ? 'checked' : ''}>
                        <label class="btn btn-outline-secondary" for="mix-3">彈性 (3種)</label>
                    </div>
                    <div class="form-text small" style="font-size:0.75rem;">
                        2種: D/E 或 D/N (較規律)<br>
                        3種: D/E/N 皆有 (配合度高)
                    </div>
                </div>
            `;
        } else {
            html += `<input type="hidden" name="monthlyMix" value="2">`;
        }

        html += `<label class="fw-bold d-block mb-1 small text-primary"><i class="fas fa-sort-numeric-down"></i> 排班偏好順序</label>`;
        
        const shiftOptions = unitShifts.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');
        const defaultOptions = `<option value="">請選擇</option>` + shiftOptions;

        const renderSelect = (idx, val, containerId=null) => `
            <div class="input-group input-group-sm mb-2" ${containerId ? `id="${containerId}"` : ''}>
                <span class="input-group-text">順位 ${idx}</span>
                <select class="form-select pref-select" id="pref-${idx}">
                    ${defaultOptions.replace(`value="${val}"`, `value="${val}" selected`)}
                </select>
            </div>`;

        html += renderSelect(1, savedPrefs.priority1);
        html += renderSelect(2, savedPrefs.priority2);
        
        if (showMixOption) {
            html += renderSelect(3, savedPrefs.priority3, 'container-pref-3');
        }
        
        html += `<div class="form-text small mb-2">請依序選擇希望的班別優先順序</div>`;
        return html;
    }
};
