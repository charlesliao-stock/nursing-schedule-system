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

        // 1. 主畫面
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

        // 2. 右鍵選單
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

        // 3. 設定 Modal (完整 HTML)
        const settingsModal = `
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
        `;

        // 4. 搜尋 Modal (完整 HTML)
        const searchModal = `
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
        `;

        // 5. 審核 Modal (完整 HTML)
        const reviewModal = `
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

        return mainLayout + contextMenu + settingsModal + searchModal + reviewModal;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        this.searchModal = new bootstrap.Modal(document.getElementById('search-modal'));
        window.routerPage = this;

        // 綁定主畫面事件
        const unitSelect = document.getElementById('unit-select');
        unitSelect.addEventListener('change', (e) => this.loadList(e.target.value));
        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null));
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        // 搜尋功能
        document.getElementById('btn-open-search').addEventListener('click', () => {
            document.getElementById('staff-search-input').value = '';
            document.getElementById('search-results-list').innerHTML = '<div class="text-center text-muted p-3">請輸入關鍵字搜尋</div>';
            this.searchModal.show();
        });
        document.getElementById('btn-do-search').addEventListener('click', () => this.searchStaff());
        document.getElementById('staff-search-input').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') { e.preventDefault(); this.searchStaff(); }
        });

        // 輔助功能
        document.getElementById('btn-import-last').addEventListener('click', () => this.importLastMonthSettings());
        document.getElementById('chk-use-defaults').addEventListener('change', (e) => { if(e.target.checked) this.setDefaultDates(); });
        document.getElementById('edit-month').addEventListener('change', () => { if(document.getElementById('chk-use-defaults').checked) this.setDefaultDates(); });

        // 關閉右鍵選單 (修復 null 錯誤)
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('shift-context-menu');
            if(menu && !e.target.closest('#shift-context-menu')) {
                menu.style.display = 'none';
            }
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

            const now = new Date().toISOString().split('T')[0];

            tbody.innerHTML = this.preSchedules.map((p, index) => {
                const open = p.settings?.openDate || '';
                const close = p.settings?.closeDate || '';
                
                // 狀態判斷
                let statusBadge = '<span class="badge bg-warning text-dark">未開放</span>';
                if (p.status === 'closed') {
                    statusBadge = '<span class="badge bg-secondary">已關閉</span>';
                } else if (now >= open && now <= close) {
                    statusBadge = '<span class="badge bg-success">進行中</span>';
                } else if (now > close) {
                    statusBadge = '<span class="badge bg-secondary">已關閉</span>'; // 過期自動視為關閉
                }

                const count = p.staffIds ? p.staffIds.length : 0;

                return `
                    <tr>
                        <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td><small>${open} ~ ${close}</small></td>
                        <td><span class="badge bg-light text-dark border">${count} 人</span></td>
                        <td>${statusBadge}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.openReview('${p.id}')">審核</button>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openModal(${index})">設定</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')">刪除</button>
                        </td>
                    </tr>`;
            }).join('');
        } catch (e) { 
            console.error(e); 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>'; 
        }
    }

    // =========================================================
    //  設定 (Create/Edit)
    // =========================================================
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
                uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId,
                isPregnant: s.constraints?.isPregnant, canBatch: s.constraints?.canBatch,
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
                uid: s.uid, name: s.name, rank: s.rank, staffId: s.staffId, 
                isPregnant: s.constraints?.isPregnant, canBatch: s.constraints?.canBatch, tempGroup: s.group || '' 
            }));
        }

        this.renderStaffList(groups);
        this.modal.show();
    }

    renderGroupInputs(groups, values = {}) {
        const container = document.getElementById('group-limits-container');
        if (groups.length === 0) { container.innerHTML = '<div class="text-muted small">無組別</div>'; return; }
        container.innerHTML = `<div class="table-responsive"><table class="table table-bordered table-sm text-center mb-0 align-middle"><thead class="table-light"><tr><th>組別</th><th>每班至少</th><th>小夜至少</th><th>大夜至少</th><th>小夜最多</th><th>大夜最多</th></tr></thead><tbody>${groups.map(g => {
            const v = values[g] || {};
            return `<tr><td class="fw-bold bg-light">${g}</td><td><input type="number" class="form-control form-control-sm text-center g-min-d" data-group="${g}" value="${v.minD??0}" min="0"></td><td><input type="number" class="form-control form-control-sm text-center g-min-e" data-group="${g}" value="${v.minE??0}" min="0"></td><td><input type="number" class="form-control form-control-sm text-center g-min-n" data-group="${g}" value="${v.minN??0}" min="0"></td><td><input type="number" class="form-control form-control-sm text-center g-max-e" data-group="${g}" value="${v.maxE??''}" placeholder="不限"></td><td><input type="number" class="form-control form-control-sm text-center g-max-n" data-group="${g}" value="${v.maxN??''}" placeholder="不限"></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }

    renderStaffList(groups) {
        const tbody = document.getElementById('staff-list-tbody');
        document.getElementById('staff-count').textContent = this.selectedStaff.length;
        const groupOpts = `<option value="">(無)</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');
        tbody.innerHTML = this.selectedStaff.map((u, idx) => `<tr><td class="text-start ps-3 fw-bold">${u.name}</td><td><small>${u.staffId || '-'}</small></td><td><span class="badge bg-light text-dark border">${u.rank || '-'}</span></td><td>${u.isPregnant ? '<span class="badge bg-danger">孕</span>' : ''}${u.canBatch ? '<span class="badge bg-success">包</span>' : ''}</td><td><select class="form-select form-select-sm py-0 staff-group-select" onchange="window.routerPage.updateStaffGroup(${idx}, this.value)">${groupOpts.replace(`value="${u.tempGroup}"`, `value="${u.tempGroup}" selected`)}</select></td><td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window.routerPage.removeStaff(${idx})"><i class="fas fa-trash-alt"></i></button></td></tr>`).join('');
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
            if (results.length === 0) { container.innerHTML = '<div class="text-center text-muted p-3">無結果</div>'; return; }
            container.innerHTML = results.map(u => {
                const isAdded = this.selectedStaff.some(s => s.uid === u.uid);
                return `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isAdded ? 'disabled bg-light' : ''}" onclick="window.routerPage.addStaffFromSearch('${u.uid}', '${u.name}', '${u.rank||''}', '${u.staffId||''}', '${u.group||''}', ${u.constraints?.isPregnant}, ${u.constraints?.canBatch})"><div><strong>${u.name}</strong> <small class="text-muted">(${u.staffId || ''})</small><br><small class="text-muted">${u.unitId === this.targetUnitId ? '本單位' : '其他單位'}</small></div>${isAdded ? '<span class="badge bg-secondary">已加入</span>' : '<span class="badge bg-primary"><i class="fas fa-plus"></i></span>'}</button>`;
            }).join('');
        } catch(e) { console.error(e); }
    }

    addStaffFromSearch(uid, name, rank, staffId, group, isPregnant, canBatch) {
        this.selectedStaff.push({ uid, name, rank, staffId, tempGroup: group, isPregnant: !!isPregnant, canBatch: !!canBatch });
        this.searchModal.hide();
        this.renderStaffList(this.unitData.groups || []);
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save'); btn.disabled = true; 
        const monthStr = document.getElementById('edit-month').value;
        const [year, month] = monthStr.split('-').map(Number);
        
        const groupLimits = {};
        document.querySelectorAll('.g-min-d').forEach(input => {
            const g = input.dataset.group;
            const row = input.closest('tr');
            groupLimits[g] = {
                minD: parseInt(row.querySelector('.g-min-d').value)||0, minE: parseInt(row.querySelector('.g-min-e').value)||0, minN: parseInt(row.querySelector('.g-min-n').value)||0,
                maxE: row.querySelector('.g-max-e').value ? parseInt(row.querySelector('.g-max-e').value):null, maxN: row.querySelector('.g-max-n').value ? parseInt(row.querySelector('.g-max-n').value):null
            };
        });

        const staffSettings = {};
        this.selectedStaff.forEach(s => staffSettings[s.uid] = { group: s.tempGroup });

        const data = {
            unitId: this.targetUnitId, year, month,
            settings: {
                openDate: document.getElementById('edit-open').value, closeDate: document.getElementById('edit-close').value,
                maxOffDays: parseInt(document.getElementById('edit-maxOff').value), maxHoliday: parseInt(document.getElementById('edit-maxHoliday').value),
                reservedStaff: parseInt(document.getElementById('edit-reserved').value)||0, showOtherNames: document.getElementById('edit-showNames').checked,
                groupLimits: groupLimits
            },
            staffIds: this.selectedStaff.map(s => s.uid), staffSettings: staffSettings, status: 'open'
        };

        try {
            if (this.isEditMode) { await PreScheduleService.updatePreScheduleSettings(this.editingScheduleId, data); } 
            else { 
                const exists = await PreScheduleService.checkPreScheduleExists(this.targetUnitId, year, month);
                if (exists) throw new Error("該月份預班表已存在！");
                await PreScheduleService.createPreSchedule(data); 
            }
            alert("✅ 儲存成功"); this.modal.hide(); this.loadList(this.targetUnitId);
        } catch (e) { alert("失敗: " + e.message); } finally { btn.disabled = false; }
    }

    async deletePreSchedule(id) { if(confirm("確定刪除？")) { await PreScheduleService.deletePreSchedule(id); this.loadList(this.targetUnitId); } }
    async importLastMonthSettings() { alert("功能保留"); }
    setDefaultDates() {
        const monthStr = document.getElementById('edit-month').value;
        if (!monthStr) return;
        const [y, m] = monthStr.split('-').map(Number);
        const today = new Date().toISOString().split('T')[0];
        const closeDate = new Date(y, m - 1, 15).toISOString().split('T')[0];
        document.getElementById('edit-open').value = today;
        document.getElementById('edit-close').value = closeDate;
    }

    // =========================================================
    //  審核邏輯 (完整保留)
    // =========================================================
    async openReview(scheduleId) {
        this.currentReviewId = scheduleId;
        const schedule = this.preSchedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        const unitName = document.getElementById('unit-select').options[document.getElementById('unit-select').selectedIndex].text;
        document.getElementById('review-modal-title').innerHTML = `<i class="fas fa-th"></i> 預班審核 - ${unitName} (${schedule.year}年${schedule.month}月)`;

        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const allStaff = await userService.getUsersByUnit(this.targetUnitId);
        
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid))
            .sort((a, b) => {
                const roleScore = (r) => (r === 'HN' ? 2 : (r === 'AHN' ? 1 : 0));
                return roleScore(b.rank) - roleScore(a.rank) || a.staffId.localeCompare(b.staffId);
            });

        let thead = '<tr><th class="sticky-col bg-light text-start ps-3" style="min-width:120px; left:0; z-index:1030;">人員</th>';
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
            const prefs = userSub.preferences || {}; 

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
}
