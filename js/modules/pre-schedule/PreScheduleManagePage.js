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
        this.currentSchedule = null; // 暫存當前正在審核的物件
        this.modal = null;
        this.reviewModal = null;
        
        // 用於右鍵選單的操作對象
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
                        <select id="unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-add" class="btn btn-primary ms-auto">
                            <i class="fas fa-plus"></i> 新增預班表
                        </button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <table class="table table-hover align-middle mb-0 text-center">
                            <thead class="table-light">
                                <tr>
                                    <th>月份</th>
                                    <th>開放區間</th>
                                    <th>人數</th>
                                    <th>狀態</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody id="table-body">
                                <tr><td colspan="5" class="py-5 text-muted">請選擇單位以載入資料</td></tr>
                            </tbody>
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
                                    <button class="btn btn-primary btn-sm" id="btn-save-review"><i class="fas fa-save"></i> 儲存變更</button>
                                    <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">關閉</button>
                                </div>
                            </div>
                            <div class="modal-body p-0">
                                <div class="table-responsive h-100">
                                    <table class="table table-bordered table-sm text-center table-hover mb-0" id="review-table">
                                        <thead class="table-light sticky-top" id="review-thead" style="z-index: 10;"></thead>
                                        <tbody id="review-tbody"></tbody>
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
                            <div class="modal-body">
                                <div id="pre-form-content"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary">儲存並發布</button>
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
            
            // Fallback: 如果都不是，嘗試用自己的 unitId
            if (units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
            }

            if (units.length === 0) {
                unitSelect.innerHTML = '<option value="">無管理權限</option>';
                unitSelect.disabled = true;
            } else {
                unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
                unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
                
                // 預設載入第一個
                this.loadList(units[0].unitId);
            }
        } catch (e) {
            console.error(e);
            unitSelect.innerHTML = '<option value="">載入失敗</option>';
        }

        document.getElementById('btn-add').addEventListener('click', () => {
             document.getElementById('pre-form-content').innerHTML = this.getPreFormHtml();
             this.openModal(null);
        });

        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        // 點擊空白處關閉右鍵選單
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('shift-context-menu');
            if(menu && !e.target.closest('#shift-context-menu')) menu.style.display = 'none';
        });
    }

    // 產生新增/編輯表單的 HTML
    getPreFormHtml() {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const y = nextMonth.getFullYear();
        const m = nextMonth.getMonth() + 1;
        const defaultYear = y;
        const defaultMonth = String(m).padStart(2, '0');

        return `
            <form id="pre-schedule-form">
                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2">基本設定</h6>
                <div class="row mb-3">
                    <div class="col-md-3">
                        <label class="form-label fw-bold">年份</label>
                        <input type="number" id="form-year" class="form-control" value="${defaultYear}">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">月份</label>
                        <select id="form-month" class="form-select">
                            ${Array.from({length:12}, (_, i) => `<option value="${i+1}" ${i+1 == m ? 'selected' : ''}>${i+1}月</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">開放日期</label>
                        <input type="date" id="form-open" class="form-control" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">截止日期</label>
                        <input type="date" id="form-close" class="form-control" required>
                    </div>
                </div>

                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">預班限制</h6>
                <div class="row mb-3">
                    <div class="col-md-4">
                        <label class="form-label fw-bold">每人最多預班數 (OFF)</label>
                        <input type="number" id="form-max-off" class="form-control" value="8">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">其中假日上限</label>
                        <input type="number" id="form-max-holiday" class="form-control" value="2">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">保留人力 (每日)</label>
                        <input type="number" id="form-reserved" class="form-control" value="0">
                        <div class="form-text">每天至少需保留多少人不做預班限制</div>
                    </div>
                </div>

                <div class="form-check form-switch mb-3">
                    <input class="form-check-input" type="checkbox" id="form-show-names" checked>
                    <label class="form-check-label" for="form-show-names">允許查看誰已預班 (顯示名字)</label>
                </div>

                <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">參與人員選取</h6>
                <div class="border rounded p-3 bg-light" style="max-height: 300px; overflow-y: auto;">
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="check-all-staff">
                        <label class="form-check-label fw-bold">全選 / 取消全選</label>
                    </div>
                    <div id="staff-checkbox-list" class="row">
                        <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> 載入人員中...</div>
                    </div>
                </div>
            </form>
        `;
    }

    async loadList(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        this.unitData = await UnitService.getUnitById(uid);
        const list = await PreScheduleService.getPreSchedulesList(uid);
        this.preSchedules = list;

        const tbody = document.getElementById('table-body');
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted">目前無預班表</td></tr>';
            return;
        }

        const now = new Date().toISOString().split('T')[0];

        tbody.innerHTML = list.map(item => {
            const isOpen = now >= item.settings.openDate && now <= item.settings.closeDate;
            const isClosed = now > item.settings.closeDate || item.status === 'closed';
            
            let statusBadge = '<span class="badge bg-secondary">未開始</span>';
            if (isOpen) statusBadge = '<span class="badge bg-success">開放中</span>';
            else if (isClosed) statusBadge = '<span class="badge bg-dark">已截止</span>';

            return `
                <tr>
                    <td class="fw-bold">${item.year}-${String(item.month).padStart(2,'0')}</td>
                    <td>${item.settings.openDate} ~ ${item.settings.closeDate}</td>
                    <td>${item.staffIds.length} 人</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="window.routerPage.openReview('${item.id}')">
                            <i class="fas fa-list-check"></i> 審核
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${item.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async openReview(id) {
        this.currentReviewId = id;
        const schedule = this.preSchedules.find(s => s.id === id);
        this.currentSchedule = schedule; // 儲存參考
        
        if (!schedule) return alert("找不到資料");

        document.getElementById('review-modal-title').textContent = 
            `預班審核 - ${schedule.year}年${schedule.month}月 (${this.unitData.unitName})`;

        // 載入人員詳情
        const allStaff = await userService.getUnitStaff(this.targetUnitId);
        // 過濾出有在該次預班名單的人
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid));
        
        // 根據職級排序
        this.reviewStaffList.sort((a,b) => (a.rank||'').localeCompare(b.rank||''));

        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        
        // Render Header
        let theadHtml = '<tr><th class="sticky-col bg-light" style="min-width:120px; z-index:20;">人員</th>';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(schedule.year, schedule.month-1, d);
            const w = date.getDay();
            const isWeekend = (w===0 || w===6);
            theadHtml += `<th class="${isWeekend?'text-danger':''}" style="min-width:40px;">${d}<br><small>${['日','一','二','三','四','五','六'][w]}</small></th>`;
        }
        theadHtml += '</tr>';
        document.getElementById('review-thead').innerHTML = theadHtml;

        this.renderReviewBody(schedule, daysInMonth);
        this.reviewModal.show();
    }

    renderReviewBody(schedule, daysInMonth) {
        const tbody = document.getElementById('review-tbody');
        const submissions = schedule.submissions || {};

        tbody.innerHTML = this.reviewStaffList.map(staff => {
            const sub = submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            
            let rowHtml = `<tr>
                <td class="sticky-col bg-white text-start ps-3 fw-bold" style="z-index:10;">${staff.name} <small class="text-muted">(${staff.staffId})</small></td>`;
            
            for(let d=1; d<=daysInMonth; d++) {
                const val = wishes[d];
                let cellContent = '';
                let style = '';
                let className = 'wish-cell';

                if (val) {
                    cellContent = val === 'M_OFF' ? 'OFF' : val;
                    // 區分員工填寫 vs 管理員代填 (M_OFF)
                    if (val === 'M_OFF') {
                        style = 'background-color: #cff4fc; color: #055160;'; // 藍色 (管理)
                    } else if (val === 'OFF') {
                        style = 'background-color: #ffe8cc; color: #fd7e14;'; // 橘色 (員工)
                    } else if (this.shiftTypes[val]) {
                         // 其他班別 D/E/N
                        style = `background-color: ${this.shiftTypes[val].bg}40; color: black;`;
                    }
                }
                
                // 綁定右鍵事件
                rowHtml += `<td class="${className}" style="${style} cursor:context-menu;" 
                                oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})">
                                ${cellContent}
                            </td>`;
            }
            return rowHtml + '</tr>';
        }).join('');
    }

    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.contextMenuTarget = { uid, day };
        const menu = document.getElementById('shift-context-menu');
        
        // 計算位置避免超出視窗
        let top = e.clientY;
        let left = e.clientX;
        
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        const { uid, day } = this.contextMenuTarget;
        if (!uid || !day || !this.currentSchedule) return;

        const submissions = this.currentSchedule.submissions;
        if (!submissions[uid]) submissions[uid] = { wishes: {} };
        if (!submissions[uid].wishes) submissions[uid].wishes = {};

        if (type === null) {
            delete submissions[uid].wishes[day];
        } else {
            // 若為 OFF，管理者填寫時標記為 M_OFF (Managed OFF) 以示區別
            const val = type === 'OFF' ? 'M_OFF' : type;
            submissions[uid].wishes[day] = val;
        }

        // 重新渲染表格 (局部更新會更好，這裡簡化為全刷)
        const daysInMonth = new Date(this.currentSchedule.year, this.currentSchedule.month, 0).getDate();
        this.renderReviewBody(this.currentSchedule, daysInMonth);
        
        document.getElementById('shift-context-menu').style.display = 'none';
    }

    async saveReview() {
        const btn = document.getElementById('btn-save-review');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            await PreScheduleService.updateSubmissions(this.currentReviewId, this.currentSchedule.submissions);
            alert("✅ 審核結果已儲存");
        } catch(e) {
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存變更';
        }
    }

    async openModal(idx) {
        this.modal.show();
        // 載入人員 Checkbox
        const container = document.getElementById('staff-checkbox-list');
        container.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> 載入人員中...</div>';
        
        const staff = await userService.getUnitStaff(this.targetUnitId);
        container.innerHTML = staff.map(s => `
            <div class="col-md-3 col-sm-4 mb-2">
                <div class="form-check">
                    <input class="form-check-input staff-check" type="checkbox" value="${s.uid}" id="st-${s.uid}" checked>
                    <label class="form-check-label small" for="st-${s.uid}">${s.name}</label>
                </div>
            </div>
        `).join('');

        // 全選功能
        document.getElementById('check-all-staff').addEventListener('change', (e) => {
            document.querySelectorAll('.staff-check').forEach(cb => cb.checked = e.target.checked);
        });
    }

    async savePreSchedule() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;

        try {
            const staffIds = Array.from(document.querySelectorAll('.staff-check:checked')).map(cb => cb.value);
            if(staffIds.length === 0) throw new Error("至少選擇一位人員");

            const data = {
                unitId: this.targetUnitId,
                year: parseInt(document.getElementById('form-year').value),
                month: parseInt(document.getElementById('form-month').value),
                staffIds: staffIds,
                settings: {
                    openDate: document.getElementById('form-open').value,
                    closeDate: document.getElementById('form-close').value,
                    maxOffDays: parseInt(document.getElementById('form-max-off').value),
                    maxHoliday: parseInt(document.getElementById('form-max-holiday').value),
                    reservedStaff: parseInt(document.getElementById('form-reserved').value),
                    showOtherNames: document.getElementById('form-show-names').checked
                },
                status: 'open'
            };

            const res = await PreScheduleService.createPreSchedule(data);
            if(res.success) {
                alert("✅ 建立成功！");
                this.modal.hide();
                this.loadList(this.targetUnitId);
            } else {
                throw new Error(res.error);
            }
        } catch(e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.disabled = false;
        }
    }

    async deletePreSchedule(id) {
        if(!confirm("確定刪除此預班表？所有已提交的資料將會遺失！")) return;
        await PreScheduleService.deletePreSchedule(id);
        this.loadList(this.targetUnitId);
    }
}
