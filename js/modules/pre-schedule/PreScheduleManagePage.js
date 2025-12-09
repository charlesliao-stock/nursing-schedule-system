import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;     // 單位基本資料 (含 groups)
        this.selectedStaff = [];  // 暫存參與名單 (含臨時組別)
        this.modal = null;
    }

    async render() {
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        // 準備單位選項
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
                    <div class="modal-dialog modal-lg"> <div class="modal-content">
                            <div class="modal-header bg-light">
                                <h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5>
                                <button class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="pre-form">
                                    
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="chk-use-defaults" checked>
                                            <label class="form-check-label small" for="chk-use-defaults">使用預設日期 (今日起 ~ 當月15日)</label>
                                        </div>
                                        <button type="button" class="btn btn-sm btn-outline-info" id="btn-import-last">
                                            <i class="fas fa-history"></i> 帶入上月設定
                                        </button>
                                    </div>

                                    <div class="card mb-3 border-0 bg-light">
                                        <div class="card-body py-2">
                                            <div class="row g-2 align-items-center">
                                                <div class="col-md-4">
                                                    <label class="small fw-bold">預班月份</label>
                                                    <input type="month" id="edit-month" class="form-control form-control-sm" required>
                                                </div>
                                                <div class="col-md-4">
                                                    <label class="small fw-bold">開放日期 (起)</label>
                                                    <input type="date" id="edit-open" class="form-control form-control-sm" required>
                                                </div>
                                                <div class="col-md-4">
                                                    <label class="small fw-bold">截止日期 (迄)</label>
                                                    <input type="date" id="edit-close" class="form-control form-control-sm" required>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2"><i class="fas fa-sliders-h"></i> 限制參數</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-3">
                                            <label class="small fw-bold">每人可預休(含假)</label>
                                            <input type="number" id="edit-maxOff" class="form-control form-control-sm" value="8">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">其中假日可預休</label>
                                            <input type="number" id="edit-maxHoliday" class="form-control form-control-sm" value="2">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">小夜(E) 上限</label>
                                            <input type="number" id="edit-maxE" class="form-control form-control-sm" placeholder="不限">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="small fw-bold">大夜(N) 上限</label>
                                            <input type="number" id="edit-maxN" class="form-control form-control-sm" placeholder="不限">
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="small fw-bold text-dark">各組每日最少上班人數 (Min Staff)</label>
                                        <div id="group-limits-container" class="d-flex flex-wrap gap-3 p-2 border rounded bg-white">
                                            <span class="text-muted small">請先選擇單位以載入組別...</span>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold border-bottom pb-1 mb-2 d-flex justify-content-between align-items-center">
                                        <span><i class="fas fa-users"></i> 參與人員與組別</span>
                                        <div class="input-group input-group-sm w-auto">
                                            <input type="text" id="staff-search" class="form-control" placeholder="搜尋外部人員...">
                                            <button type="button" class="btn btn-outline-secondary" id="btn-search-staff"><i class="fas fa-plus"></i></button>
                                        </div>
                                    </h6>
                                    
                                    <div class="table-responsive border rounded" style="max-height: 250px;">
                                        <table class="table table-sm table-hover align-middle mb-0 text-center">
                                            <thead class="table-light sticky-top">
                                                <tr>
                                                    <th class="text-start ps-3">姓名</th>
                                                    <th>職級</th>
                                                    <th>本次分組</th>
                                                    <th>操作</th>
                                                </tr>
                                            </thead>
                                            <tbody id="staff-list-tbody"></tbody>
                                        </table>
                                    </div>
                                    <div class="text-end small text-muted mt-1">共 <span id="staff-count">0</span> 人</div>

                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">建立預班表</button>
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
        
        // 全域綁定
        window.routerPage = this;

        unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
        document.getElementById('btn-add').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        
        document.getElementById('btn-search-staff').addEventListener('click', () => this.searchAndAddStaff());
        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());

        // 預設載入列表
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

            tbody.innerHTML = this.preSchedules.map(p => {
                const statusBadge = this.getStatusBadge(p.status, p.settings?.openDate, p.settings?.closeDate);
                // 計算人數 (相容舊資料結構)
                const count = p.staffIds ? p.staffIds.length : (Object.keys(p.submissions || {}).length);
                
                return `
                    <tr>
                        <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td><small>${p.settings?.openDate} ~ ${p.settings?.closeDate}</small></td>
                        <td><span class="badge bg-light text-dark border">${count} 人</span></td>
                        <td>${statusBadge}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>';
        }
    }

    getStatusBadge(status, start, end) {
        const now = new Date().toISOString().split('T')[0];
        if (status === 'closed') return '<span class="badge bg-secondary">已截止</span>';
        if (now < start) return '<span class="badge bg-warning text-dark">準備中</span>';
        if (now > end) return '<span class="badge bg-secondary">已過期</span>';
        return '<span class="badge bg-success">開放中</span>';
    }

    async openModal() {
        if (!this.targetUnitId) { alert("請先選擇單位"); return; }
        
        document.getElementById('pre-form').reset();
        
        // 1. 設定日期預設值
        const today = new Date();
        const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const y = nextMonthDate.getFullYear();
        const m = nextMonthDate.getMonth() + 1;
        
        document.getElementById('edit-month').value = `${y}-${String(m).padStart(2,'0')}`;
        
        // 預設: 建立日(今天) ~ 當月15日
        // 注意: 若 "當月15日" 已經過了，邏輯可能要調整，但依照需求：
        const endDay = new Date(today.getFullYear(), today.getMonth(), 15);
        // 若今天已經超過15號，截止日可能要設為下個月15號？這裡先照需求「當月15日」
        // 但為了 UX，若今天 > 15號，預設截止日改為下個月15號比較合理。
        // 這裡實作：截止日 = 下個月的 15 號 (配合預班月份)
        const closeDate = new Date(y, m - 1, 15); 
        
        document.getElementById('edit-open').value = today.toISOString().split('T')[0];
        document.getElementById('edit-close').value = closeDate.toISOString().split('T')[0];

        // 2. 載入單位資料與人員
        try {
            const [unit, staff] = await Promise.all([
                UnitService.getUnitById(this.targetUnitId),
                userService.getUsersByUnit(this.targetUnitId)
            ]);
            
            this.unitData = unit;
            
            // 轉換人員格式，加入 tempGroup 屬性
            this.selectedStaff = staff.map(s => ({
                uid: s.uid,
                name: s.name,
                rank: s.rank,
                group: s.group || '', // 原始組別
                tempGroup: s.group || '' // 本次預班組別 (預設同原始)
            }));

            this.renderGroupInputs();
            this.renderStaffList();
            this.modal.show();

        } catch (e) {
            console.error(e);
            alert("讀取單位資料失敗");
        }
    }

    // 渲染各組最低人力輸入框
    renderGroupInputs() {
        const container = document.getElementById('group-limits-container');
        const groups = this.unitData.groups || [];
        
        if (groups.length === 0) {
            container.innerHTML = '<span class="text-muted small">此單位未設定組別，無須設定組別限制。</span>';
            return;
        }

        container.innerHTML = groups.map(g => `
            <div class="d-flex align-items-center bg-light border rounded px-2 py-1">
                <label class="mb-0 small fw-bold me-2">${g}組:</label>
                <input type="number" class="form-control form-control-sm group-min-input text-center p-0" 
                       data-group="${g}" value="0" min="0" style="width: 40px;">
                <span class="ms-1 small text-muted">人</span>
            </div>
        `).join('');
    }

    // 渲染人員列表 (含組別下拉選單)
    renderStaffList() {
        const tbody = document.getElementById('staff-list-tbody');
        document.getElementById('staff-count').textContent = this.selectedStaff.length;
        
        // 準備組別選項
        const groups = this.unitData.groups || [];
        const groupOptions = `<option value="">(無)</option>` + 
                             groups.map(g => `<option value="${g}">${g}</option>`).join('');

        tbody.innerHTML = this.selectedStaff.map((u, idx) => `
            <tr>
                <td class="text-start ps-3 fw-bold">${u.name}</td>
                <td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td>
                <td>
                    <select class="form-select form-select-sm py-0 staff-group-select" 
                            onchange="window.routerPage.updateStaffGroup(${idx}, this.value)">
                        ${groupOptions.replace(`value="${u.tempGroup}"`, `value="${u.tempGroup}" selected`)}
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

    updateStaffGroup(idx, newGroup) {
        this.selectedStaff[idx].tempGroup = newGroup;
    }

    removeStaff(idx) {
        this.selectedStaff.splice(idx, 1);
        this.renderStaffList();
    }

    async searchAndAddStaff() {
        const keyword = document.getElementById('staff-search').value.trim();
        if (!keyword) return;
        
        const results = await userService.searchUsers(keyword);
        if (results.length === 0) { alert("找不到使用者"); return; }
        
        const user = results[0];
        if (this.selectedStaff.find(s => s.uid === user.uid)) { alert("已在名單中"); return; }
        
        // 加入名單 (預設無組別)
        this.selectedStaff.push({
            uid: user.uid,
            name: user.name,
            rank: user.rank,
            group: user.group || '',
            tempGroup: '' // 外部人員預設無組別
        });
        
        this.renderStaffList();
        document.getElementById('staff-search').value = '';
    }

    // 帶入上月設定
    async importLastMonthSettings() {
        const currentMonthStr = document.getElementById('edit-month').value;
        const [y, m] = currentMonthStr.split('-').map(Number);
        
        // 計算上個月
        let prevY = y, prevM = m - 1;
        if (prevM === 0) { prevM = 12; prevY -= 1; }

        const lastSchedule = await PreScheduleService.getPreSchedule(this.targetUnitId, prevY, prevM);
        
        if (!lastSchedule) { alert("找不到上個月的預班表"); return; }

        const s = lastSchedule.settings || {};
        
        // 填入限制
        document.getElementById('edit-maxOff').value = s.maxOffDays || 8;
        document.getElementById('edit-maxHoliday').value = s.maxHoliday || 2;
        document.getElementById('edit-maxE').value = s.maxE || '';
        document.getElementById('edit-maxN').value = s.maxN || '';

        // 填入各組低限
        const groupMins = s.groupMin || {};
        document.querySelectorAll('.group-min-input').forEach(input => {
            const g = input.dataset.group;
            if (groupMins[g] !== undefined) input.value = groupMins[g];
        });

        alert("✅ 已帶入上月參數設定 (人員名單未變更)");
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '建立中...';

        const monthStr = document.getElementById('edit-month').value;
        const [year, month] = monthStr.split('-').map(Number);

        // 收集組別限制
        const groupConstraints = {};
        document.querySelectorAll('.group-min-input').forEach(input => {
            const val = input.value === '' ? -1 : parseInt(input.value); // -1 or 0 means no limit? 需求說是預設不限，這裡假設 0 為不限或最小0
            groupConstraints[input.dataset.group] = val;
        });

        // 整理人員名單 (包含本次的組別設定)
        // 需存入 DB 的結構: staffIds (array), staffSettings (map: uid -> { group: 'A' })
        const staffSettings = {};
        this.selectedStaff.forEach(s => {
            staffSettings[s.uid] = { group: s.tempGroup };
        });

        const data = {
            unitId: this.targetUnitId,
            year, month,
            settings: {
                openDate: document.getElementById('edit-open').value,
                closeDate: document.getElementById('edit-close').value,
                maxOffDays: parseInt(document.getElementById('edit-maxOff').value),
                maxHoliday: parseInt(document.getElementById('edit-maxHoliday').value),
                maxE: document.getElementById('edit-maxE').value ? parseInt(document.getElementById('edit-maxE').value) : null,
                maxN: document.getElementById('edit-maxN').value ? parseInt(document.getElementById('edit-maxN').value) : null,
                groupMin: groupConstraints
            },
            staffIds: this.selectedStaff.map(s => s.uid),
            staffSettings: staffSettings, // 新增：儲存本次的人員組別
            status: 'open'
        };

        const res = await PreScheduleService.createPreSchedule(data);
        if (res.success) {
            alert("✅ 建立成功");
            this.modal.hide();
            this.loadList(this.targetUnitId);
        } else {
            alert("建立失敗: " + res.error);
        }
        btn.disabled = false;
        btn.innerHTML = '建立預班表';
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
