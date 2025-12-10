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
        
        // 審核用
        this.reviewStaffList = []; 
        this.currentReviewId = null; 
        
        this.modal = null;
        this.searchModal = null;
        this.reviewModal = null;

        this.isEditMode = false;
        this.editingScheduleId = null;
    }

    async render() {
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

        return `
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

                <div class="modal fade" id="pre-modal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header bg-light">
                                <h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5>
                                <button class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="pre-form">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="chk-use-defaults" checked>
                                            <label class="form-check-label small" for="chk-use-defaults">設為預設值 (迄日為當月15日)</label>
                                        </div>
                                        <button type="button" class="btn btn-sm btn-outline-info" id="btn-import-last">
                                            <i class="fas fa-history"></i> 帶入上月設定
                                        </button>
                                    </div>

                                    <div class="row g-2 align-items-center mb-3 bg-light p-2 rounded">
                                        <div class="col-md-3">
                                            <label class="small fw-bold">預班月份</label>
                                            <input type="month" id="edit-month" class="form-control form-control-sm" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">開放日期 (起)</label>
                                            <input type="date" id="edit-open" class="form-control form-control-sm" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">截止日期 (迄)</label>
                                            <input type="date" id="edit-close" class="form-control form-control-sm" required>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-check form-switch mt-4">
                                                <input class="form-check-input" type="checkbox" id="edit-showNames">
                                                <label class="form-check-label small fw-bold" for="edit-showNames">顯示預班者姓名</label>
                                            </div>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-sliders-h"></i> 限制參數</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-3">
                                            <label class="small fw-bold">預班上限 (含假)</label>
                                            <input type="number" id="edit-maxOff" class="form-control form-control-sm" value="8">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold text-danger">假日上限</label>
                                            <input type="number" id="edit-maxHoliday" class="form-control form-control-sm" value="2">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold text-success">每日保留人數</label>
                                            <input type="number" id="edit-reserved" class="form-control form-control-sm" value="0" min="0">
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-users-cog"></i> 每日各班人力限制 (Min/Max)</h6>
                                    <div id="group-limits-container" class="mb-3"></div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                                        <span><i class="fas fa-user-check"></i> 參與人員 (<span id="staff-count">0</span>)</span>
                                        <button type="button" class="btn btn-sm btn-outline-primary" id="btn-open-search">
                                            <i class="fas fa-plus"></i> 新增人員
                                        </button>
                                    </h6>
                                    
                                    <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                                        <table class="table table-sm table-hover align-middle mb-0 text-center small">
                                            <thead class="table-light sticky-top">
                                                <tr>
                                                    <th class="text-start ps-3">姓名</th>
                                                    <th>職編</th>
                                                    <th>職級</th>
                                                    <th>狀態</th>
                                                    <th width="120">預班組別</th>
                                                    <th>操作</th>
                                                </tr>
                                            </thead>
                                            <tbody id="staff-list-tbody"></tbody>
                                        </table>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="search-modal" tabindex="-1" style="z-index: 1060;">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header bg-primary text-white">
                                <h5 class="modal-title">搜尋並加入人員</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="input-group mb-3">
                                    <input type="text" id="staff-search-input" class="form-control" placeholder="輸入姓名或員工編號...">
                                    <button class="btn btn-secondary" type="button" id="btn-do-search"><i class="fas fa-search"></i></button>
                                </div>
                                <div class="list-group" id="search-results-list" style="max-height: 300px; overflow-y: auto;">
                                    <div class="text-center text-muted p-3">請輸入關鍵字搜尋</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="review-modal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-fullscreen">
                        <div class="modal-content">
                            <div class="modal-header bg-primary text-white">
                                <h5 class="modal-title"><i class="fas fa-th"></i> 預班總表審核</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-0 d-flex flex-column">
                                <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
                                    <div class="d-flex align-items-center">
                                        <div class="me-3 border-end pe-3">
                                            <span class="badge me-1 text-white" style="background-color: #fd7e14;">橘色: 一般使用</span>
                                            <span class="badge me-1 text-white" style="background-color: #6f42c1;">紫色: 管理者</span>
                                        </div>
                                        <div>
                                            <span class="badge bg-danger me-1">紅底: 超額</span>
                                            <span class="badge bg-warning text-dark me-1">黃底: 假日</span>
                                            <small class="text-muted"><i class="fas fa-mouse-pointer"></i> 點擊: 代填(紫) / 取消</small>
                                        </div>
                                    </div>
                                    <button class="btn btn-primary btn-sm" id="btn-save-review"><i class="fas fa-save"></i> 儲存變更</button>
                                </div>
                                <div class="table-responsive flex-grow-1">
                                    <table class="table table-bordered table-sm text-center table-hover mb-0" style="font-size: 0.9rem;" id="review-table">
                                        <thead class="table-light sticky-top" style="z-index: 1020;" id="review-thead"></thead>
                                        <tbody id="review-tbody"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        this.searchModal = new bootstrap.Modal(document.getElementById('search-modal'));
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));

        const unitSelect = document.getElementById('unit-select');
        window.routerPage = this;

        unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null));
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        
        document.getElementById('btn-open-search').addEventListener('click', () => {
            document.getElementById('staff-search-input').value = '';
            document.getElementById('search-results-list').innerHTML = '<div class="text-center text-muted p-3">請輸入關鍵字搜尋</div>';
            this.searchModal.show();
        });
        document.getElementById('btn-do-search').addEventListener('click', () => this.searchStaff());
        document.getElementById('staff-search-input').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') { e.preventDefault(); this.searchStaff(); }
        });

        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());

        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
        document.getElementById('chk-use-defaults').addEventListener('change', (e) => { if(e.target.checked) this.setDefaultDates(); });
        document.getElementById('edit-month').addEventListener('change', () => { if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates(); });

        if (unitSelect.options.length > 0 && unitSelect.value) {
            this.loadList(unitSelect.value);
        }
    }

    async loadList(uid) {
        if (!uid) return;
        this.targetUnitId = uid;
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><span class="spinner-border spinner-border-sm"></span></td></tr>';

        try {
            this.preSchedules = await PreScheduleService.getPreSchedulesList(uid);
            if (this.preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">目前無預班表</td></tr>';
                return;
            }
            tbody.innerHTML = this.preSchedules.map((p, index) => {
                const count = p.staffIds ? p.staffIds.length : Object.keys(p.submissions || {}).length;
                const status = this.getStatusText(p.status);
                return `
                    <tr>
                        <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td><small>${p.settings?.openDate} ~ ${p.settings?.closeDate}</small></td>
                        <td><span class="badge bg-light text-dark border">${count} 人</span></td>
                        <td>${status}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.openReview('${p.id}')">
                                <i class="fas fa-th"></i> 審核
                            </button>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${index})">
                                <i class="fas fa-cog"></i> 設定
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>`;
            }).join('');
        } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>'; }
    }

    getStatusText(s) {
        if(s === 'open') return '<span class="badge bg-success">開放中</span>';
        if(s === 'closed') return '<span class="badge bg-secondary">已截止</span>';
        return '<span class="badge bg-warning text-dark">準備中</span>';
    }

    setDefaultDates() {
        const monthStr = document.getElementById('edit-month').value;
        if (!monthStr) return;
        const [y, m] = monthStr.split('-').map(Number);
        
        const today = new Date().toISOString().split('T')[0];
        const closeDate = new Date(y, m - 1, 15).toISOString().split('T')[0];
        
        document.getElementById('edit-open').value = today;
        document.getElementById('edit-close').value = closeDate;
    }

    // ============================================================
    //  ✅ 審核總表邏輯 (支援顏色區分)
    // ============================================================
    async openReview(scheduleId) {
        this.currentReviewId = scheduleId;
        const schedule = this.preSchedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        // 1. 準備資料
        const year = schedule.year;
        const month = schedule.month;
        const daysInMonth = new Date(year, month, 0).getDate();
        const settings = schedule.settings || {};
        const submissions = schedule.submissions || {}; 
        
        // 讀取人員
        const allStaff = await userService.getUsersByUnit(this.targetUnitId);
        
        // Filter & Sort
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid));
        this.reviewStaffList.sort((a, b) => {
            const roleScore = (r) => (r === 'HN' ? 2 : (r === 'AHN' ? 1 : 0));
            return roleScore(b.rank) - roleScore(a.rank) || a.staffId.localeCompare(b.staffId);
        });

        // 2. 表頭
        let theadHtml = '<tr><th class="sticky-col bg-light" style="min-width:180px; left:0; z-index:1030;">人員 / 日期</th>';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month-1, d);
            const isWeekend = date.getDay()===0 || date.getDay()===6;
            theadHtml += `<th class="${isWeekend?'bg-warning text-dark':''}" style="min-width:40px;">${d}</th>`;
        }
        theadHtml += '</tr>';
        document.getElementById('review-thead').innerHTML = theadHtml;

        // 3. 內容 (支援雙色)
        const tbody = document.getElementById('review-tbody');
        let tbodyHtml = '';
        const dailyOffCounts = new Array(daysInMonth + 1).fill(0);

        this.reviewStaffList.forEach(staff => {
            const userSub = submissions[staff.uid] || {};
            const wishes = userSub.wishes || {};
            
            let rowHtml = `<tr>
                <td class="sticky-col bg-white text-start ps-3 border-end" style="left:0; z-index:1020;">
                    <div class="d-flex justify-content-between align-items-center">
                        <span><strong>${staff.name}</strong> <small class="text-muted">(${staff.rank})</small></span>
                        <span class="badge bg-light text-dark border">${Object.keys(wishes).length}</span>
                    </div>
                </td>`;
            
            for(let d=1; d<=daysInMonth; d++) {
                const val = wishes[d]; // 'OFF' or 'M_OFF' or undefined
                const isOff = val === 'OFF' || val === 'M_OFF';
                
                if(isOff) dailyOffCounts[d]++;
                
                let cellStyle = 'cursor:pointer;';
                let label = '';

                // ✅ 顏色判斷邏輯
                if (val === 'OFF') {
                    cellStyle += 'background-color: #fd7e14; color: white;'; // 橘色 (使用者)
                    label = 'OFF';
                } else if (val === 'M_OFF') {
                    cellStyle += 'background-color: #6f42c1; color: white;'; // 紫色 (管理者)
                    label = 'OFF'; // 顯示文字還是 OFF，但顏色不同
                }

                rowHtml += `<td class="review-cell" 
                                onclick="window.routerPage.toggleReviewCell('${staff.uid}', ${d})"
                                id="cell-${staff.uid}-${d}"
                                style="${cellStyle}">
                                ${label}
                            </td>`;
            }
            rowHtml += '</tr>';
            tbodyHtml += rowHtml;
        });

        // 4. 底部超額統計
        const limit = Math.ceil((this.reviewStaffList.length - (settings.reservedStaff||0)) * 0.4); 

        let footerHtml = '<tr class="fw-bold bg-light"><td class="sticky-col bg-light border-end" style="left:0;">每日休假總數</td>';
        for(let d=1; d<=daysInMonth; d++) {
            const count = dailyOffCounts[d];
            const isOver = count > limit;
            footerHtml += `<td class="${isOver ? 'bg-danger text-white' : ''}">${count}</td>`;
        }
        footerHtml += '</tr>';
        
        tbody.innerHTML = tbodyHtml + footerHtml;
        this.reviewModal.show();
    }

    // ✅ 點擊切換邏輯
    toggleReviewCell(uid, day) {
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule.submissions) schedule.submissions = {};
        if(!schedule.submissions[uid]) schedule.submissions[uid] = { wishes: {}, name: '' };
        
        const wishes = schedule.submissions[uid].wishes || {};
        
        // 邏輯：有值 (無論橘紫) -> 清除；無值 -> 紫色
        if (wishes[day]) {
            delete wishes[day];
        } else {
            wishes[day] = 'M_OFF'; // 管理者強制加入，使用專屬代碼
        }
        schedule.submissions[uid].wishes = wishes;

        // UI 更新
        const cell = document.getElementById(`cell-${uid}-${day}`);
        if (wishes[day] === 'M_OFF') {
            cell.style.backgroundColor = '#6f42c1'; // 紫色
            cell.style.color = 'white';
            cell.innerText = 'OFF';
        } else {
            cell.style.backgroundColor = ''; // 清除背景
            cell.style.color = '';
            cell.innerText = '';
        }
    }

    async saveReview() {
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule) return;

        const btn = document.getElementById('btn-save-review');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';
        
        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, schedule.submissions);
            alert("✅ 審核結果已儲存");
            this.reviewModal.hide();
            this.loadList(this.targetUnitId);
        } catch(e) {
            console.error(e);
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存變更';
        }
    }

    async openModal(index = null) {
        if (!this.targetUnitId) { alert("請先選擇單位"); return; }
        
        document.getElementById('pre-form').reset();
        this.isEditMode = (index !== null);
        
        try {
            this.unitData = await UnitService.getUnitById(this.targetUnitId);
            if (!this.unitData) throw new Error("單位資料讀取失敗");
        } catch(e) { alert(e.message); return; }

        const groups = this.unitData.groups || [];

        if (this.isEditMode) {
            const data = this.preSchedules[index];
            this.editingScheduleId = data.id;
            document.getElementById('modal-title').textContent = "編輯預班表";
            document.getElementById('edit-month').value = `${data.year}-${String(data.month).padStart(2,'0')}`;
            document.getElementById('edit-month').disabled = true; 
            
            const s = data.settings || {};
            document.getElementById('edit-open').value = s.openDate || '';
            document.getElementById('edit-close').value = s.closeDate || '';
            document.getElementById('edit-maxOff').value = s.maxOffDays || 8;
            document.getElementById('edit-maxHoliday').value = s.maxHoliday || 2;
            document.getElementById('edit-reserved').value = s.reservedStaff || 0;
            document.getElementById('edit-showNames').checked = !!s.showOtherNames;
            document.getElementById('chk-use-defaults').checked = false;

            const currentUnitStaff = await userService.getUsersByUnit(this.targetUnitId);
            const savedStaffIds = data.staffIds || [];
            const savedSettings = data.staffSettings || {};

            this.selectedStaff = currentUnitStaff.filter(u => savedStaffIds.includes(u.uid)).map(s => ({
                uid: s.uid, 
                name: s.name, 
                rank: s.rank, 
                staffId: s.staffId,
                isPregnant: s.constraints?.isPregnant, 
                canBatch: s.constraints?.canBatch,
                tempGroup: savedSettings[s.uid]?.group || s.group || ''
            }));
            
            this.renderGroupInputs(groups, s.groupLimits || {});

        } else {
            document.getElementById('modal-title').textContent = "新增預班表";
            document.getElementById('edit-month').disabled = false;
            
            const today = new Date();
            const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            document.getElementById('edit-month').value = nextMonth.toISOString().slice(0, 7);
            
            if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates();
            
            this.renderGroupInputs(groups, {});
            
            const staff = await userService.getUsersByUnit(this.targetUnitId);
            this.selectedStaff = staff.map(s => ({ 
                uid: s.uid, 
                name: s.name, 
                rank: s.rank, 
                staffId: s.staffId, 
                isPregnant: s.constraints?.isPregnant,
                canBatch: s.constraints?.canBatch,
                tempGroup: s.group || '' 
            }));
        }

        this.renderStaffList(groups);
        this.modal.show();
    }

    renderGroupInputs(groups, values = {}) {
        const container = document.getElementById('group-limits-container');
        if (groups.length === 0) {
            container.innerHTML = '<div class="text-muted small">無組別</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-bordered table-sm text-center mb-0 align-middle">
                    <thead class="table-light">
                        <tr>
                            <th>組別</th>
                            <th>每班至少</th>
                            <th>小夜至少</th>
                            <th>大夜至少</th>
                            <th>小夜最多</th>
                            <th>大夜最多</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map(g => {
                            const v = values[g] || {};
                            return `
                            <tr>
                                <td class="fw-bold bg-light">${g}</td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-d" data-group="${g}" value="${v.minD??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-e" data-group="${g}" value="${v.minE??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-n" data-group="${g}" value="${v.minN??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-max-e" data-group="${g}" value="${v.maxE??''}" placeholder="不限"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-max-n" data-group="${g}" value="${v.maxN??''}" placeholder="不限"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    renderStaffList(groups) {
        const tbody = document.getElementById('staff-list-tbody');
        document.getElementById('staff-count').textContent = this.selectedStaff.length;
        const groupOpts = `<option value="">(無)</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');

        tbody.innerHTML = this.selectedStaff.map((u, idx) => `
            <tr>
                <td class="text-start ps-3 fw-bold">${u.name}</td>
                <td><small>${u.staffId || '-'}</small></td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                <td>
                    ${u.isPregnant ? '<span class="badge bg-danger">孕</span>' : ''}
                    ${u.canBatch ? '<span class="badge bg-success">包</span>' : ''}
                </td>
                <td>
                    <select class="form-select form-select-sm py-0 staff-group-select" 
                            onchange="window.routerPage.updateStaffGroup(${idx}, this.value)">
                        ${groupOpts.replace(`value="${u.tempGroup}"`, `value="${u.tempGroup}" selected`)}
                    </select>
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.routerPage.removeStaff(${idx})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    updateStaffGroup(idx, val) { this.selectedStaff[idx].tempGroup = val; }
    removeStaff(idx) { this.selectedStaff.splice(idx, 1); this.renderStaffList(this.unitData.groups || []); }

    async searchStaff() {
        const keyword = document.getElementById('staff-search-input').value.trim();
        const container = document.getElementById('search-results-list');
        if (!keyword) return;

        container.innerHTML = '<div class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> 搜尋中...</div>';

        try {
            const results = await userService.searchUsers(keyword);
            if (results.length === 0) {
                container.innerHTML = '<div class="text-center text-muted p-3">無結果</div>';
                return;
            }

            container.innerHTML = results.map(u => {
                const isAdded = this.selectedStaff.some(s => s.uid === u.uid);
                return `
                    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isAdded ? 'disabled bg-light' : ''}"
                        onclick="window.routerPage.addStaffFromSearch('${u.uid}', '${u.name}', '${u.rank||''}', '${u.staffId||''}', '${u.group||''}', ${u.constraints?.isPregnant}, ${u.constraints?.canBatch})">
                        <div>
                            <strong>${u.name}</strong> <small class="text-muted">(${u.staffId || ''})</small><br>
                            <small class="text-muted">${u.unitId === this.targetUnitId ? '本單位' : '其他單位'}</small>
                        </div>
                        ${isAdded ? '<span class="badge bg-secondary">已加入</span>' : '<span class="badge bg-primary"><i class="fas fa-plus"></i></span>'}
                    </button>
                `;
            }).join('');
        } catch(e) { console.error(e); container.innerHTML = '<div class="text-danger p-3">搜尋失敗</div>'; }
    }

    addStaffFromSearch(uid, name, rank, staffId, group, isPregnant, canBatch) {
        this.selectedStaff.push({ 
            uid, name, rank, staffId, 
            tempGroup: group,
            isPregnant: !!isPregnant,
            canBatch: !!canBatch
        });
        this.searchModal.hide();
        this.renderStaffList(this.unitData.groups || []);
    }

    async importLastMonthSettings() {
        const currentMonthStr = document.getElementById('edit-month').value;
        if (!currentMonthStr) { alert("請先選擇預班月份"); return; }
        
        const [y, m] = currentMonthStr.split('-').map(Number);
        let prevY = y, prevM = m - 1;
        if (prevM === 0) { prevM = 12; prevY -= 1; }

        const lastSchedule = await PreScheduleService.getPreSchedule(this.targetUnitId, prevY, prevM);
        
        if (!lastSchedule) { alert("⚠️ 找不到上個月的預班表，無法帶入。"); return; }

        const s = lastSchedule.settings || {};
        document.getElementById('edit-maxOff').value = s.maxOffDays || 8;
        document.getElementById('edit-maxHoliday').value = s.maxHoliday || 2;
        document.getElementById('edit-reserved').value = s.reservedStaff || 0;
        if(s.showOtherNames !== undefined) document.getElementById('edit-showNames').checked = s.showOtherNames;
        
        const gl = s.groupLimits || {};
        const groups = this.unitData.groups || [];

        groups.forEach(g => {
            let v = gl[g] || { minD:0, minE:0, minN:0, maxE:'', maxN:'' };
            const row = document.querySelector(`.g-min-d[data-group="${g}"]`)?.closest('tr');
            if(row) {
                row.querySelector('.g-min-d').value = v.minD ?? 0;
                row.querySelector('.g-min-e').value = v.minE ?? 0;
                row.querySelector('.g-min-n').value = v.minN ?? 0;
                row.querySelector('.g-max-e').value = v.maxE ?? '';
                row.querySelector('.g-max-n').value = v.maxN ?? '';
            }
        });
        alert("✅ 設定已帶入");
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true; 
        
        const monthStr = document.getElementById('edit-month').value;
        const [year, month] = monthStr.split('-').map(Number);

        const groupLimits = {};
        document.querySelectorAll('.g-min-d').forEach(input => {
            const g = input.dataset.group;
            const row = input.closest('tr');
            groupLimits[g] = {
                minD: parseInt(row.querySelector('.g-min-d').value) || 0,
                minE: parseInt(row.querySelector('.g-min-e').value) || 0,
                minN: parseInt(row.querySelector('.g-min-n').value) || 0,
                maxE: row.querySelector('.g-max-e').value ? parseInt(row.querySelector('.g-max-e').value) : null,
                maxN: row.querySelector('.g-max-n').value ? parseInt(row.querySelector('.g-max-n').value) : null
            };
        });

        const staffSettings = {};
        this.selectedStaff.forEach(s => staffSettings[s.uid] = { group: s.tempGroup });

        const data = {
            unitId: this.targetUnitId,
            year, month,
            settings: {
                openDate: document.getElementById('edit-open').value,
                closeDate: document.getElementById('edit-close').value,
                maxOffDays: parseInt(document.getElementById('edit-maxOff').value),
                maxHoliday: parseInt(document.getElementById('edit-maxHoliday').value),
                reservedStaff: parseInt(document.getElementById('edit-reserved').value) || 0,
                showOtherNames: document.getElementById('edit-showNames').checked,
                groupLimits: groupLimits
            },
            staffIds: this.selectedStaff.map(s => s.uid),
            staffSettings: staffSettings,
            status: 'open'
        };

        try {
            if (this.isEditMode) {
                await PreScheduleService.updatePreScheduleSettings(this.editingScheduleId, data);
            } else {
                const exists = await PreScheduleService.checkPreScheduleExists(this.targetUnitId, year, month);
                if (exists) throw new Error("該月份預班表已存在！");
                await PreScheduleService.createPreSchedule(data);
            }
            alert("✅ 儲存成功");
            this.modal.hide();
            this.loadList(this.targetUnitId);
        } catch (e) {
            alert("失敗: " + e.message);
        } finally {
            btn.disabled = false;
        }
    }

    async deletePreSchedule(id) {
        if(confirm("確定刪除？")) { 
            await PreScheduleService.deletePreSchedule(id); 
            this.loadList(this.targetUnitId); 
        }
    }
}
