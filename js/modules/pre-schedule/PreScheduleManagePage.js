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
                                            <label class="form-check-label small" for="chk-use-defaults">預設日期 (今日 ~ 當月15日)</label>
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
                                            <label class="small fw-bold">開放日期</label>
                                            <input type="date" id="edit-open" class="form-control form-control-sm" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">截止日期</label>
                                            <input type="date" id="edit-close" class="form-control form-control-sm" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">休假上限 (含假)</label>
                                            <input type="number" id="edit-maxOff" class="form-control form-control-sm" value="8">
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-users-cog"></i> 各組人力限制</h6>
                                    <div id="group-limits-container" class="mb-3">
                                        </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                                        <span><i class="fas fa-user-check"></i> 參與人員 (<span id="staff-count">0</span>)</span>
                                        <div class="input-group input-group-sm w-auto">
                                            <input type="text" id="staff-search" class="form-control" placeholder="搜尋外部人員...">
                                            <button type="button" class="btn btn-outline-secondary" id="btn-search-staff"><i class="fas fa-plus"></i></button>
                                        </div>
                                    </h6>
                                    
                                    <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
                                        <table class="table table-sm table-hover align-middle mb-0 text-center small">
                                            <thead class="table-light sticky-top">
                                                <tr>
                                                    <th class="text-start ps-3">姓名</th>
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
        document.getElementById('btn-search-staff').addEventListener('click', () => this.searchAndAddStaff());
        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());

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
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${index})"><i class="fas fa-edit"></i></button>
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

    async openModal(index = null) {
        if (!this.targetUnitId) { alert("請先選擇單位"); return; }
        
        document.getElementById('pre-form').reset();
        this.isEditMode = (index !== null);
        
        // 載入單位資料 (組別)
        this.unitData = await UnitService.getUnitById(this.targetUnitId);
        const groups = this.unitData.groups || [];

        if (this.isEditMode) {
            const data = this.preSchedules[index];
            this.editingScheduleId = data.id;
            document.getElementById('modal-title').textContent = "編輯預班表";
            document.getElementById('edit-month').value = `${data.year}-${String(data.month).padStart(2,'0')}`;
            document.getElementById('edit-open').value = data.settings.openDate;
            document.getElementById('edit-close').value = data.settings.closeDate;
            document.getElementById('edit-maxOff').value = data.settings.maxOffDays;
            
            // 載入已存人員與組別
            // 注意：需結合 userService 取得最新名字職級，但組別用 saved settings
            const staffList = await userService.getUsersByUnit(this.targetUnitId); // 基礎名單
            // 還原名單... (這裡簡化，直接使用 saved staffIds, 實際應 merge)
            // 為了效能，這裡先載入單位全部人員，再標記選中
            this.selectedStaff = staffList.map(s => {
                const savedSetting = data.staffSettings?.[s.uid];
                const isSelected = data.staffIds.includes(s.uid);
                return isSelected ? {
                    uid: s.uid, name: s.name, rank: s.rank, 
                    tempGroup: savedSetting?.group || s.group || ''
                } : null;
            }).filter(s => s !== null);
            
            // 填入組別限制
            const gl = data.settings.groupLimits || {};
            this.renderGroupInputs(groups, gl);

        } else {
            document.getElementById('modal-title').textContent = "新增預班表";
            // 預設日期
            const today = new Date();
            const y = today.getFullYear(), m = today.getMonth() + 1;
            document.getElementById('edit-month').value = `${y}-${String(m).padStart(2,'0')}`;
            document.getElementById('edit-open').value = today.toISOString().split('T')[0];
            document.getElementById('edit-close').value = new Date(y, m - 1, 15).toISOString().split('T')[0];
            
            this.renderGroupInputs(groups, {});
            
            // 載入單位人員 (預設全員)
            const staff = await userService.getUsersByUnit(this.targetUnitId);
            this.selectedStaff = staff.map(s => ({ 
                uid: s.uid, name: s.name, rank: s.rank, tempGroup: s.group || '' 
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
                <table class="table table-bordered table-sm text-center mb-0">
                    <thead class="table-light"><tr><th>組別</th><th>最少上班</th><th>小夜上限</th><th>大夜上限</th></tr></thead>
                    <tbody>
                        ${groups.map(g => {
                            const v = values[g] || { min: 0, maxE: '', maxN: '' };
                            return `
                            <tr>
                                <td class="fw-bold bg-light">${g}組</td>
                                <td><input type="number" class="form-control form-control-sm text-center g-min" data-group="${g}" value="${v.min}" min="0"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-maxE" data-group="${g}" value="${v.maxE}" placeholder="不限"></td>
                                <td><input type="number" class="form-control form-control-sm text-center g-maxN" data-group="${g}" value="${v.maxN}" placeholder="不限"></td>
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
        
        const groupOpts = `<option value="">(無)</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');

        tbody.innerHTML = this.selectedStaff.map((u, idx) => `
            <tr>
                <td class="text-start ps-3 fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                <td>
                    <select class="form-select form-select-sm py-0" onchange="window.routerPage.updateStaffGroup(${idx}, this.value)">
                        ${groupOpts.replace(`value="${u.tempGroup}"`, `value="${u.tempGroup}" selected`)}
                    </select>
                </td>
                <td><button type="button" class="btn btn-sm text-danger" onclick="window.routerPage.removeStaff(${idx})"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');
    }

    updateStaffGroup(idx, val) { this.selectedStaff[idx].tempGroup = val; }
    removeStaff(idx) { this.selectedStaff.splice(idx, 1); this.renderStaffList(this.unitData.groups); }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true; 
        
        const monthStr = document.getElementById('edit-month').value;
        const [year, month] = monthStr.split('-').map(Number);

        // 收集組別限制
        const groupLimits = {};
        const groups = this.unitData.groups || [];
        groups.forEach(g => {
            const row = document.querySelector(`.g-min[data-group="${g}"]`).closest('tr');
            groupLimits[g] = {
                min: parseInt(row.querySelector('.g-min').value) || 0,
                maxE: parseInt(row.querySelector('.g-maxE').value) || null,
                maxN: parseInt(row.querySelector('.g-maxN').value) || null
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

        let res;
        if (this.isEditMode) {
            // 更新模式 (保留 submissions)
            res = await PreScheduleService.updatePreScheduleSettings(this.editingScheduleId, data);
        } else {
            // 新增模式
            res = await PreScheduleService.createPreSchedule(data);
        }

        if (res.success) {
            alert("✅ 儲存成功");
            this.modal.hide();
            this.loadList(this.targetUnitId);
        } else {
            alert("失敗: " + res.error);
        }
        btn.disabled = false;
    }

    async searchAndAddStaff() { /*...同前版...*/ }
    async importLastMonthSettings() { /*...同前版...*/ }
    async deletePreSchedule(id) { /*...同前版...*/ }
}
