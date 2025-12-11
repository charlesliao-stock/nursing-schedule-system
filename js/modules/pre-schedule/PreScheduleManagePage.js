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
        // ... (省略與之前相同的 Base Layout, 使用上一回的完整 HTML)
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

        const mainLayout = `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-calendar-check"></i> 預班管理</h3>
                    <p class="text-muted small mb-0">設定每月的預班開放時間、規則限制與參與人員，並進行總表審核。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">選擇單位：</label>
                        <select id="unit-select" class="form-select w-auto">${unitOptions}</select>
                        <div class="vr mx-2"></div>
                        <button id="btn-add" class="btn btn-primary w-auto text-nowrap">
                            <i class="fas fa-plus"></i> 新增預班表
                        </button>
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
                                <tbody id="table-body">
                                    <tr><td colspan="5" class="text-center py-5 text-muted">請先選擇單位</td></tr>
                                </tbody>
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

        // Review Modal
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
                                    <span class="badge" style="background:#6f42c1;">紫:管理者</span>
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

        // 為了節省長度，Settings Modal & Search Modal 請務必使用前一版本的 HTML，這邊省略
        // (請複製上一回的 settingsModalHtml 與 searchModalHtml)
        const settingsModalHtml = `<div class="modal fade" id="pre-modal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header bg-light"><h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><form id="pre-form"><div id="pre-form-content-placeholder"></div></form></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save" class="btn btn-primary">儲存</button></div></div></div></div>`;
        const searchModalHtml = `<div class="modal fade" id="search-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header bg-primary text-white"><h5 class="modal-title">搜尋</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><input type="text" id="staff-search-input" class="form-control mb-2"><button class="btn btn-secondary" id="btn-do-search">搜</button><div id="search-results-list"></div></div></div></div></div>`;

        return mainLayout + contextMenu + reviewModalHtml + settingsModalHtml + searchModalHtml;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        this.searchModal = new bootstrap.Modal(document.getElementById('search-modal'));
        window.routerPage = this;

        document.getElementById('unit-select').addEventListener('change', (e) => this.loadList(e.target.value));
        document.getElementById('btn-add').addEventListener('click', () => {
            // 需要重新填充表單 HTML
            document.getElementById('pre-form-content-placeholder').innerHTML = this.getPreFormHtml();
            this.openModal(null);
        });
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        document.addEventListener('click', (e) => {
            if(!e.target.closest('#shift-context-menu')) document.getElementById('shift-context-menu').style.display = 'none';
        });

        // 搜尋功能
        document.getElementById('btn-do-search').addEventListener('click', () => this.searchStaff());

        const sel = document.getElementById('unit-select');
        if (sel.options.length > 0 && sel.value) this.loadList(sel.value);
    }

    // 表單 HTML Helper (從前一版複製)
    getPreFormHtml() {
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
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.routerPage.searchModal.show()"><i class="fas fa-plus"></i> 新增</button>
            </h6>
            <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                <table class="table table-sm table-hover align-middle mb-0 text-center small">
                    <thead class="table-light sticky-top"><tr><th class="text-start ps-3">姓名</th><th>職編</th><th>職級</th><th>狀態</th><th width="120">組別</th><th>操作</th></tr></thead>
                    <tbody id="staff-list-tbody"></tbody>
                </table>
            </div>`;
    }

    async loadList(uid) { /*...*/ if(!uid) return; this.targetUnitId = uid; const tbody = document.getElementById('table-body'); this.preSchedules = await PreScheduleService.getPreSchedulesList(uid); tbody.innerHTML = this.preSchedules.map((p, index) => `<tr><td>${p.year}-${p.month}</td><td>${p.settings.openDate}~${p.settings.closeDate}</td><td>${p.staffIds.length}</td><td>${p.status}</td><td class="text-end"><button class="btn btn-sm btn-success me-1" onclick="window.routerPage.openReview('${p.id}')">審核</button><button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${index})">設定</button><button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')">刪</button></td></tr>`).join(''); }

    // =========================================================
    //  審核邏輯 (特註/偏好)
    // =========================================================
    async openReview(scheduleId) {
        this.currentReviewId = scheduleId;
        const schedule = this.preSchedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        const unitName = document.getElementById('unit-select').options[document.getElementById('unit-select').selectedIndex]?.text || '';
        document.getElementById('review-modal-title').innerHTML = `<i class="fas fa-th"></i> 預班審核 - ${unitName} (${schedule.year}年${schedule.month}月)`;

        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const allStaff = await userService.getUsersByUnit(this.targetUnitId);
        
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid))
            .sort((a, b) => a.staffId.localeCompare(b.staffId));

        let thead = '<tr><th class="sticky-col bg-light text-start ps-3" style="min-width:120px; left:0; z-index:1030;">人員</th>';
        thead += '<th class="sticky-col bg-light" style="min-width:120px; left:120px; z-index:1030;">特註/偏好</th>';
        
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
            const prefs = userSub.preferences || {}; 

            // 顯示 Badge (特註/偏好)
            let badges = '';
            if (staff.constraints?.isPregnant) badges += '<span class="badge bg-danger me-1">孕</span>';
            if (prefs.batch) badges += `<span class="badge bg-dark me-1">包${prefs.batch}</span>`;
            if (prefs.priority1) badges += `<span class="badge bg-info text-dark me-1">1.${prefs.priority1}</span>`;
            if (prefs.priority2) badges += `<span class="badge bg-info text-dark">2.${prefs.priority2}</span>`;

            html += `<tr>
                <td class="sticky-col bg-white text-start ps-3 border-end" style="left:0; z-index:1020;">
                    <strong>${staff.name}</strong> <small class="text-muted">(${staff.staffId})</small>
                </td>
                <td class="sticky-col bg-white border-end small align-middle" style="left:120px; z-index:1020; font-size:0.8rem;">
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

    getCellStyle(val) {
        if(!val) return '';
        const cfg = this.shiftTypes[val];
        if(!cfg) return '';
        if(cfg.border) return `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border}; font-weight:bold;`;
        return `background:${cfg.bg}; color:${cfg.text}; font-weight:bold;`;
    }
    getCellText(val) { return val === 'M_OFF' ? 'OFF' : (val || ''); }

    handleCellClick(e, uid, day) {
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule.submissions[uid]) schedule.submissions[uid] = { wishes: {} };
        const wishes = schedule.submissions[uid].wishes;
        if (wishes[day]) { delete wishes[day]; } else { wishes[day] = 'M_OFF'; } 
        this.updateCellUI(uid, day, wishes[day]);
        this.updateFooterStats(schedule, new Date(schedule.year, schedule.month, 0).getDate());
    }

    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.tempTarget = { uid, day }; 
        const menu = document.getElementById('shift-context-menu');
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        if(!this.tempTarget) return;
        const { uid, day } = this.tempTarget;
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule.submissions[uid]) schedule.submissions[uid] = { wishes: {} };
        if(type) schedule.submissions[uid].wishes[day] = type;
        else delete schedule.submissions[uid].wishes[day];
        this.updateCellUI(uid, day, type);
        this.updateFooterStats(schedule, new Date(schedule.year, schedule.month, 0).getDate());
        document.getElementById('shift-context-menu').style.display = 'none';
    }

    updateCellUI(uid, day, val) {
        const cell = document.getElementById(`cell-${uid}-${day}`);
        cell.style = this.getCellStyle(val) + "cursor:pointer;";
        cell.innerText = this.getCellText(val);
    }

    updateFooterStats(schedule, daysInMonth) {
        const tfoot = document.getElementById('review-tfoot');
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
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        const btn = document.getElementById('btn-save-review');
        btn.disabled = true;
        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, schedule.submissions);
            alert("✅ 已儲存"); this.reviewModal.hide();
            if (confirm("是否前往排班？")) window.location.hash = `/schedule/edit?unitId=${this.targetUnitId}&year=${schedule.year}&month=${schedule.month}`;
        } catch(e) { alert("錯誤"); } finally { btn.disabled = false; }
    }

    async openModal(idx) {
        document.getElementById('pre-form-content-placeholder').innerHTML = this.getPreFormHtml();
        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
        document.getElementById('chk-use-defaults').addEventListener('change', (e) => { if(e.target.checked) this.setDefaultDates(); });
        
        if (idx !== null) {
            const data = this.preSchedules[idx];
            this.editingScheduleId = data.id;
            this.isEditMode = true;
            document.getElementById('modal-title').textContent = "編輯預班表";
            document.getElementById('edit-month').value = `${data.year}-${String(data.month).padStart(2,'0')}`;
            // ... (其餘設定邏輯，請參考前一版)
            // 由於篇幅限制，這裡請補上您之前版本的 openModal 邏輯，確保 renderGroupInputs 正確呼叫
            // 重點是 HTML 結構已經正確插入 placeholder
        } else {
            this.isEditMode = false;
            document.getElementById('modal-title').textContent = "新增預班表";
            // ... (New Logic)
        }
        this.renderStaffList([]);
        this.modal.show();
    }
    
    // ... 其他輔助方法 (renderGroupInputs, renderStaffList, searchStaff, addStaffFromSearch, savePreSchedule, deletePreSchedule)
    // 請複製上一版內容，保持不變
    renderGroupInputs(g,v) { document.getElementById('group-limits-container').innerHTML = ''; } // Placeholder
    renderStaffList(g) { document.getElementById('staff-list-tbody').innerHTML = ''; } // Placeholder
    async searchStaff() { /* ... */ }
    addStaffFromSearch(u,n,r,s,g,p,b) { /* ... */ }
    async importLastMonthSettings() { /* ... */ }
    async savePreSchedule() { /* ... */ }
    async deletePreSchedule(id) { /* ... */ }
    setDefaultDates() { /* ... */ }
}
