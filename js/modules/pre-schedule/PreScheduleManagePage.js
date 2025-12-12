import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;
        this.workingStaffList = []; 
        this.unitGroups = []; 
        this.currentEditId = null; 
        
        this.reviewStaffList = [];
        this.currentReviewId = null;
        this.currentSchedule = null;
        
        this.modal = null;
        this.reviewModal = null;
        this.contextMenuTarget = { uid: null, day: null };

        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D': { label: 'D', color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E': { label: 'E', color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N': { label: 'N', color: '#212529', bg: '#212529', text: 'white' }
        };
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>預班管理</h3></div>
                
                <div class="card shadow-sm mb-4">
                    <div class="card-body d-flex align-items-center gap-2">
                        <label class="fw-bold">單位：</label>
                        <select id="unit-select" class="form-select w-auto"><option value="">載入中...</option></select>
                        <button id="btn-add" class="btn btn-primary ms-auto"><i class="fas fa-plus"></i> 新增預班表</button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <table class="table table-hover align-middle mb-0 text-center">
                            <thead class="table-light">
                                <tr><th>月份</th><th>開放區間</th><th>參與人數</th><th>狀態</th><th>操作</th></tr>
                            </thead>
                            <tbody id="table-body"><tr><td colspan="5" class="py-5 text-muted">請選擇單位以載入資料</td></tr></tbody>
                        </table>
                    </div>
                </div>
                
                <div id="shift-context-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                    ${Object.entries(this.shiftTypes).map(([key, cfg]) => 
                        `<button class="list-group-item list-group-item-action py-2 text-center fw-bold" 
                           style="color:${cfg.text}; background-color:${cfg.bg};"
                           onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                    ).join('')}
                    <button class="list-group-item list-group-item-action py-2 text-center text-muted" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
                </div>
                
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
                            <div class="modal-body"><div id="pre-form-content"></div></div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary">儲存設定</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        window.routerPage = this;

        const unitSelect = document.getElementById('unit-select');
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let units = [];
        try {
            if (isAdmin) units = await UnitService.getAllUnits();
            else units = await UnitService.getUnitsByManager(user.uid);
            
            if (units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
            }

            if (units.length === 0) {
                unitSelect.innerHTML = '<option value="">無管理權限</option>';
                unitSelect.disabled = true;
            } else {
                unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
                if (units.length === 1) unitSelect.disabled = true;
                unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
                this.loadList(units[0].unitId);
            }
        } catch (e) {
            console.error(e);
            unitSelect.innerHTML = '<option value="">載入失敗</option>';
        }

        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null)); 
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('shift-context-menu');
            if(menu && !e.target.closest('#shift-context-menu')) menu.style.display = 'none';
        });
    }

    getPreFormHtml() {
        // (保持原樣，篇幅省略，請使用前一版的 getPreFormHtml 內容，它已經包含組別限制與人員搜尋)
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const y = nextMonth.getFullYear();
        const m = nextMonth.getMonth() + 1;
        return `
            <form id="pre-schedule-form">
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2">基本設定</h6>
                <div class="row mb-3">
                    <div class="col-md-3"><label class="form-label fw-bold">年份</label><input type="number" id="form-year" class="form-control" value="${y}"></div>
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
    }

    async loadList(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        this.unitData = await UnitService.getUnitById(uid);
        this.unitGroups = this.unitData.groups || []; 
        const list = await PreScheduleService.getPreSchedulesList(uid);
        this.preSchedules = list;
        const tbody = document.getElementById('table-body');
        if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted">目前無預班表</td></tr>'; return; }
        const now = new Date().toISOString().split('T')[0];
        tbody.innerHTML = list.map(item => {
            const isOpen = now >= item.settings.openDate && now <= item.settings.closeDate;
            const isClosed = now > item.settings.closeDate || item.status === 'closed';
            let statusBadge = isOpen ? '<span class="badge bg-success">開放中</span>' : (isClosed ? '<span class="badge bg-dark">已截止</span>' : '<span class="badge bg-secondary">未開始</span>');
            return `<tr><td class="fw-bold">${item.year}-${String(item.month).padStart(2,'0')}</td><td>${item.settings.openDate} ~ ${item.settings.closeDate}</td><td>${item.staffIds.length} 人</td><td>${statusBadge}</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openReview('${item.id}')"><i class="fas fa-list-check"></i> 審核</button><button class="btn btn-sm btn-outline-secondary me-1" onclick="window.routerPage.openModal('${item.id}')"><i class="fas fa-edit"></i> 編輯</button><button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
    }

    // --- Modal: 新增/編輯 (使用上一版完整邏輯) ---
    async openModal(id = null) {
        document.getElementById('pre-form-content').innerHTML = this.getPreFormHtml();
        this.modal.show();
        const staffTbody = document.getElementById('staff-selection-tbody');
        staffTbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> 載入人員中...</td></tr>';
        
        const unitStaff = await userService.getUnitStaff(this.targetUnitId);
        if (id) {
            this.currentEditId = id;
            document.getElementById('modal-title').textContent = "編輯預班表";
            const schedule = this.preSchedules.find(s => s.id === id);
            document.getElementById('form-year').value = schedule.year;
            document.getElementById('form-month').value = schedule.month;
            document.getElementById('form-open').value = schedule.settings.openDate;
            document.getElementById('form-close').value = schedule.settings.closeDate;
            document.getElementById('form-max-off').value = schedule.settings.maxOffDays;
            document.getElementById('form-max-holiday').value = schedule.settings.maxHoliday || 2;
            document.getElementById('form-reserved').value = schedule.settings.reservedStaff || 0;
            document.getElementById('form-show-names').checked = schedule.settings.showOtherNames;
            this.renderGroupConstraintsSection(schedule.settings.groupConstraints || {});
            this.workingStaffList = unitStaff.map(s => ({
                ...s, selected: schedule.staffIds.includes(s.uid), group: (schedule.staffSettings && schedule.staffSettings[s.uid]?.group) || s.group || ''
            }));
        } else {
            this.currentEditId = null;
            document.getElementById('modal-title').textContent = "新增預班表";
            this.renderGroupConstraintsSection({});
            this.workingStaffList = unitStaff.map(s => ({ ...s, selected: true }));
        }
        this.renderStaffSelectionTable();
        document.getElementById('check-all-staff').addEventListener('change', (e) => { this.workingStaffList.forEach(s => s.selected = e.target.checked); this.renderStaffSelectionTable(); });
    }

    renderGroupConstraintsSection(savedConstraints = {}) {
        const container = document.getElementById('group-constraints-container');
        if (this.unitGroups.length === 0) { container.innerHTML = '<div class="col-12 text-muted">此單位尚未設定組別</div>'; return; }
        container.innerHTML = this.unitGroups.map(g => {
            const c = savedConstraints[g] || {};
            return `<div class="col-12 border rounded p-2 bg-light"><div class="fw-bold mb-2 text-primary"><i class="fas fa-users-cog"></i> ${g} 組限制</div><div class="d-flex gap-2 flex-wrap"><div class="input-group input-group-sm w-auto"><span class="input-group-text">每班至少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="min" value="${c.min||''}" style="width:60px;" placeholder="不限"></div><div class="input-group input-group-sm w-auto"><span class="input-group-text">小夜最少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="minE" value="${c.minE||''}" style="width:60px;" placeholder="不限"></div><div class="input-group input-group-sm w-auto"><span class="input-group-text">大夜最少</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="minN" value="${c.minN||''}" style="width:60px;" placeholder="不限"></div><div class="vr"></div><div class="input-group input-group-sm w-auto"><span class="input-group-text">小夜最多</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="maxE" value="${c.maxE||''}" style="width:60px;" placeholder="不限"></div><div class="input-group input-group-sm w-auto"><span class="input-group-text">大夜最多</span><input type="number" class="form-control group-constraint" data-group="${g}" data-field="maxN" value="${c.maxN||''}" style="width:60px;" placeholder="不限"></div></div></div>`;
        }).join('');
    }

    renderStaffSelectionTable() {
        const tbody = document.getElementById('staff-selection-tbody');
        const groupOpts = `<option value="">(未分組)</option>` + this.unitGroups.map(g => `<option value="${g}">${g}</option>`).join('');
        tbody.innerHTML = this.workingStaffList.map((s, idx) => `
            <tr><td><input type="checkbox" class="form-check-input staff-select-cb" data-uid="${s.uid}" ${s.selected ? 'checked' : ''} onchange="window.routerPage.toggleStaffSelection('${s.uid}')"></td><td><small>${s.staffId || '-'}</small></td><td class="fw-bold">${s.name}</td><td><small>${s.rank || ''}</small></td><td><select class="form-select form-select-sm" onchange="window.routerPage.updateLocalGroup('${s.uid}', this.value)">${groupOpts.replace(`value="${s.group}"`, `value="${s.group}" selected`)}</select></td><td><small class="text-muted text-truncate" style="max-width:100px;">${s.notes || ''}</small></td><td><button type="button" class="btn btn-xs btn-outline-danger" onclick="window.routerPage.removeStaffFromList(${idx})"><i class="fas fa-times"></i></button></td></tr>
        `).join('');
    }

    // (Helper methods: toggleStaffSelection, updateLocalGroup, removeStaffFromList, handleSearchStaff, savePreSchedule - same as before)
    toggleStaffSelection(uid) { const s = this.workingStaffList.find(x => x.uid === uid); if(s) s.selected = !s.selected; }
    updateLocalGroup(uid, val) { const s = this.workingStaffList.find(x => x.uid === uid); if(s) s.group = val; }
    removeStaffFromList(idx) { this.workingStaffList.splice(idx, 1); this.renderStaffSelectionTable(); }
    async handleSearchStaff() { /*...same...*/ }
    async savePreSchedule() { /*...same...*/ }

    // --- 審核相關 (Update) ---

    async openReview(id) {
        this.currentReviewId = id;
        const schedule = this.preSchedules.find(s => s.id === id);
        this.currentSchedule = schedule; 
        
        if (!schedule) return alert("找不到資料");

        document.getElementById('review-modal-title').textContent = `預班審核 - ${schedule.year}年${schedule.month}月`;

        // 1. 載入人員詳情 (包含 constraints 資訊)
        const allStaff = await userService.getUnitStaff(this.targetUnitId);
        // 過濾並排序
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid))
            .sort((a,b) => (a.rank||'').localeCompare(b.rank||''));

        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        
        // Render Header: 增加一欄 "特註/偏好"
        let theadHtml = '<tr><th class="sticky-col bg-light" style="min-width:120px; z-index:20;">人員</th><th class="sticky-col bg-light" style="min-width:150px; left:120px; z-index:20;">特註/偏好</th>';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(schedule.year, schedule.month-1, d);
            const w = date.getDay();
            const isWeekend = (w===0 || w===6);
            theadHtml += `<th class="${isWeekend?'text-danger':''}" style="min-width:40px;">${d}<br><small>${['日','一','二','三','四','五','六'][w]}</small></th>`;
        }
        theadHtml += '</tr>';
        document.getElementById('review-thead').innerHTML = theadHtml;

        this.renderReviewBody(schedule, daysInMonth);
        this.updateFooterStats(schedule, daysInMonth);
        this.reviewModal.show();
    }

    renderReviewBody(schedule, daysInMonth) {
        const tbody = document.getElementById('review-tbody');
        const submissions = schedule.submissions || {};

        tbody.innerHTML = this.reviewStaffList.map(staff => {
            const sub = submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            const pref = sub.preferences || {};
            
            // --- 標籤與偏好輸入 ---
            const isPreg = staff.constraints?.isPregnant ? '<span class="badge bg-danger">孕</span>' : '';
            const isBatch = staff.constraints?.canBatch ? '<span class="badge bg-primary">包</span>' : '';
            
            // 偏好設定輸入 (管理者可調)
            let prefInputHtml = '';
            if (staff.constraints?.canBatch) {
                // 包班：選擇 E 或 N
                prefInputHtml = `
                    <select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="batch" style="font-size:0.75rem;">
                        <option value="">無</option>
                        <option value="E" ${pref.batch==='E'?'selected':''}>小夜</option>
                        <option value="N" ${pref.batch==='N'?'selected':''}>大夜</option>
                    </select>`;
            } else {
                // 非包班：顯示 P1, P2 (簡化顯示)
                prefInputHtml = `
                    <div class="d-flex gap-1">
                        <select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="priority1" style="width:45px; font-size:0.75rem;">
                            <option>-</option><option value="D" ${pref.priority1==='D'?'selected':''}>D</option><option value="E" ${pref.priority1==='E'?'selected':''}>E</option><option value="N" ${pref.priority1==='N'?'selected':''}>N</option>
                        </select>
                        <select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="priority2" style="width:45px; font-size:0.75rem;">
                            <option>-</option><option value="D" ${pref.priority2==='D'?'selected':''}>D</option><option value="E" ${pref.priority2==='E'?'selected':''}>E</option><option value="N" ${pref.priority2==='N'?'selected':''}>N</option>
                        </select>
                    </div>`;
            }

            let rowHtml = `<tr>
                <td class="sticky-col bg-white text-start ps-2 fw-bold" style="z-index:10; width:120px;">
                    <div class="text-truncate" style="max-width:110px;">${staff.name}</div>
                </td>
                <td class="sticky-col bg-light text-start ps-1 align-middle" style="z-index:10; left:120px; width:150px;">
                    <div class="d-flex align-items-center gap-1 mb-1">${isPreg}${isBatch}</div>
                    ${prefInputHtml}
                </td>`;
            
            for(let d=1; d<=daysInMonth; d++) {
                const val = wishes[d];
                let cellContent = val === 'M_OFF' ? 'OFF' : (val || '');
                let style = '';
                if (val === 'M_OFF') style = 'background-color: #cff4fc; color: #055160;';
                else if (val === 'OFF') style = 'background-color: #ffe8cc; color: #fd7e14;';
                else if (this.shiftTypes[val]) style = `background-color: ${this.shiftTypes[val].bg}40; color: black;`;
                
                rowHtml += `<td style="${style} cursor:context-menu;" oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})">${cellContent}</td>`;
            }
            return rowHtml + '</tr>';
        }).join('');

        // 綁定輸入事件
        document.querySelectorAll('.pref-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const uid = e.target.dataset.uid;
                const type = e.target.dataset.type;
                if (!this.currentSchedule.submissions[uid]) this.currentSchedule.submissions[uid] = { preferences: {} };
                if (!this.currentSchedule.submissions[uid].preferences) this.currentSchedule.submissions[uid].preferences = {};
                this.currentSchedule.submissions[uid].preferences[type] = e.target.value;
            });
        });
    }

    updateFooterStats(schedule, daysInMonth) {
        const tfoot = document.getElementById('review-tfoot');
        let html = `<tr>
            <td class="sticky-col bg-light fw-bold text-end pe-2" colspan="2" style="z-index:20;">每日 OFF 計數</td>`;
        
        for(let d=1; d<=daysInMonth; d++) {
            let count = 0;
            Object.values(schedule.submissions).forEach(sub => {
                if (sub.wishes && (sub.wishes[d] === 'OFF' || sub.wishes[d] === 'M_OFF')) {
                    count++;
                }
            });
            html += `<td class="fw-bold ${count>0?'text-danger':''}">${count}</td>`;
        }
        html += '</tr>';
        tfoot.innerHTML = html;
    }

    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.contextMenuTarget = { uid, day };
        const menu = document.getElementById('shift-context-menu');
        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        const { uid, day } = this.contextMenuTarget;
        if (!uid || !day || !this.currentSchedule) return;
        const submissions = this.currentSchedule.submissions;
        if (!submissions[uid]) submissions[uid] = { wishes: {} };
        if (!submissions[uid].wishes) submissions[uid].wishes = {};

        if (type === null) delete submissions[uid].wishes[day];
        else submissions[uid].wishes[day] = (type === 'OFF' ? 'M_OFF' : type);

        const daysInMonth = new Date(this.currentSchedule.year, this.currentSchedule.month, 0).getDate();
        this.renderReviewBody(this.currentSchedule, daysInMonth);
        this.updateFooterStats(this.currentSchedule, daysInMonth);
        document.getElementById('shift-context-menu').style.display = 'none';
    }

    async saveReview() {
        const btn = document.getElementById('btn-save-review');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 處理中...';

        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, this.currentSchedule.submissions);

            // 同步至排班表
            const assignments = {};
            this.reviewStaffList.forEach(s => { assignments[s.uid] = {}; });
            Object.entries(this.currentSchedule.submissions).forEach(([uid, sub]) => {
                if (assignments[uid] && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([day, val]) => {
                        assignments[uid][day] = (val === 'M_OFF' ? 'OFF' : val);
                    });
                }
            });

            await ScheduleService.updateAllAssignments(
                this.currentSchedule.unitId, this.currentSchedule.year, this.currentSchedule.month, assignments
            );

            alert("✅ 儲存成功！");
            this.reviewModal.hide();

            if (confirm("是否立即前往排班作業？")) {
                window.location.hash = `/schedule/edit?unitId=${this.currentSchedule.unitId}&year=${this.currentSchedule.year}&month=${this.currentSchedule.month}`;
            }
        } catch(e) {
            console.error(e);
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存';
        }
    }

    async deletePreSchedule(id) {
        if(!confirm("確定刪除此預班表？")) return;
        await PreScheduleService.deletePreSchedule(id);
        this.loadList(this.targetUnitId);
    }
}
