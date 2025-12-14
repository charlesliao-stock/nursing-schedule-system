import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; 
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleEditPage {
    constructor() {
        this.scheduleId = null;
        this.scheduleData = null;
        this.unitData = null;
        this.staffList = [];
        this.isDirty = false;
        
        // 用於儲存上個月最後 6 天的資料
        this.historyData = {}; 
        this.prevYear = 0;
        this.prevMonth = 0;
        this.prevMonthDays = 0;
        this.historyRange = []; 
        
        // 暫存偏好編輯
        this.editingPrefUid = null;
        this.prefModal = null;
    }

    async render() {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        this.scheduleId = params.get('id');

        return `
            <div class="container-fluid mt-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="d-flex align-items-center gap-3">
                        <h4 class="mb-0 fw-bold" id="page-title"><i class="fas fa-edit me-2"></i>預班內容編輯</h4>
                        <span id="status-badge" class="badge bg-secondary">載入中...</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 返回
                        </button>
                        <button id="btn-save" class="btn btn-primary" disabled>
                            <i class="fas fa-save"></i> 儲存變更
                        </button>
                        <button id="btn-auto-schedule" class="btn btn-success" disabled>
                            <i class="fas fa-robot"></i> 產生排班
                        </button>
                    </div>
                </div>

                <div class="alert alert-info py-2 small d-flex align-items-center">
                    <i class="fas fa-info-circle me-2"></i>
                    <span>提示：灰色底色區域為「上月月底資料」，點擊可修改 (修正 5)，將作為排班連續性檢查依據。</span>
                </div>

                <div class="card shadow-sm">
                    <div class="card-body p-0">
                        <div class="table-responsive" id="schedule-container">
                            <div class="text-center p-5"><span class="spinner-border text-primary"></span> 資料載入中...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="context-menu" class="dropdown-menu shadow" style="display:none; position:fixed; z-index:9999; background-color: white; opacity: 1;"></div>

            <div class="modal fade" id="pref-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">編輯排班偏好</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="pref-form">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">包班意願</label>
                                    <select id="edit-pref-batch" class="form-select">
                                        <option value="">無 (不包班)</option>
                                        <option value="E">包小夜 (E)</option>
                                        <option value="N">包大夜 (N)</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold">每月班別種類偏好</label>
                                    <select id="edit-pref-mix" class="form-select">
                                        <option value="2">單純 (2種)</option>
                                        <option value="3">彈性 (3種)</option>
                                    </select>
                                </div>
                                <div class="row g-2">
                                    <div class="col-4">
                                        <label class="small">順位 1</label>
                                        <select id="edit-pref-p1" class="form-select form-select-sm">
                                            <option value="">-</option><option value="D">D</option><option value="E">E</option><option value="N">N</option>
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label class="small">順位 2</label>
                                        <select id="edit-pref-p2" class="form-select form-select-sm">
                                            <option value="">-</option><option value="D">D</option><option value="E">E</option><option value="N">N</option>
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label class="small">順位 3</label>
                                        <select id="edit-pref-p3" class="form-select form-select-sm">
                                            <option value="">-</option><option value="D">D</option><option value="E">E</option><option value="N">N</option>
                                        </select>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" onclick="window.routerPage.savePreferences()">確定修改</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        if (!user) { alert("請先登入"); window.location.hash = '/login'; return; }
        if (!this.scheduleId) { alert("無效的預班表 ID"); window.history.back(); return; }

        window.routerPage = this;
        this.prefModal = new bootstrap.Modal(document.getElementById('pref-modal'));

        document.getElementById('btn-save').addEventListener('click', () => this.saveData());
        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.goToAutoSchedule());
        
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && !e.target.closest('#context-menu')) menu.style.display = 'none';
        });

        window.onbeforeunload = (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        await this.loadData();
    }

    async loadData() {
        try {
            this.scheduleData = await PreScheduleService.getPreScheduleById(this.scheduleId);
            if (!this.scheduleData) throw new Error("找不到預班表資料");

            this.unitData = await UnitService.getUnitById(this.scheduleData.unitId);
            const staff = await userService.getUnitStaff(this.scheduleData.unitId);
            this.staffList = staff.sort((a, b) => (a.rank || 'Z').localeCompare(b.rank || 'Z'));

            document.getElementById('page-title').innerHTML = `<i class="fas fa-edit me-2"></i>${this.unitData.unitName} - ${this.scheduleData.year}年${this.scheduleData.month}月 預班編輯`;
            this.updateStatusBadge(this.scheduleData.status);

            await this.ensureHistoryData();
            this.renderTable();

            document.getElementById('btn-save').disabled = false;
            document.getElementById('btn-auto-schedule').disabled = false;

        } catch (e) {
            console.error(e);
            alert("載入失敗: " + e.message);
        }
    }

    async ensureHistoryData() {
        const currentYear = this.scheduleData.year;
        const currentMonth = this.scheduleData.month;
        let py = currentYear, pm = currentMonth - 1;
        if (pm === 0) { pm = 12; py--; }
        
        this.prevYear = py;
        this.prevMonth = pm;
        this.prevMonthDays = new Date(py, pm, 0).getDate();
        
        this.historyRange = [];
        for (let i = 5; i >= 0; i--) {
            this.historyRange.push(this.prevMonthDays - i);
        }

        if (this.scheduleData.history && Object.keys(this.scheduleData.history).length > 0) {
            this.historyData = this.scheduleData.history;
        } else {
            try {
                const prevSchedule = await ScheduleService.getSchedule(this.scheduleData.unitId, py, pm);
                this.historyData = {};
                this.staffList.forEach(s => this.historyData[s.uid] = {});

                if (prevSchedule && prevSchedule.assignments) {
                    this.staffList.forEach(s => {
                        const uid = s.uid;
                        const userAssign = prevSchedule.assignments[uid] || {};
                        this.historyRange.forEach(day => {
                            this.historyData[uid][day] = userAssign[day] || '';
                        });
                    });
                }
                this.isDirty = true;
            } catch (e) {
                this.historyData = {};
                this.staffList.forEach(s => this.historyData[s.uid] = {});
            }
        }
    }

    renderTable() {
        const daysInMonth = new Date(this.scheduleData.year, this.scheduleData.month, 0).getDate();
        const submissions = this.scheduleData.submissions || {};

        let html = `
        <table class="table table-bordered table-sm text-center align-middle schedule-table user-select-none" style="font-size:0.9rem;">
            <thead class="table-light sticky-top" style="z-index: 5;">
                <tr>
                    <th rowspan="2" style="min-width:80px; width:80px;">職編</th>
                    <th rowspan="2" style="min-width:90px; width:90px;">姓名</th>
                    <th rowspan="2" style="width:40px;">註</th>
                    <th rowspan="2" style="width:140px;">排班偏好 <i class="fas fa-edit text-muted ms-1"></i></th>
                    <th colspan="6" class="bg-secondary bg-opacity-10 border-end border-2">上月 (${this.prevMonth}月)</th>
                    <th colspan="${daysInMonth}">本月 (${this.scheduleData.month}月)</th>
                </tr>
                <tr>
                    ${this.historyRange.map(d => `<th class="bg-secondary bg-opacity-10 text-muted small">${d}</th>`).join('')}
                    ${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const weekDay = new Date(this.scheduleData.year, this.scheduleData.month - 1, d).getDay();
                        const isWeekend = weekDay === 0 || weekDay === 6;
                        return `<th class="${isWeekend ? 'text-danger' : ''}">${d}<br><span class="small" style="font-size:0.75rem">${this.getWeekName(weekDay)}</span></th>`;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
        `;

        this.staffList.forEach(staff => {
            const uid = staff.uid;
            const sub = submissions[uid] || {};
            const wishes = sub.wishes || {};
            const pref = sub.preferences || {};
            const history = this.historyData[uid] || {};

            let prefStr = '';
            if (pref.batch) prefStr += `<span class="badge bg-primary me-1">包${pref.batch}</span>`;
            if (pref.priority1) prefStr += `<small class="text-muted d-block">${pref.priority1} > ${pref.priority2||'-'} > ${pref.priority3||'-'}</small>`;
            if (!prefStr) prefStr = '<span class="text-muted small">- 點擊編輯 -</span>';

            html += `
                <tr>
                    <td class="text-muted small">${staff.staffId || ''}</td>
                    <td class="fw-bold text-start ps-2">${staff.name}</td>
                    <td>${staff.constraints?.isPregnant ? '<span class="badge bg-danger rounded-pill">孕</span>' : ''}</td>
                    
                    <td onclick="window.routerPage.openPrefModal('${uid}')" style="cursor:pointer;" class="hover-bg-light" title="點擊編輯偏好">
                        ${prefStr}
                    </td>

                    ${this.historyRange.map(d => {
                        const val = history[d] || '';
                        return `<td class="history-cell bg-secondary bg-opacity-10" 
                                    data-uid="${uid}" 
                                    data-day="${d}" 
                                    data-type="history"
                                    onclick="window.routerPage.handleCellClick(this, '${val}')"
                                    style="cursor:pointer; border-right: ${d===this.historyRange[this.historyRange.length-1] ? '2px solid #dee2e6' : ''}">
                                    ${this.renderShiftBadge(val)}
                                </td>`;
                    }).join('')}

                    ${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const val = wishes[d] || '';
                        return `<td class="wish-cell" 
                                    data-uid="${uid}" 
                                    data-day="${d}" 
                                    data-type="current"
                                    onclick="window.routerPage.handleCellClick(this, '${val}')"
                                    style="cursor:pointer;">
                                    ${this.renderShiftBadge(val)}
                                </td>`;
                    }).join('')}
                </tr>
            `;
        });

        html += `</tbody></table>`;
        document.getElementById('schedule-container').innerHTML = html;
    }

    // 修正 3: 班別顏色 (M_OFF 為紫色)
    renderShiftBadge(code) {
        if (!code) return '';
        
        // 勿排代碼
        if (code.startsWith('NO_')) {
            return `<i class="fas fa-ban text-danger"></i> <span class="small">${code.replace('NO_', '')}</span>`;
        }

        let bgStyle = '';
        let text = code;

        switch(code) {
            case 'D': bgStyle = 'background-color:#0d6efd; color:white;'; break;
            case 'E': bgStyle = 'background-color:#ffc107; color:black;'; break;
            case 'N': bgStyle = 'background-color:#212529; color:white;'; break;
            case 'OFF': bgStyle = 'background-color:#ffc107; color:black;'; break; // 黃底 (Bootstrap warning)
            case 'M_OFF': 
                bgStyle = 'background-color:#6f42c1; color:white;'; // 紫底 (修正 3)
                text = 'M';
                break;
            default: bgStyle = 'background-color:#6c757d; color:white;'; break;
        }

        return `<span class="badge w-100" style="${bgStyle}">${text}</span>`;
    }

    getWeekName(day) {
        return ['日', '一', '二', '三', '四', '五', '六'][day];
    }

    updateStatusBadge(status) {
        const el = document.getElementById('status-badge');
        const map = {
            'draft': { text: '草稿', cls: 'bg-secondary' },
            'open': { text: '開放填寫中', cls: 'bg-success' },
            'closed': { text: '已截止 / 排班中', cls: 'bg-warning text-dark' },
            'published': { text: '已發布', cls: 'bg-primary' }
        };
        const s = map[status] || { text: status, cls: 'bg-secondary' };
        el.className = `badge ${s.cls}`;
        el.textContent = s.text;
    }

    handleCellClick(cell, currentVal) {
        const existing = document.getElementById('context-menu');
        existing.style.display = 'none'; // 先關閉

        const type = cell.dataset.type; // 'history' or 'current'
        const uid = cell.dataset.uid;
        const day = cell.dataset.day;

        this.currentEditTarget = { uid, day, type, cell };

        // 產生選單 (修正 2: 背景樣式已在 HTML 設定為 white opacity 1)
        let menuHtml = '';
        const shifts = ['D', 'E', 'N'];
        
        menuHtml += `<h6 class="dropdown-header">設定 ${type==='history' ? '上月' : ''} ${day} 日</h6>`;
        
        // 修正 3: 選單中的顏色與表格一致
        menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 預休/休假</button>`;
        
        if (type === 'current') {
            // M_OFF 紫色
            menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('M_OFF')"><span class="badge w-25 me-2" style="background-color:#6f42c1;">M</span> 強迫預休</button>`;
        }
        menuHtml += `<div class="dropdown-divider"></div>`;

        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('${s}')"><span class="badge bg-secondary w-25 me-2">${s}</span> ${s}</button>`;
        });

        if (type === 'current') {
            menuHtml += `<div class="dropdown-divider"></div>`;
            shifts.forEach(s => {
                menuHtml += `<button class="dropdown-item text-danger small" onclick="window.routerPage.applyShift('NO_${s}')"><i class="fas fa-ban w-25 me-2"></i> 勿排${s}</button>`;
            });
        }

        menuHtml += `<div class="dropdown-divider"></div>`;
        menuHtml += `<button class="dropdown-item text-muted" onclick="window.routerPage.applyShift('')"><i class="fas fa-eraser w-25 me-2"></i> 清除</button>`;

        const menu = document.getElementById('context-menu');
        menu.innerHTML = menuHtml;
        
        const rect = cell.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.display = 'block';
    }

    applyShift(val) {
        if (!this.currentEditTarget) return;
        const { uid, day, type } = this.currentEditTarget;

        // 修正 5: 支援上月資料編輯
        if (type === 'history') {
            if (!this.historyData[uid]) this.historyData[uid] = {};
            this.historyData[uid][day] = val;
        } else {
            if (!this.scheduleData.submissions[uid]) this.scheduleData.submissions[uid] = {};
            if (!this.scheduleData.submissions[uid].wishes) this.scheduleData.submissions[uid].wishes = {};
            
            if (val) this.scheduleData.submissions[uid].wishes[day] = val;
            else delete this.scheduleData.submissions[uid].wishes[day];
        }

        this.isDirty = true;
        this.renderTable();
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('btn-save').disabled = false;
    }

    // 修正 6: 偏好編輯相關
    openPrefModal(uid) {
        this.editingPrefUid = uid;
        const sub = this.scheduleData.submissions[uid] || {};
        const pref = sub.preferences || {};

        document.getElementById('edit-pref-batch').value = pref.batch || '';
        document.getElementById('edit-pref-mix').value = pref.monthlyMix || '2';
        document.getElementById('edit-pref-p1').value = pref.priority1 || '';
        document.getElementById('edit-pref-p2').value = pref.priority2 || '';
        document.getElementById('edit-pref-p3').value = pref.priority3 || '';

        this.prefModal.show();
    }

    savePreferences() {
        if (!this.editingPrefUid) return;
        const uid = this.editingPrefUid;
        
        if (!this.scheduleData.submissions[uid]) this.scheduleData.submissions[uid] = {};
        
        const newPref = {
            batch: document.getElementById('edit-pref-batch').value,
            monthlyMix: document.getElementById('edit-pref-mix').value,
            priority1: document.getElementById('edit-pref-p1').value,
            priority2: document.getElementById('edit-pref-p2').value,
            priority3: document.getElementById('edit-pref-p3').value
        };

        this.scheduleData.submissions[uid].preferences = newPref;
        this.isDirty = true;
        this.prefModal.hide();
        this.renderTable();
        document.getElementById('btn-save').disabled = false;
    }

    async saveData() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

        try {
            // 修正 4: 儲存 submissions (含 preferences) 與 history
            const updates = {
                submissions: this.scheduleData.submissions,
                history: this.historyData, 
                lastUpdated: new Date()
            };

            await PreScheduleService.updatePreSchedule(this.scheduleId, updates);
            
            this.isDirty = false;
            alert("✅ 儲存成功！");
        } catch (e) {
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存變更';
        }
    }

    goToAutoSchedule() {
        if (this.isDirty) {
            if (!confirm("您有未儲存的變更，是否繼續？(未儲存的變更將不會應用於排班)")) return;
        }
        window.location.hash = `/schedule/edit?unitId=${this.scheduleData.unitId}&year=${this.scheduleData.year}&month=${this.scheduleData.month}`;
    }
}
