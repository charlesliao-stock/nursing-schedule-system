import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { PreScheduleManageTemplate } from "./templates/PreScheduleManageTemplate.js"; // 引入 Template

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
        // 直接呼叫 Template
        return PreScheduleManageTemplate.renderMain();
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        window.routerPage = this;

        // 初始化右鍵選單內容
        document.getElementById('shift-context-menu').innerHTML = PreScheduleManageTemplate.renderContextMenu(this.shiftTypes);

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
            
            let statusBadge = '<span class="badge bg-secondary">未開始</span>';
            if (isOpen) statusBadge = '<span class="badge bg-success">開放中</span>';
            else if (isClosed) statusBadge = '<span class="badge bg-dark">已截止</span>';

            // 使用 Template 渲染行
            return PreScheduleManageTemplate.renderListItem(item, statusBadge);
        }).join('');
    }

    // --- Modal: 新增/編輯 ---

    async openModal(id = null) {
        // 設定表單預設值
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        // 呼叫 Template 渲染表單
        document.getElementById('pre-form-content').innerHTML = PreScheduleManageTemplate.renderForm(
            nextMonth.getFullYear(), 
            nextMonth.getMonth() + 1,
            nextMonth.getMonth() + 1
        );
        
        this.modal.show();
        const staffTbody = document.getElementById('staff-selection-tbody');
        staffTbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> 載入人員中...</td></tr>';
        
        const unitStaff = await userService.getUnitStaff(this.targetUnitId);
        
        if (id) {
            this.currentEditId = id;
            document.getElementById('modal-title').textContent = "編輯預班表";
            const schedule = this.preSchedules.find(s => s.id === id);
            
            // 回填資料
            document.getElementById('form-year').value = schedule.year;
            document.getElementById('form-month').value = schedule.month;
            document.getElementById('form-open').value = schedule.settings.openDate;
            document.getElementById('form-close').value = schedule.settings.closeDate;
            document.getElementById('form-max-off').value = schedule.settings.maxOffDays;
            document.getElementById('form-max-holiday').value = schedule.settings.maxHoliday || 2;
            document.getElementById('form-reserved').value = schedule.settings.reservedStaff || 0;
            document.getElementById('form-show-names').checked = schedule.settings.showOtherNames;

            // 回填組別限制 (Template)
            document.getElementById('group-constraints-container').innerHTML = 
                PreScheduleManageTemplate.renderGroupConstraints(this.unitGroups, schedule.settings.groupConstraints || {});

            this.workingStaffList = unitStaff.map(s => ({
                ...s,
                selected: schedule.staffIds.includes(s.uid),
                group: (schedule.staffSettings && schedule.staffSettings[s.uid]?.group) || s.group || ''
            }));

        } else {
            this.currentEditId = null;
            document.getElementById('modal-title').textContent = "新增預班表";
            // 預設組別限制 (Template)
            document.getElementById('group-constraints-container').innerHTML = 
                PreScheduleManageTemplate.renderGroupConstraints(this.unitGroups, {});
            
            this.workingStaffList = unitStaff.map(s => ({ ...s, selected: true }));
        }

        this.renderStaffSelectionTable();
        
        document.getElementById('check-all-staff').addEventListener('change', (e) => {
            const checked = e.target.checked;
            this.workingStaffList.forEach(s => s.selected = checked);
            this.renderStaffSelectionTable();
        });
    }

    renderStaffSelectionTable() {
        const tbody = document.getElementById('staff-selection-tbody');
        // 使用 Template 渲染行
        tbody.innerHTML = PreScheduleManageTemplate.renderStaffSelectionRows(this.workingStaffList, this.unitGroups);
    }

    // (邏輯函式保持不變)
    toggleStaffSelection(uid) { const s = this.workingStaffList.find(x => x.uid === uid); if(s) s.selected = !s.selected; }
    updateLocalGroup(uid, val) { const s = this.workingStaffList.find(x => x.uid === uid); if(s) s.group = val; }
    removeStaffFromList(idx) { this.workingStaffList.splice(idx, 1); this.renderStaffSelectionTable(); }

    async handleSearchStaff() {
        const keyword = document.getElementById('search-staff-input').value.trim();
        if(!keyword) return;
        const btn = document.querySelector('#search-staff-input + button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        btn.disabled = true;
        try {
            const results = await userService.searchUsers(keyword);
            const newPeople = results.filter(u => !this.workingStaffList.some(existing => existing.uid === u.uid));
            if (newPeople.length === 0) {
                alert("找不到相符人員，或人員已在清單中");
            } else {
                newPeople.forEach(p => { this.workingStaffList.push({ ...p, selected: true, group: p.group || '' }); });
                this.renderStaffSelectionTable();
                alert(`已加入 ${newPeople.length} 位人員`);
            }
        } catch(e) { console.error(e); alert("搜尋失敗"); } finally { btn.innerHTML = originalText; btn.disabled = false; }
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 處理中...';

        try {
            const selectedStaff = this.workingStaffList.filter(s => s.selected);
            if(selectedStaff.length === 0) throw new Error("至少選擇一位參與人員");

            const staffIds = selectedStaff.map(s => s.uid);
            const staffSettings = {};
            selectedStaff.forEach(s => { staffSettings[s.uid] = { group: s.group }; });

            const groupConstraints = {};
            document.querySelectorAll('.group-constraint').forEach(input => {
                const g = input.dataset.group;
                const field = input.dataset.field;
                const val = parseInt(input.value);
                if (!isNaN(val)) {
                    if (!groupConstraints[g]) groupConstraints[g] = {};
                    groupConstraints[g][field] = val;
                }
            });

            const data = {
                unitId: this.targetUnitId,
                year: parseInt(document.getElementById('form-year').value),
                month: parseInt(document.getElementById('form-month').value),
                staffIds: staffIds,
                staffSettings: staffSettings,
                settings: {
                    openDate: document.getElementById('form-open').value,
                    closeDate: document.getElementById('form-close').value,
                    maxOffDays: parseInt(document.getElementById('form-max-off').value),
                    maxHoliday: parseInt(document.getElementById('form-max-holiday').value),
                    reservedStaff: parseInt(document.getElementById('form-reserved').value),
                    showOtherNames: document.getElementById('form-show-names').checked,
                    groupConstraints: groupConstraints
                },
                status: 'open'
            };

            if (this.currentEditId) {
                await PreScheduleService.updatePreScheduleSettings(this.currentEditId, data);
                alert("✅ 預班表已更新");
            } else {
                const res = await PreScheduleService.createPreSchedule(data);
                if(!res.success) throw new Error(res.error);
                alert("✅ 預班表建立成功！");
            }
            this.modal.hide();
            this.loadList(this.targetUnitId);
        } catch(e) { alert("錯誤: " + e.message); } finally { btn.disabled = false; btn.textContent = "儲存設定"; }
    }

    // --- 審核相關 (邏輯不變，保持原樣) ---
    async openReview(id) {
        this.currentReviewId = id;
        const schedule = this.preSchedules.find(s => s.id === id);
        this.currentSchedule = schedule; 
        if (!schedule) return alert("找不到資料");
        document.getElementById('review-modal-title').textContent = `預班審核 - ${schedule.year}年${schedule.month}月`;
        const allStaff = await userService.getUnitStaff(this.targetUnitId);
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid)).sort((a,b) => (a.rank||'').localeCompare(b.rank||''));
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        
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
            
            const isPreg = staff.constraints?.isPregnant ? '<span class="badge bg-danger">孕</span>' : '';
            const isBatch = staff.constraints?.canBatch ? '<span class="badge bg-primary">包</span>' : '';
            
            let prefInputHtml = '';
            if (staff.constraints?.canBatch) {
                prefInputHtml = `<select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="batch" style="font-size:0.75rem;"><option value="">無</option><option value="E" ${pref.batch==='E'?'selected':''}>小夜</option><option value="N" ${pref.batch==='N'?'selected':''}>大夜</option></select>`;
            } else {
                prefInputHtml = `<div class="d-flex gap-1"><select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="priority1" style="width:45px; font-size:0.75rem;"><option>-</option><option value="D" ${pref.priority1==='D'?'selected':''}>D</option><option value="E" ${pref.priority1==='E'?'selected':''}>E</option><option value="N" ${pref.priority1==='N'?'selected':''}>N</option></select><select class="form-select form-select-xs pref-input" data-uid="${staff.uid}" data-type="priority2" style="width:45px; font-size:0.75rem;"><option>-</option><option value="D" ${pref.priority2==='D'?'selected':''}>D</option><option value="E" ${pref.priority2==='E'?'selected':''}>E</option><option value="N" ${pref.priority2==='N'?'selected':''}>N</option></select></div>`;
            }

            let rowHtml = `<tr><td class="sticky-col bg-white text-start ps-2 fw-bold" style="z-index:10; width:120px;"><div class="text-truncate" style="max-width:110px;">${staff.name}</div></td><td class="sticky-col bg-light text-start ps-1 align-middle" style="z-index:10; left:120px; width:150px;"><div class="d-flex align-items-center gap-1 mb-1">${isPreg}${isBatch}</div>${prefInputHtml}</td>`;
            
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
        let html = `<tr><td class="sticky-col bg-light fw-bold text-end pe-2" colspan="2" style="z-index:20;">每日 OFF 計數</td>`;
        for(let d=1; d<=daysInMonth; d++) {
            let count = 0;
            Object.values(schedule.submissions).forEach(sub => { if (sub.wishes && (sub.wishes[d] === 'OFF' || sub.wishes[d] === 'M_OFF')) count++; });
            html += `<td class="fw-bold ${count>0?'text-danger':''}">${count}</td>`;
        }
        html += '</tr>';
        tfoot.innerHTML = html;
    }

    handleCellRightClick(e, uid, day) { e.preventDefault(); this.contextMenuTarget = { uid, day }; const menu = document.getElementById('shift-context-menu'); menu.style.top = `${e.clientY}px`; menu.style.left = `${e.clientX}px`; menu.style.display = 'block'; }
    applyShiftFromMenu(type) { const { uid, day } = this.contextMenuTarget; if (!uid || !day || !this.currentSchedule) return; const submissions = this.currentSchedule.submissions; if (!submissions[uid]) submissions[uid] = { wishes: {} }; if (!submissions[uid].wishes) submissions[uid].wishes = {}; if (type === null) delete submissions[uid].wishes[day]; else submissions[uid].wishes[day] = (type === 'OFF' ? 'M_OFF' : type); const daysInMonth = new Date(this.currentSchedule.year, this.currentSchedule.month, 0).getDate(); this.renderReviewBody(this.currentSchedule, daysInMonth); this.updateFooterStats(this.currentSchedule, daysInMonth); document.getElementById('shift-context-menu').style.display = 'none'; }
    
    async saveReview() {
        const btn = document.getElementById('btn-save-review');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 處理中...';
        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, this.currentSchedule.submissions);
            const assignments = {};
            this.reviewStaffList.forEach(s => { assignments[s.uid] = {}; });
            Object.entries(this.currentSchedule.submissions).forEach(([uid, sub]) => {
                if (assignments[uid] && sub.wishes) {
                    Object.entries(sub.wishes).forEach(([day, val]) => { assignments[uid][day] = (val === 'M_OFF' ? 'OFF' : val); });
                }
            });
            await ScheduleService.updateAllAssignments(this.currentSchedule.unitId, this.currentSchedule.year, this.currentSchedule.month, assignments);
            alert("✅ 儲存成功！");
            this.reviewModal.hide();
            if (confirm("是否立即前往排班作業？")) { window.location.hash = `/schedule/edit?unitId=${this.currentSchedule.unitId}&year=${this.currentSchedule.year}&month=${this.currentSchedule.month}`; }
        } catch(e) { console.error(e); alert("儲存失敗: " + e.message); } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 儲存'; }
    }

    async deletePreSchedule(id) { if(!confirm("確定刪除此預班表？")) return; await PreScheduleService.deletePreSchedule(id); this.loadList(this.targetUnitId); }
}
