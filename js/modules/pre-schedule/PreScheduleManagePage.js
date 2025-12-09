import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;
        this.unitStaff = []; // 本單位人員
        this.selectedStaff = []; // 最終參與預班的人員清單
        this.modal = null;
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
            // Fallback
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
                    <div class="card-body py-2 d-flex align-items-center gap-2">
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
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5>
                                <button class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="pre-form">
                                    <h6 class="text-primary fw-bold mb-3 border-bottom pb-2">基本設定</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">預班月份</label>
                                            <input type="month" id="edit-month" class="form-control" required>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">開放日期 (起)</label>
                                            <input type="date" id="edit-open" class="form-control" required>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">截止日期 (迄)</label>
                                            <input type="date" id="edit-close" class="form-control" required>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">休假限制</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">每人可預班天數 (含假日)</label>
                                            <input type="number" id="edit-maxOff" class="form-control" value="8" min="0">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">其中假日可預班天數</label>
                                            <input type="number" id="edit-maxHoliday" class="form-control" value="2" min="0">
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">人力限制</h6>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">每日小夜 (E) 上限</label>
                                            <input type="number" id="edit-maxE" class="form-control" value="3">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">每日大夜 (N) 上限</label>
                                            <input type="number" id="edit-maxN" class="form-control" value="2">
                                        </div>
                                    </div>
                                    
                                    <div id="group-limits-container" class="bg-light p-3 rounded mb-3">
                                        <label class="form-label fw-bold mb-2">各組每日最少上班人數：</label>
                                        <div id="group-inputs" class="row g-2">
                                            <div class="text-muted small">載入中...</div>
                                        </div>
                                    </div>

                                    <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4 d-flex justify-content-between">
                                        <span>參與人員名單</span>
                                        <span class="badge bg-secondary" id="staff-count">0 人</span>
                                    </h6>
                                    
                                    <div class="input-group mb-2">
                                        <input type="text" id="staff-search" class="form-control" placeholder="搜尋並加入外部人員 (姓名/Email)...">
                                        <button type="button" class="btn btn-outline-primary" id="btn-search-staff">加入</button>
                                    </div>

                                    <div class="border rounded p-2" style="max-height: 200px; overflow-y: auto;">
                                        <div id="staff-list-container"></div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">建立預班</button>
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
        
        // 搜尋人員按鈕
        document.getElementById('btn-search-staff').addEventListener('click', () => this.searchAndAddStaff());

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
            // 取得該單位的預班表列表
            this.preSchedules = await PreScheduleService.getPreSchedulesList(uid);
            
            if (this.preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">目前無預班表</td></tr>';
                return;
            }

            tbody.innerHTML = this.preSchedules.map(p => {
                const statusBadge = this.getStatusBadge(p.status, p.settings?.openDate, p.settings?.closeDate);
                const participantCount = p.staffIds ? p.staffIds.length : (Object.keys(p.submissions || {}).length || 0);
                
                return `
                    <tr>
                        <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td>${p.settings?.openDate} ~ ${p.settings?.closeDate}</td>
                        <td><span class="badge bg-light text-dark border">${participantCount} 人</span></td>
                        <td>${statusBadge}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="alert('編輯功能請直接在預班管理介面操作')"><i class="fas fa-edit"></i></button>
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
        
        // 設定預設月份 (下個月)
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        document.getElementById('edit-month').value = nextMonth.toISOString().slice(0, 7);
        
        // 預設日期
        const y = nextMonth.getFullYear();
        const m = nextMonth.getMonth() + 1;
        document.getElementById('edit-open').value = `${y}-${String(m).padStart(2,'0')}-01`;
        document.getElementById('edit-close').value = `${y}-${String(m).padStart(2,'0')}-05`;

        // 載入單位資料 (組別、人員)
        try {
            const [unit, staff] = await Promise.all([
                UnitService.getUnitById(this.targetUnitId),
                userService.getUsersByUnit(this.targetUnitId)
            ]);
            
            this.unitData = unit;
            this.unitStaff = staff; // 原始名單
            this.selectedStaff = [...staff]; // 預設全員參加

            // 1. 渲染組別限制輸入框
            const groupContainer = document.getElementById('group-inputs');
            if (unit.groups && unit.groups.length > 0) {
                groupContainer.innerHTML = unit.groups.map(g => `
                    <div class="col-md-6 d-flex align-items-center">
                        <label class="me-2 mb-0" style="min-width:80px;">${g}組：</label>
                        <input type="number" class="form-control form-control-sm group-min-input" data-group="${g}" value="1" min="0">
                        <span class="ms-1 small text-muted">人</span>
                    </div>
                `).join('');
            } else {
                groupContainer.innerHTML = '<div class="text-muted small">此單位未設定組別</div>';
            }

            // 2. 渲染人員名單
            this.renderStaffList();

            this.modal.show();

        } catch (e) {
            console.error(e);
            alert("讀取單位資料失敗");
        }
    }

    renderStaffList() {
        const container = document.getElementById('staff-list-container');
        document.getElementById('staff-count').textContent = `${this.selectedStaff.length} 人`;
        
        container.innerHTML = this.selectedStaff.map((u, idx) => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-1">
                <div>
                    <span class="fw-bold">${u.name}</span> 
                    <small class="text-muted">(${u.group || '未分組'})</small>
                </div>
                <button type="button" class="btn btn-sm text-danger" onclick="window.routerPage.removeStaff(${idx})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
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
        
        // 簡單取第一個 (實務上可做選單)
        const user = results[0];
        
        // 檢查是否已在名單
        if (this.selectedStaff.find(s => s.uid === user.uid)) { alert("此人已在名單中"); return; }
        
        this.selectedStaff.push(user);
        this.renderStaffList();
        document.getElementById('staff-search').value = '';
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '建立中...';

        const monthStr = document.getElementById('edit-month').value; // YYYY-MM
        const [year, month] = monthStr.split('-').map(Number);

        // 收集組別限制
        const groupConstraints = {};
        document.querySelectorAll('.group-min-input').forEach(input => {
            groupConstraints[input.dataset.group] = parseInt(input.value) || 0;
        });

        const data = {
            unitId: this.targetUnitId,
            year,
            month,
            settings: {
                openDate: document.getElementById('edit-open').value,
                closeDate: document.getElementById('edit-close').value,
                maxOffDays: parseInt(document.getElementById('edit-maxOff').value),
                maxHoliday: parseInt(document.getElementById('edit-maxHoliday').value),
                maxE: parseInt(document.getElementById('edit-maxE').value),
                maxN: parseInt(document.getElementById('edit-maxN').value),
                groupMin: groupConstraints
            },
            staffIds: this.selectedStaff.map(s => s.uid), // 只存 ID
            status: 'open'
        };

        try {
            const res = await PreScheduleService.createPreSchedule(data);
            if (res.success) {
                alert("✅ 預班表建立成功");
                this.modal.hide();
                this.loadList(this.targetUnitId);
            } else {
                alert("建立失敗: " + res.error);
            }
        } catch (e) {
            console.error(e);
            alert("系統錯誤");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '建立預班';
        }
    }

    async deletePreSchedule(id) {
        // 檢查是否有人提交
        const hasSubmissions = await PreScheduleService.checkHasSubmissions(id);
        
        let msg = "確定要刪除此預班表嗎？";
        if (hasSubmissions) {
            msg = "⚠️ 警告：已經有人員提交預班需求！\n刪除將會遺失所有已提交的資料。\n\n確定要繼續刪除嗎？";
        }

        if (confirm(msg)) {
            await PreScheduleService.deletePreSchedule(id);
            this.loadList(this.targetUnitId);
        }
    }
}
