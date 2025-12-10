import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;
        this.selectedStaff = []; 
        
        this.reviewStaffList = []; 
        this.currentReviewId = null; 
        
        this.modal = null;
        this.searchModal = null;
        this.reviewModal = null;

        this.isEditMode = false;
        this.editingScheduleId = null;
        
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D':   { label: 'D',   color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E':   { label: 'E',   color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N':   { label: 'N',   color: '#212529', bg: '#212529', text: 'white' },
            'XD':  { label: 'x白', color: '#adb5bd', bg: '#f8f9fa', text: '#0d6efd', border: '1px solid #0d6efd' },
            'XE':  { label: 'x小', color: '#adb5bd', bg: '#f8f9fa', text: '#ffc107', border: '1px solid #ffc107' },
            'XN':  { label: 'x大', color: '#adb5bd', bg: '#f8f9fa', text: '#212529', border: '1px solid #212529' },
            'M_OFF': { label: 'OFF', color: '#6f42c1', bg: '#6f42c1', text: 'white' }
        };
    }

    async render() {
        // ... (Base Layout)
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let unitOptions = '<option value="">載入中...</option>';
        if (isAdmin) {
            const units = await UnitService.getAllUnits();
            unitOptions = `<option value="">請選擇單位...</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            const units = await UnitService.getUnitsByManager(user.uid);
            if(units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
            }
            unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        }

        const baseLayout = `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-calendar-check"></i> 預班管理</h3>
                    <p class="text-muted small mb-0">設定預班規則、參與人員，並審核預班總表。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-select" class="form-select w-auto">${unitOptions}</select>
                        <div class="vr mx-2"></div>
                        <button id="btn-add" class="btn btn-primary w-auto text-nowrap"><i class="fas fa-plus"></i> 新增預班表</button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>預班月份</th>
                                        <th>開放區間</th>
                                        <th>參與人數</th>
                                        <th>狀態</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="table-body"><tr><td colspan="5" class="text-center py-5 text-muted">請先選擇單位</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const contextMenu = `
            <div id="shift-context-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                ${Object.entries(this.shiftTypes).filter(([k])=>k!=='M_OFF').map(([key, cfg]) => 
                    `<button class="list-group-item list-group-item-action py-1 text-center small fw-bold" 
                        style="color:${cfg.bg=== '#f8f9fa'?cfg.text:'white'}; background:${cfg.bg==='#f8f9fa'?'white':cfg.bg};"
                        onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                ).join('')}
                <button class="list-group-item list-group-item-action py-1 text-center text-secondary small" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
            </div>
        `;

        const reviewModalHtml = `
            <div class="modal fade" id="review-modal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-fullscreen">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white py-2">
                            <h6 class="modal-title" id="review-modal-title"><i class="fas fa-th"></i> 預班總表審核</h6>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0 d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
                                <div class="small">
                                    <span class="badge bg-danger me-1">OFF</span>
                                    <span class="badge bg-primary me-1">D</span>
                                    <span class="badge bg-warning text-dark me-1">E</span>
                                    <span class="badge bg-dark me-1">N</span>
                                    <span class="badge" style="background:#6f42c1;">紫:管</span>
                                    <span class="ms-2 text-muted">左鍵:切換 | 右鍵:選單</span>
                                </div>
                                <button class="btn btn-primary px-4" id="btn-save-review">
                                    <i class="fas fa-save"></i> 儲存變更
                                </button>
                            </div>
                            <div class="table-responsive flex-grow-1">
                                <table class="table table-bordered table-sm text-center table-hover mb-0 user-select-none" style="font-size: 0.85rem;" id="review-table">
                                    <thead class="table-light sticky-top" style="z-index: 1020;" id="review-thead"></thead>
                                    <tbody id="review-tbody"></tbody>
                                    <tfoot class="table-light sticky-bottom fw-bold" style="z-index: 1020;" id="review-tfoot"></tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // PreSchedule Modal & Search Modal (維持原樣，但為了完整性這裡包含)
        const otherModals = `
            <div class="modal fade" id="pre-modal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header bg-light"><h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><form id="pre-form"><div id="pre-form-content"></div></form></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save" class="btn btn-primary">儲存</button></div></div></div></div>
            <div class="modal fade" id="search-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header bg-primary text-white"><h5 class="modal-title">搜尋</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="input-group mb-3"><input type=\"text\" id=\"staff-search-input\" class=\"form-control\"><button class=\"btn btn-secondary\" id=\"btn-do-search\">搜</button></div><div id=\"search-results-list\"></div></div></div></div></div>
        `;

        return baseLayout + contextMenu + reviewModalHtml + otherModals;
    }

    // 為了節省篇幅，pre-modal 內部 HTML 動態生成或請使用上一版完整的 render() 中的 HTML
    // 上方的 otherModals 僅為佔位，建議您把上一版的 pre-modal HTML 貼進去

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        this.searchModal = new bootstrap.Modal(document.getElementById('search-modal'));
        window.routerPage = this;

        // 綁定事件
        document.getElementById('unit-select').addEventListener('change', (e) => this.loadList(e.target.value));
        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null));
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        // Context Menu Close
        document.addEventListener('click', (e) => {
            if(!e.target.closest('#shift-context-menu')) document.getElementById('shift-context-menu').style.display = 'none';
        });

        // 搜尋 Modal 事件 (簡化綁定)
        document.getElementById('btn-do-search').addEventListener('click', () => this.searchStaff());

        // 初始化 pre-form 內容 (如果上面用了佔位符)
        if(document.getElementById('pre-form-content')) {
            document.getElementById('pre-form-content').innerHTML = this.getPreFormHtml();
            // 綁定 form 內的事件 (如 import button)
            document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
            document.getElementById('chk-use-defaults').addEventListener('change', (e) => { if(e.target.checked) this.setDefaultDates(); });
            document.getElementById('edit-month').addEventListener('change', () => { if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates(); });
            document.getElementById('btn-open-search').addEventListener('click', () => this.searchModal.show());
        }

        const sel = document.getElementById('unit-select');
        if(sel.options.length>0 && sel.value) this.loadList(sel.value);
    }

    getPreFormHtml() {
        // 返回上一版完整的 form HTML
        return `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="form-check"><input class="form-check-input" type="checkbox" id="chk-use-defaults" checked><label class="form-check-label small" for="chk-use-defaults">設為預設值</label></div>
                <button type="button" class="btn btn-sm btn-outline-info" id="btn-import-last"><i class="fas fa-history"></i> 帶入上月</button>
            </div>
            <div class="row g-2 align-items-center mb-3 bg-light p-2 rounded">
                <div class="col-md-3"><label class="small fw-bold">月份</label><input type="month" id="edit-month" class="form-control form-control-sm" required></div>
                <div class="col-md-3"><label class="small fw-bold">起</label><input type="date" id="edit-open" class="form-control form-control-sm" required></div>
                <div class="col-md-3"><label class="small fw-bold">迄</label><input type="date" id="edit-close" class="form-control form-control-sm" required></div>
                <div class="col-md-3"><div class="form-check form-switch mt-4"><input class="form-check-input" type="checkbox" id="edit-showNames"><label class="form-check-label small fw-bold">顯示姓名</label></div></div>
            </div>
            <h6 class="text-primary fw-bold border-bottom pb-1 mb-2">限制參數</h6>
            <div class="row g-3 mb-3">
                <div class="col-md-3"><label class="small fw-bold">預班上限</label><input type="number" id="edit-maxOff" class="form-control form-control-sm" value="8"></div>
                <div class="col-md-3"><label class="small fw-bold text-danger">假日上限</label><input type="number" id="edit-maxHoliday" class="form-control form-control-sm" value="2"></div>
                <div class="col-md-3"><label class="small fw-bold text-success">保留人數</label><input type="number" id="edit-reserved" class="form-control form-control-sm" value="0"></div>
            </div>
            <h6 class="text-primary fw-bold border-bottom pb-1 mb-2">每日各班人力限制</h6>
            <div id="group-limits-container" class="mb-3"></div>
            <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                <span>參與人員 (<span id="staff-count">0</span>)</span>
                <button type="button" class="btn btn-sm btn-outline-primary" id="btn-open-search"><i class="fas fa-plus"></i> 新增</button>
            </h6>
            <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                <table class="table table-sm table-hover align-middle mb-0 text-center small">
                    <thead class="table-light sticky-top"><tr><th class="text-start ps-3">姓名</th><th>職編</th><th>職級</th><th>狀態</th><th width="120">組別</th><th>操作</th></tr></thead>
                    <tbody id="staff-list-tbody"></tbody>
                </table>
            </div>
        `;
    }

    // ... (loadList, getStatusText, setDefaultDates 同上) ...
    async loadList(uid) { /*...*/ if(!uid) return; this.targetUnitId = uid; const tbody = document.getElementById('table-body'); this.preSchedules = await PreScheduleService.getPreSchedulesList(uid); tbody.innerHTML = this.preSchedules.map(p => `<tr><td>${p.year}-${p.month}</td><td>${p.settings.openDate}~${p.settings.closeDate}</td><td>${p.staffIds.length}</td><td>${p.status}</td><td class="text-end"><button class="btn btn-sm btn-success me-1" onclick="window.routerPage.openReview('${p.id}')">審核</button><button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(null)">設定</button><button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')">刪</button></td></tr>`).join(''); }
    
    // =========================================================
    //  ✅ 審核邏輯 (更新)
    // =========================================================
    async openReview(scheduleId) {
        this.currentReviewId = scheduleId;
        const schedule = this.preSchedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        // ✅ 更新 1: 顯示單位與月份
        const unitName = document.getElementById('unit-select').options[document.getElementById('unit-select').selectedIndex].text;
        document.getElementById('review-modal-title').innerHTML = `<i class="fas fa-th"></i> 預班審核 - ${unitName} (${schedule.year}年${schedule.month}月)`;

        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const allStaff = await userService.getUsersByUnit(this.targetUnitId);
        
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid))
            .sort((a, b) => a.staffId.localeCompare(b.staffId)); // 簡單依 ID 排序

        // 表頭
        let thead = '<tr><th class="sticky-col bg-light text-start ps-3" style="min-width:120px; left:0; z-index:1030;">人員</th>';
        // ✅ 更新 2: 插入 "特註/偏好" 欄位
        thead += '<th class="sticky-col bg-light" style="min-width:100px; left:120px; z-index:1030;">特註/偏好</th>';
        
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(schedule.year, schedule.month-1, d);
            const isW = date.getDay()===0 || date.getDay()===6;
            thead += `<th class="${isW?'text-danger':''}" style="min-width:35px;">${d}</th>`;
        }
        thead += '</tr>';
        document.getElementById('review-thead').innerHTML = thead;

        this.renderReviewBody(schedule, daysInMonth);
        this.updateFooterStats(schedule, daysInMonth);
        this.reviewModal.show();
    }

    renderReviewBody(schedule, daysInMonth) {
        const tbody = document.getElementById('review-tbody');
        let html = '';
        const subs = schedule.submissions || {};

        this.reviewStaffList.forEach(staff => {
            const userSub = subs[staff.uid] || {};
            const wishes = userSub.wishes || {};
            const prefs = userSub.preferences || {}; // 讀取偏好

            // 建構偏好顯示字串
            let badges = '';
            // 懷孕 (來自 constraints)
            if (staff.constraints?.isPregnant) badges += '<span class="badge bg-danger me-1">孕</span>';
            // 包班 (來自 submission preferences)
            if (prefs.batch) badges += `<span class="badge bg-dark me-1">包${prefs.batch}</span>`;
            // 優先 (來自 submission preferences)
            if (prefs.priorities && prefs.priorities.length > 0) badges += `<span class="badge bg-info text-dark">優${prefs.priorities.join(',')}</span>`;

            html += `<tr>
                <td class="sticky-col bg-white text-start ps-3 border-end" style="left:0; z-index:1020;">
                    <strong>${staff.name}</strong> <small class="text-muted">(${staff.staffId})</small>
                </td>
                <td class="sticky-col bg-white border-end small align-middle" style="left:120px; z-index:1020;">
                    ${badges}
                </td>`;
            
            for(let d=1; d<=daysInMonth; d++) {
                const val = wishes[d];
                const style = this.getCellStyle(val);
                html += `<td class="review-cell" 
                            style="${style} cursor:pointer;"
                            onclick="window.routerPage.handleCellClick(event, '${staff.uid}', ${d})"
                            oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})"
                            id="cell-${staff.uid}-${d}">
                            ${this.getCellText(val)}
                         </td>`;
            }
            html += '</tr>';
        });
        tbody.innerHTML = html;
    }

    // 輔助與其他邏輯維持不變
    getCellStyle(val) {
        if(!val) return '';
        const cfg = this.shiftTypes[val];
        if(!cfg) return '';
        if(cfg.border) return `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border}; font-weight:bold;`;
        return `background:${cfg.bg}; color:${cfg.text}; font-weight:bold;`;
    }
    getCellText(val) { return val === 'M_OFF' ? 'OFF' : (val || ''); }
    
    // ... handleCellClick, handleCellRightClick, applyShiftFromMenu ...
    // (請保留上一版相同邏輯)
    handleCellClick(e, uid, day) { /*...*/ }
    handleCellRightClick(e, uid, day) { /*...*/ }
    applyShiftFromMenu(type) { /*...*/ }
    updateCellUI(uid, day, val) { /*...*/ }

    updateFooterStats(schedule, daysInMonth) {
        const tfoot = document.getElementById('review-tfoot');
        // ✅ Footer 也要位移
        let html = '<tr><td class="sticky-col bg-light text-end pe-2" colspan="2" style="left:0;">休假數</td>';
        const limit = Math.ceil(this.reviewStaffList.length * 0.4); 
        for(let d=1; d<=daysInMonth; d++) {
            let count = 0;
            this.reviewStaffList.forEach(s => {
                const w = schedule.submissions[s.uid]?.wishes?.[d];
                if(w === 'OFF' || w === 'M_OFF') count++;
            });
            const color = count > limit ? 'text-danger' : '';
            html += `<td class="${color}">${count}</td>`;
        }
        html += '</tr>';
        tfoot.innerHTML = html;
    }

    async saveReview() {
        /* 同上一版 */
        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, this.preSchedules.find(s=>s.id===this.currentReviewId).submissions);
            alert("✅ 已儲存"); this.reviewModal.hide();
        } catch(e) { alert("錯誤"); }
    }

    // ... openModal, renderGroupInputs, searchStaff, etc. (同上)
    async openModal(idx) { /*...*/ this.modal.show(); }
    renderGroupInputs(g, v) { /*...*/ }
    renderStaffList(g) { /*...*/ }
    async searchStaff() { /*...*/ }
    addStaffFromSearch(u,n,r,s,g,p,b) { /*...*/ }
    async importLastMonthSettings() { /*...*/ }
    async savePreSchedule() { /*...*/ }
    async deletePreSchedule(id) { /*...*/ }
}
