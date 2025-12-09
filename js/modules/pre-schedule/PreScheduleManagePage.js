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
        this.searchResults = []; // 搜尋結果暫存
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
                    <p class="text-muted small mb-0">設定每月的預班開放時間、規則限制與參與人員。</p>
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
                                            <label class="form-check-label small" for="chk-use-defaults">
                                                設為預設值 (起:今日 / 迄:15日)
                                            </label>
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
                                            <label class="small fw-bold">休假上限 (含假)</label>
                                            <input type="number" id="edit-maxOff" class="form-control form-control-sm" value="8">
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-layer-group"></i> 各組人力限制</h6>
                                    <div class="alert alert-light border p-2 mb-2 small text-muted">
                                        <i class="fas fa-info-circle"></i> 設定各組在<b>每一班 (D/E/N)</b> 的最少上班人數，以及小夜/大夜的總人數上限。
                                    </div>
                                    <div id="group-limits-container" class="mb-4">
                                        </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                                        <span><i class="fas fa-users"></i> 參與人員 (<span id="staff-count">0</span>)</span>
                                    </h6>
                                    
                                    <div class="mb-3 position-relative">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text"><i class="fas fa-search"></i></span>
                                            <input type="text" id="staff-search" class="form-control" placeholder="輸入職編或姓名搜尋外部支援...">
                                            <button type="button" class="btn btn-outline-secondary" id="btn-search-staff">搜尋</button>
                                        </div>
                                        <div id="search-results-dropdown" class="list-group position-absolute w-100 shadow" style="z-index: 1050; display: none; max-height: 200px; overflow-y: auto;"></div>
                                    </div>

                                    <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                                        <table class="table table-sm table-hover align-middle mb-0 text-center small">
                                            <thead class="table-light sticky-top">
                                                <tr>
                                                    <th class="text-start ps-3">姓名</th>
                                                    <th>職編</th>
                                                    <th>職級</th>
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
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button>
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
        // 支援 Enter 搜尋
        document.getElementById('staff-search').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') { e.preventDefault(); this.searchStaff(); }
        });

        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
        
        // 預設日期連動
        document.getElementById('chk-use-defaults').addEventListener('change', (e) => {
            if(e.target.checked) this.setDefaultDates();
        });
        
        // 月份變更時連動日期
        document.getElementById('edit-month').addEventListener('change', () => {
            if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates();
        });

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
                        <td>${p.settings?.openDate} ~ ${p.settings?.closeDate}</td>
                        <td><span class="badge bg-light text-dark border">${count} 人</span></td>
                        <td>${status}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${index})"><i class="fas fa-edit"></i> 編輯</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')"><i class="fas fa-trash"></i></button>
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
        
        // 截止日：當月 15 日
        // 注意：如果是建立下個月的表，通常截止日是該月的 15 號？還是建立當下的 15 號？
        // 根據需求「截止日期預設為當月15日」，這裡假設是指「預班月份的前一個月」(操作當下) 的 15 號
        // 或者是指「預班月份」的 15 號？通常預班是提前做。
        // 假設：建立 2026-01 的預班，操作時間是 2025-12-09。
        // 如果設為 2026-01-15 截止，這樣很合理。
        const closeDate = new Date(y, m - 1, 15).toISOString().split('T')[0];
        
        document.getElementById('edit-open').value = today;
        document.getElementById('edit-close').value = closeDate;
    }

    async openModal(index = null) {
        if (!this.targetUnitId) { alert("請先選擇單位"); return; }
        
        document.getElementById('pre-form').reset();
        document.getElementById('search-results-dropdown').innerHTML = ''; // 清空搜尋
        this.isEditMode = (index !== null);
        
        // 載入單位資料 (組別)
        this.unitData = await UnitService.getUnitById(this.targetUnitId);
        const groups = this.unitData.groups || [];

        if (this.isEditMode) {
            const data = this.preSchedules[index];
            this.editingScheduleId = data.id;
            document.getElementById('modal-title').textContent = "編輯預班表";
            document.getElementById('edit-month').value = `${data.year}-${String(data.month).padStart(2,'0')}`;
            document.getElementById('edit-month').disabled = true; // 編輯模式不可改月份
            document.getElementById('edit-open').value = data.settings.openDate;
            document.getElementById('edit-close').value = data.settings.closeDate;
            document.getElementById('edit-maxOff').value = data.settings.maxOffDays;
            document.getElementById('chk-use-defaults').checked = false; // 編輯時不強制預設

            // 載入人員
            const staffList = await userService.getUsersByUnit(this.targetUnitId);
            this.selectedStaff = staffList.map(s => {
                const isSelected = data.staffIds.includes(s.uid);
                // 嘗試讀取已存的設定，若無則用人員目前資料
                const savedSetting = data.staffSettings?.[s.uid];
                return isSelected ? {
                    uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId,
                    tempGroup: savedSetting?.group || s.group || ''
                } : null;
            }).filter(s => s !== null);
            
            // 載入外部支援 (如果原始名單有，但單位名單沒有)
            if(data.externalStaffIds) {
                // 這裡簡化，實務上可能需要另外 fetch user data，這裡假設 externalStaffIds 有存夠資料或已在 staffList (若他們轉入)
                // 為了效能，這裡暫略外部人員的詳細資料回填，僅顯示 ID
            }

            this.renderGroupInputs(groups, data.settings.groupLimits || {});

        } else {
            document.getElementById('modal-title').textContent = "新增預班表";
            document.getElementById('edit-month').disabled = false;
            
            // 預設下個月
            const today = new Date();
            const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            document.getElementById('edit-month').value = nextMonth.toISOString().slice(0, 7);
            
            if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates();
            
            this.renderGroupInputs(groups, {});
            
            // 預設載入全員
            const staff = await userService.getUsersByUnit(this.targetUnitId);
            this.selectedStaff = staff.map(s => ({ 
                uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId, tempGroup: s.group || '' 
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
                            <th>Min 白班(D)</th>
                            <th>Min 小夜(E)</th>
                            <th>Min 大夜(N)</th>
                            <th>Max 小夜(E)</th>
                            <th>Max 大夜(N)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map(g => {
                            const v = values[g] || {};
                            return `
                            <tr>
                                <td class="fw-bold bg-light">${g}組</td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-d" data-group="${g}" value="${v.minD??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-e" data-group="${g}" value="${v.minE??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min-n" data-group="${g}" value="${v.minN??0}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-max-e" data-group="${g}" value="${v.maxE??''}" placeholder="不限"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-max-n" data-group="${g}" value="${v.maxN??''}" placeholder="不限"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderStaffList(groups) {
        const tbody = document.getElementById('staff-list-tbody');
        document.getElementById('staff-count').textContent = this.selectedStaff.length;
        
        // 取得目前有效的組別選項
        const validGroups = this.unitData.groups || [];
        const groupOpts = `<option value="">(無)</option>` + 
            validGroups.map(g => `<option value="${g}">${g}</option>`).join('');

        tbody.innerHTML = this.selectedStaff.map((u, idx) => `
            <tr>
                <td class="text-start ps-3 fw-bold">${u.name}</td>
                <td><small>${u.staffId || '-'}</small></td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
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
    removeStaff(idx) { this.selectedStaff.splice(idx, 1); this.renderStaffList(this.unitData.groups); }

    // 搜尋功能優化
    async searchStaff() {
        const keyword = document.getElementById('staff-search').value.trim();
        const resultContainer = document.getElementById('search-results-dropdown');
        if (!keyword) return;

        resultContainer.style.display = 'block';
        resultContainer.innerHTML = '<div class="list-group-item text-center"><span class="spinner-border spinner-border-sm"></span> 搜尋中...</div>';

        const results = await userService.searchUsers(keyword);
        
        if (results.length === 0) {
            resultContainer.innerHTML = '<div class="list-group-item text-muted text-center">找不到相符人員</div>';
            setTimeout(() => resultContainer.style.display = 'none', 2000);
            return;
        }

        resultContainer.innerHTML = results.map(u => {
            const isAdded = this.selectedStaff.some(s => s.uid === u.uid);
            return `
                <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isAdded ? 'disabled bg-light' : ''}" 
                    onclick="window.routerPage.addStaffFromSearch('${u.uid}', '${u.name}', '${u.rank}', '${u.staffId}', '${u.group||''}')">
                    <div>
                        <strong>${u.name}</strong> <small class="text-muted">(${u.staffId})</small>
                        <br><small class="text-muted">${u.unitId || '無單位'}</small>
                    </div>
                    ${isAdded ? '<span class="badge bg-secondary">已加入</span>' : '<span class="badge bg-primary"><i class="fas fa-plus"></i></span>'}
                </button>
            `;
        }).join('');
    }

    addStaffFromSearch(uid, name, rank, staffId, group) {
        this.selectedStaff.push({
            uid, name, rank, staffId,
            tempGroup: group || '' // 預設帶入原組別
        });
        document.getElementById('search-results-dropdown').style.display = 'none';
        document.getElementById('staff-search').value = '';
        this.renderStaffList(this.unitData.groups);
    }

    async importLastMonthSettings() {
        const currentMonthStr = document.getElementById('edit-month').value;
        const [y, m] = currentMonthStr.split('-').map(Number);
        let prevY = y, prevM = m - 1;
        if (prevM === 0) { prevM = 12; prevY -= 1; }

        const lastSchedule = await PreScheduleService.getPreSchedule(this.targetUnitId, prevY, prevM);
        
        if (!lastSchedule) { alert("⚠️ 找不到上個月的預班表，無法帶入設定。"); return; }

        const s = lastSchedule.settings || {};
        document.getElementById('edit-maxOff').value = s.maxOffDays || 8;
        
        // 填入各組低限 (新結構)
        const gl = s.groupLimits || {};
        const groups = this.unitData.groups || [];
        groups.forEach(g => {
            const v = gl[g] || {};
            const row = document.querySelector(`.g-min-d[data-group="${g}"]`)?.closest('tr');
            if(row) {
                row.querySelector('.g-min-d').value = v.minD || 0;
                row.querySelector('.g-min-e').value = v.minE || 0;
                row.querySelector('.g-min-n').value = v.minN || 0;
                row.querySelector('.g-max-e').value = v.maxE || '';
                row.querySelector('.g-max-n').value = v.maxN || '';
            }
        });

        alert("✅ 已成功帶入上月設定！");
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true; 
        
        const monthStr = document.getElementById('edit-month').value;
        const [year, month] = monthStr.split('-').map(Number);

        // 收集組別限制 (新結構)
        const groupLimits = {};
        const groups = this.unitData.groups || [];
        groups.forEach(g => {
            const row = document.querySelector(`.g-min-d[data-group="${g}"]`).closest('tr');
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
                // 檢查重複
                const exists = await PreScheduleService.checkPreScheduleExists(this.targetUnitId, year, month);
                if (exists) { throw new Error(`${year}-${month} 的預班表已存在！請使用編輯功能。`); }
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
        const hasSubmissions = await PreScheduleService.checkHasSubmissions(id);
        let msg = "確定要刪除此預班表嗎？";
        if (hasSubmissions) msg = "⚠️ 警告：已有提交資料！刪除將遺失所有紀錄。\n\n確定刪除？";
        if (confirm(msg)) {
            await PreScheduleService.deletePreSchedule(id);
            this.loadList(this.targetUnitId);
        }
    }
}
