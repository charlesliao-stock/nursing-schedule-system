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
        this.modal = null;
        this.isEditMode = false;
        this.editingScheduleId = null;
    }

    async render() {
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let unitOptions = '<option value="">載入中...</option>';
        let unitSelectDisabled = '';

        try {
            let units = [];
            if (isAdmin) {
                units = await UnitService.getAllUnits();
                unitOptions = `<option value="" disabled selected>請選擇管理單位...</option>` + 
                              units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            } else {
                units = await UnitService.getUnitsByManager(user.uid);
                if(units.length === 0 && user.unitId) {
                    const u = await UnitService.getUnitById(user.unitId);
                    if(u) units.push(u);
                }

                if (units.length > 0) {
                    unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
                } else {
                    unitOptions = '<option value="">無權限</option>';
                    unitSelectDisabled = 'disabled';
                }
            }
        } catch (e) {
            console.error("單位載入失敗", e);
            unitOptions = '<option value="">載入失敗</option>';
        }

        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-calendar-check text-primary me-2"></i> 預班管理與審核</h3>
                    <p class="text-muted small mb-0">設定每月的預班開放時間、規則限制與參與人員。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap"><i class="fas fa-hospital-user me-1"></i>管理單位：</label>
                        <select id="unit-select" class="form-select w-auto fw-bold text-primary" ${unitSelectDisabled}>
                            ${unitOptions}
                        </select>
                        <div class="vr mx-2"></div>
                        <button id="btn-add" class="btn btn-primary w-auto text-nowrap" disabled>
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
                                    <div class="d-flex justify-content-end align-items-center mb-3">
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
                                            <label class="small fw-bold" title="每人總預班天數">預班上限 (含假)</label>
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

                                    <div class="row g-3 mb-3 bg-light p-2 rounded mx-0">
                                        <div class="col-md-6">
                                            <label class="small fw-bold text-primary">夜班種類數限制</label>
                                            <select id="edit-shiftTypes" class="form-select form-select-sm" 
                                                    onchange="window.routerPage.handleTypeLimitChange(this.value)">
                                                <option value="2">2 種 (如: 白/小 或 白/大)</option>
                                                <option value="3">3 種 (如: 白/小/大)</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6 d-flex align-items-center" id="container-allow3">
                                            <div class="form-check form-switch mt-4">
                                                <input class="form-check-input" type="checkbox" id="edit-allow3">
                                                <label class="form-check-label fw-bold" for="edit-allow3">同意同仁自願選擇 3 種班</label>
                                            </div>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-users-cog"></i> 每日各班人力限制 (Min/Max)</h6>
                                    <div id="group-limits-container" class="mb-3"></div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                                        <span><i class="fas fa-user-check"></i> 參與人員 (<span id="staff-count">0</span>)</span>
                                        <div class="input-group input-group-sm w-auto">
                                            <input type="text" id="staff-search" class="form-control" placeholder="搜尋跨單位支援人員...">
                                            <button type="button" class="btn btn-outline-secondary" id="btn-search-staff"><i class="fas fa-search"></i></button>
                                        </div>
                                    </h6>
                                    
                                    <div id="search-results-dropdown" class="list-group position-absolute w-50 shadow" style="z-index: 1060; display: none; right: 20px;"></div>

                                    <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                                        <table class="table table-sm table-hover align-middle mb-0 text-center small">
                                            <thead class="table-light sticky-top">
                                                <tr>
                                                    <th class="text-start ps-3">姓名</th>
                                                    <th>職編</th>
                                                    <th>職級</th>
                                                    <th>屬性</th>
                                                    <th width="150">預班組別</th>
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
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存設定</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        const unitSelect = document.getElementById('unit-select');
        window.routerPage = this;

        unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null));
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-search-staff').addEventListener('click', () => this.searchStaff());
        
        document.getElementById('staff-search').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') { e.preventDefault(); this.searchStaff(); }
        });

        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
        
        document.getElementById('edit-month').addEventListener('change', () => {
            this.setDefaultDates(); 
        });

        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        if (!isAdmin && unitSelect.value) {
            this.loadList(unitSelect.value);
        }
    }

    // ✅ 新增: 處理下拉選單變更，控制開關顯示
    handleTypeLimitChange(val) {
        const container = document.getElementById('container-allow3');
        if (!container) return;
        
        if (val === '3') {
            // 若限制為 3 種，則不需顯示「同意自願 3 種」，因為預設就是 3
            container.style.display = 'none';
        } else {
            // 若限制為 2 種，顯示開關讓管理者決定是否例外開放
            container.style.display = 'flex';
        }
    }

    async loadList(uid) {
        if (!uid) return;
        this.targetUnitId = uid;
        document.getElementById('btn-add').disabled = false;
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><span class="spinner-border spinner-border-sm"></span></td></tr>';

        try {
            this.preSchedules = await PreScheduleService.getPreSchedulesList(uid);
            if (this.preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">此單位目前無預班表</td></tr>';
                return;
            }
            
            const now = new Date().toISOString().split('T')[0];

            tbody.innerHTML = this.preSchedules.map((p, index) => {
                const count = p.staffIds ? p.staffIds.length : 0;
                let statusBadge = '';
                if (now < p.settings.openDate) statusBadge = '<span class="badge bg-secondary">未開放</span>';
                else if (now >= p.settings.openDate && now <= p.settings.closeDate) statusBadge = '<span class="badge bg-success">開放中</span>';
                else statusBadge = '<span class="badge bg-dark">已截止</span>';

                if (p.status === 'closed') statusBadge = '<span class="badge bg-info text-dark">已封存</span>';

                return `
                    <tr>
                        <td class="fw-bold fs-5 text-primary">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td><small>${p.settings?.openDate} ~ ${p.settings?.closeDate}</small></td>
                        <td><span class="badge bg-light text-dark border">${count} 人</span></td>
                        <td>${statusBadge}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.goToEdit('${p.id}')" title="進入大表編輯">
                                <i class="fas fa-table"></i> 預班作業
                            </button>
                            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window.routerPage.openModal(${index})" title="修改設定">
                                <i class="fas fa-cog"></i> 設定
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')" title="刪除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>`;
            }).join('');
        } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>'; }
    }

    goToEdit(id) {
        if (!id) { alert("無效的預班表 ID"); return; }
        window.location.hash = `/pre-schedule/edit?id=${id}`;
    }

    setDefaultDates() {
        const monthStr = document.getElementById('edit-month').value;
        if (!monthStr) return;
        const [y, m] = monthStr.split('-').map(Number);
        
        const today = new Date().toISOString().split('T')[0];
        const closeDateObj = new Date(y, m - 1 - 1, 15); 
        const closeDate = closeDateObj.toISOString().split('T')[0];
        
        if (closeDate < today) {
             const thisMonth15 = new Date(y, m - 1, 15).toISOString().split('T')[0];
             document.getElementById('edit-close').value = thisMonth15;
        } else {
             document.getElementById('edit-close').value = closeDate;
        }
        document.getElementById('edit-open').value = today;
    }

    async openModal(index = null) {
        if (!this.targetUnitId) { alert("請先選擇單位"); return; }
        
        const form = document.getElementById('pre-form');
        if (form) form.reset();
        
        document.getElementById('search-results-dropdown').innerHTML = '';
        this.isEditMode = (index !== null);
        
        try {
            this.unitData = await UnitService.getUnitById(this.targetUnitId);
            if (!this.unitData) throw new Error("單位資料讀取失敗");
        } catch(e) { alert(e.message); return; }

        const groups = this.unitData.groups || [];

        if (this.isEditMode) {
            const data = this.preSchedules[index];
            this.editingScheduleId = data.id;
            document.getElementById('modal-title').textContent = "修改預班設定";
            document.getElementById('edit-month').value = `${data.year}-${String(data.month).padStart(2,'0')}`;
            document.getElementById('edit-month').disabled = true; 
            
            const s = data.settings || {};
            document.getElementById('edit-open').value = s.openDate || '';
            document.getElementById('edit-close').value = s.closeDate || '';
            document.getElementById('edit-maxOff').value = s.maxOffDays || 8;
            document.getElementById('edit-maxHoliday').value = s.maxHoliday || 2;
            document.getElementById('edit-reserved').value = s.reservedStaff || 0;
            document.getElementById('edit-showNames').checked = !!s.showOtherNames;
            
            // 回填新欄位
            const limit = s.shiftTypesLimit || '2';
            document.getElementById('edit-shiftTypes').value = limit;
            document.getElementById('edit-allow3').checked = !!s.allowThreeTypesVoluntary;
            
            // ✅ 初始化開關顯示狀態
            this.handleTypeLimitChange(limit.toString());

            const savedStaffIds = data.staffIds || [];
            const savedSettings = data.staffSettings || {};
            const supportStaffIds = data.supportStaffIds || [];

            const promises = savedStaffIds.map(uid => userService.getUserData(uid));
            const users = await Promise.all(promises);

            this.selectedStaff = users.filter(u => u).map(s => ({
                uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId,
                tempGroup: savedSettings[s.uid]?.group || s.group || '',
                isSupport: supportStaffIds.includes(s.uid) || s.unitId !== this.targetUnitId
            }));
            
            this.renderGroupInputs(groups, s.groupLimits || {});

        } else {
            document.getElementById('modal-title').textContent = "新增預班表";
            document.getElementById('edit-month').disabled = false;
            
            const today = new Date();
            const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            document.getElementById('edit-month').value = nextMonth.toISOString().slice(0, 7);
            
            this.setDefaultDates(); 
            this.renderGroupInputs(groups, {});
            
            // ✅ 新增時，預設為 2 種，顯示開關
            this.handleTypeLimitChange('2');
            
            const staff = await userService.getUsersByUnit(this.targetUnitId);
            this.selectedStaff = staff.map(s => ({ 
                uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId, 
                tempGroup: s.group || '', isSupport: false
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
            <tr class="${u.isSupport ? 'table-warning' : ''}">
                <td class="text-start ps-3 fw-bold">${u.name}</td>
                <td><small>${u.staffId || '-'}</small></td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                <td>${u.isSupport ? '<span class="badge bg-warning text-dark">支援</span>' : '<span class="badge bg-light text-dark border">本單位</span>'}</td>
                <td>
                    <select class="form-select form-select-sm py-0 staff-group-select" 
                            onchange="window.routerPage.updateStaffGroup(${idx}, this.value)">
                        ${groupOpts.replace(`value="${u.tempGroup}"`, `value="${u.tempGroup}" selected`)}
                    </select>
                </td>
                <td>
                    <button type="button" class="btn btn-sm text-danger" onclick="window.routerPage.removeStaff(${idx})">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    updateStaffGroup(idx, val) { this.selectedStaff[idx].tempGroup = val; }
    removeStaff(idx) { this.selectedStaff.splice(idx, 1); this.renderStaffList(this.unitData.groups || []); }

    async searchStaff() {
        const keyword = document.getElementById('staff-search').value.trim();
        const container = document.getElementById('search-results-dropdown');
        if (!keyword) return;

        container.style.display = 'block';
        container.innerHTML = '<div class="list-group-item text-center"><span class="spinner-border spinner-border-sm"></span> 搜尋中...</div>';

        try {
            const results = await userService.searchUsers(keyword);
            if (results.length === 0) {
                container.innerHTML = '<div class="list-group-item text-muted text-center">無結果</div>';
                setTimeout(() => container.style.display = 'none', 1500);
                return;
            }

            container.innerHTML = results.map(u => {
                const isAdded = this.selectedStaff.some(s => s.uid === u.uid);
                return `
                    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isAdded ? 'disabled bg-light' : ''}"
                        onclick="window.routerPage.addStaffFromSearch('${u.uid}', '${u.name}', '${u.rank||''}', '${u.staffId||''}', '${u.group||''}', '${u.unitId}')">
                        <div>
                            <strong>${u.name}</strong> <small class="text-muted">(${u.staffId || ''})</small>
                            <br><small class="text-muted">${u.unitName || '未知單位'}</small>
                        </div>
                        ${isAdded ? '<span class="badge bg-secondary">已加入</span>' : '<span class="badge bg-primary"><i class="fas fa-plus"></i></span>'}
                    </button>
                `;
            }).join('');
        } catch(e) { console.error(e); }
    }

    addStaffFromSearch(uid, name, rank, staffId, group, userUnitId) {
        const isSupport = userUnitId !== this.targetUnitId;
        this.selectedStaff.push({ uid, name, rank, staffId, tempGroup: group, isSupport });
        document.getElementById('search-results-dropdown').style.display = 'none';
        document.getElementById('staff-search').value = '';
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
        
        // 帶入新欄位
        if(s.shiftTypesLimit) {
            document.getElementById('edit-shiftTypes').value = s.shiftTypesLimit;
            // 更新開關顯示
            this.handleTypeLimitChange(s.shiftTypesLimit.toString());
        }
        if(s.allowThreeTypesVoluntary !== undefined) document.getElementById('edit-allow3').checked = s.allowThreeTypesVoluntary;

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

        const supportStaffIds = this.selectedStaff.filter(s => s.isSupport).map(s => s.uid);

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
                // 儲存新設定
                shiftTypesLimit: parseInt(document.getElementById('edit-shiftTypes').value),
                allowThreeTypesVoluntary: document.getElementById('edit-allow3').checked,
                groupLimits: groupLimits
            },
            staffIds: this.selectedStaff.map(s => s.uid),
            staffSettings: staffSettings,
            supportStaffIds: supportStaffIds,
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
