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
        
        this.historyData = {}; 
        this.prevYear = 0;
        this.prevMonth = 0;
        this.prevMonthDays = 0;
        this.historyRange = []; 
        
        this.editingPrefUid = null;
        this.prefModal = null;
    }

    async render() {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        this.scheduleId = params.get('id');

        const style = `
        <style>
            .schedule-table-container { overflow-x: auto; }
            .schedule-table { width: 100%; table-layout: auto; font-size: 0.85rem; }
            .schedule-table th, .schedule-table td { padding: 4px 2px !important; white-space: nowrap; vertical-align: middle; }
            .col-staff-id { width: 70px; max-width: 70px; }
            .col-name { width: 90px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
            .col-note { width: 35px; max-width: 35px; }
            .col-pref { width: 110px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
            .col-date { min-width: 28px; }
            #context-menu {
                display: none; position: fixed; z-index: 9999; 
                background-color: white; opacity: 1;
                border: 1px solid rgba(0,0,0,.15);
                box-shadow: 0 .5rem 1rem rgba(0,0,0,.175);
                border-radius: .25rem; padding: .5rem 0; min-width: 160px;
            }
            #context-menu .dropdown-item { padding: 0.25rem 1rem; font-size: 0.9rem; cursor: pointer; }
            #context-menu .dropdown-item:hover { background-color: #f8f9fa; }
        </style>
        `;

        return style + `
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
                            <i class="fas fa-save"></i> 儲存
                        </button>
                        <button id="btn-auto-schedule" class="btn btn-success" disabled>
                            <i class="fas fa-robot"></i> 排班
                        </button>
                    </div>
                </div>

                <div class="alert alert-info py-2 small d-flex align-items-center">
                    <i class="fas fa-info-circle me-2"></i>
                    <span>提示：灰色底色區域為「上月月底資料」，點擊可修改。支援左鍵或右鍵開啟選單。</span>
                </div>

                <div class="card shadow-sm">
                    <div class="card-body p-0">
                        <div class="schedule-table-container" id="schedule-container">
                            <div class="text-center p-5"><span class="spinner-border text-primary"></span> 資料載入中...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="context-menu" class="shadow"></div>

            <div class="modal fade" id="pref-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">編輯排班偏好</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="pref-form">
                                <div id="pref-dynamic-content"></div>
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
            if (menu && menu.style.display === 'block' && !e.target.closest('#context-menu')) {
                menu.style.display = 'none';
            }
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

            document.getElementById('page-title').innerHTML = `<i class="fas fa-edit me-2"></i>${this.unitData.unitName} - ${this.scheduleData.year}年${this.scheduleData.month}月`;
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
        <table class="table table-bordered table-sm text-center align-middle schedule-table user-select-none">
            <thead class="table-light sticky-top" style="z-index: 5;">
                <tr>
                    <th rowspan="2" class="col-staff-id">職編</th>
                    <th rowspan="2" class="col-name">姓名</th>
                    <th rowspan="2" class="col-note">註</th>
                    <th rowspan="2" class="col-pref">排班偏好 <i class="fas fa-edit text-muted"></i></th>
                    <th colspan="6" class="bg-secondary bg-opacity-10 border-end border-2">上月 (${this.prevMonth}月)</th>
                    <th colspan="${daysInMonth}">本月 (${this.scheduleData.month}月)</th>
                </tr>
                <tr>
                    ${this.historyRange.map(d => `<th class="bg-secondary bg-opacity-10 text-muted small col-date">${d}</th>`).join('')}
                    ${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const weekDay = new Date(this.scheduleData.year, this.scheduleData.month - 1, d).getDay();
                        const isWeekend = weekDay === 0 || weekDay === 6;
                        return `<th class="col-date ${isWeekend ? 'text-danger' : ''}">${d}<br><span class="small" style="font-size:0.75rem">${this.getWeekName(weekDay)}</span></th>`;
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
            
            // 簡化顯示，只顯示主要順位
            const p1 = pref.priority1 || '';
            const p2 = pref.priority2 || '';
            const p3 = pref.priority3 || '';
            let pStr = p1;
            if(p2) pStr += ` > ${p2}`;
            if(p3) pStr += ` > ${p3}`;
            
            if (pStr) prefStr += `<small class="text-muted d-block text-truncate">${pStr}</small>`;
            if (!prefStr) prefStr = '<span class="text-muted small">-</span>';

            html += `
                <tr>
                    <td class="text-muted small col-staff-id">${staff.staffId || ''}</td>
                    <td class="fw-bold text-start ps-1 col-name" title="${staff.name}">${staff.name}</td>
                    <td class="col-note">${staff.constraints?.isPregnant ? '<span class="badge bg-danger rounded-pill">孕</span>' : ''}</td>
                    
                    <td onclick="window.routerPage.openPrefModal('${uid}')" style="cursor:pointer;" class="hover-bg-light col-pref" title="點擊編輯偏好">
                        ${prefStr}
                    </td>

                    ${this.historyRange.map(d => {
                        const val = history[d] || '';
                        return `<td class="history-cell bg-secondary bg-opacity-10" 
                                    data-uid="${uid}" 
                                    data-day="${d}" 
                                    data-type="history"
                                    onclick="window.routerPage.handleCellClick(this, '${val}', event)"
                                    oncontextmenu="window.routerPage.handleCellClick(this, '${val}', event)"
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
                                    onclick="window.routerPage.handleCellClick(this, '${val}', event)"
                                    oncontextmenu="window.routerPage.handleCellClick(this, '${val}', event)"
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

    renderShiftBadge(code) {
        if (!code) return '';
        if (code.startsWith('NO_')) return `<span class="badge border border-danger text-danger bg-light" style="padding:2px;">勿${code.replace('NO_', '')}</span>`;

        let bgStyle = 'background-color:#6c757d; color:white;';
        if (code === 'OFF') bgStyle = 'background-color:#ffc107; color:black;';
        else if (code === 'M_OFF') bgStyle = 'background-color:#6f42c1; color:white;';
        else {
            const s = this.unitData.settings?.shifts?.find(x => x.code === code);
            if(s) bgStyle = `background-color:${s.color}; color:white;`;
        }

        return `<span class="badge w-100" style="${bgStyle}; padding:3px 0;">${code === 'M_OFF' ? 'M' : code}</span>`;
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

    handleCellClick(cell, currentVal, e = null) {
        if (e) {
            e.preventDefault(); 
            e.stopPropagation(); 
        }

        const menu = document.getElementById('context-menu');
        if (!menu) return;

        const type = cell.dataset.type; 
        const uid = cell.dataset.uid;
        const day = cell.dataset.day;
        this.currentEditTarget = { uid, day, type, cell };

        const unitShifts = this.unitData.settings?.shifts || [
            {code:'D', name:'白班', color:'#0d6efd'}, 
            {code:'E', name:'小夜', color:'#ffc107'}, 
            {code:'N', name:'大夜', color:'#212529'}
        ];

        let menuHtml = `<h6 class="dropdown-header bg-light">設定 ${type==='history' ? '上月' : ''} ${day} 日</h6>`;
        
        menuHtml += `<div class="dropdown-item" onclick="window.routerPage.applyShift('OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 預休</div>`;
        
        if (type === 'current') {
            menuHtml += `<div class="dropdown-item" onclick="window.routerPage.applyShift('M_OFF')"><span class="badge w-25 me-2" style="background-color:#6f42c1; color:white;">M</span> 強休</div>`;
        }
        menuHtml += `<div class="dropdown-divider"></div>`;

        unitShifts.forEach(s => {
            menuHtml += `<div class="dropdown-item" onclick="window.routerPage.applyShift('${s.code}')"><span class="badge text-white w-25 me-2" style="background-color:${s.color}">${s.code}</span> 指定${s.name}</div>`;
        });

        if (type === 'current') {
            menuHtml += `<div class="dropdown-divider"></div>`;
            unitShifts.forEach(s => {
                menuHtml += `<div class="dropdown-item text-danger small" onclick="window.routerPage.applyShift('NO_${s.code}')"><i class="fas fa-ban w-25 me-2"></i> 勿排${s.name}</div>`;
            });
        }

        menuHtml += `<div class="dropdown-divider"></div>`;
        menuHtml += `<div class="dropdown-item text-secondary" onclick="window.routerPage.applyShift('')"><i class="fas fa-eraser w-25 me-2"></i> 清除</div>`;

        menu.innerHTML = menuHtml;
        menu.style.display = 'block';
        
        const menuRect = menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = e ? e.clientX : cell.getBoundingClientRect().left;
        let top = e ? e.clientY : cell.getBoundingClientRect().bottom;

        if (left + menuRect.width > windowWidth) left = windowWidth - menuRect.width - 10;
        if (top + menuRect.height > windowHeight) {
            if (e) top = e.clientY - menuRect.height;
            else top = cell.getBoundingClientRect().top - menuRect.height;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    applyShift(val) {
        if (!this.currentEditTarget) return;
        const { uid, day, type } = this.currentEditTarget;

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

    // ✅ 修正重點：管理者端偏好編輯視窗動態化
    openPrefModal(uid) {
        this.editingPrefUid = uid;
        const sub = this.scheduleData.submissions[uid] || {};
        const pref = sub.preferences || {};
        
        // 讀取設定
        const settings = this.scheduleData.settings || {};
        const limit = settings.shiftTypesLimit || 2;
        const allow3 = settings.allowThreeTypesVoluntary !== false;
        
        // 判斷是否顯示混合選項與 P3
        // 條件：(限制3種) OR (限制2種且允許自願3種)
        const showMixOption = (limit === 3) || (limit === 2 && allow3);
        
        let html = `
            <div class="mb-3">
                <label class="form-label fw-bold">包班意願</label>
                <select id="edit-pref-batch" class="form-select">
                    <option value="">無 (不包班)</option>
                    <option value="E">包小夜 (E)</option>
                    <option value="N">包大夜 (N)</option>
                </select>
            </div>`;

        if (showMixOption) {
            html += `
            <div class="mb-3">
                <label class="form-label fw-bold">每月班別種類偏好</label>
                <select id="edit-pref-mix" class="form-select">
                    <option value="2">單純 (2種)</option>
                    <option value="3">彈性 (3種)</option>
                </select>
            </div>`;
        } else {
            html += `<input type="hidden" id="edit-pref-mix" value="2">`;
        }

        const unitShifts = this.unitData.settings?.shifts || [];
        const optionsHtml = `<option value="">-</option>` + unitShifts.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');
        
        html += `
        <div class="row g-2">
            <div class="col-4">
                <label class="small">順位 1</label>
                <select id="edit-pref-p1" class="form-select form-select-sm">${optionsHtml}</select>
            </div>
            <div class="col-4">
                <label class="small">順位 2</label>
                <select id="edit-pref-p2" class="form-select form-select-sm">${optionsHtml}</select>
            </div>
            <div class="col-4" id="container-admin-p3" style="display:none;">
                <label class="small">順位 3</label>
                <select id="edit-pref-p3" class="form-select form-select-sm">${optionsHtml}</select>
            </div>
        </div>`;

        document.getElementById('pref-dynamic-content').innerHTML = html;

        // 回填數值
        document.getElementById('edit-pref-batch').value = pref.batch || '';
        if (showMixOption) {
            document.getElementById('edit-pref-mix').value = pref.monthlyMix || '2';
        }
        document.getElementById('edit-pref-p1').value = pref.priority1 || '';
        document.getElementById('edit-pref-p2').value = pref.priority2 || '';
        document.getElementById('edit-pref-p3').value = pref.priority3 || '';

        // 控制 P3 顯示/隱藏
        const toggleP3 = (mixValue) => {
            const p3 = document.getElementById('container-admin-p3');
            // 如果顯示了混合選項，且值為 3 -> 顯示 P3
            if (showMix && mixValue === '3') {
                p3.style.display = 'block';
            } else if (limit === 3) {
                // 如果硬性限制為 3，無論如何都顯示 P3 (假設預設偏好為 3)
                // 這裡簡化邏輯：如果沒有 Mix 選項但 Limit=3，預設 Mix=3
                p3.style.display = 'block';
            } else {
                p3.style.display = 'none';
                document.getElementById('edit-pref-p3').value = ''; // 清空值
            }
        };

        const currentMix = document.getElementById('edit-pref-mix').value;
        toggleP3(currentMix);

        const mixSelect = document.getElementById('edit-pref-mix');
        if (mixSelect && mixSelect.type !== 'hidden') {
            mixSelect.addEventListener('change', (e) => toggleP3(e.target.value));
        }

        this.prefModal.show();
    }

    savePreferences() {
        if (!this.editingPrefUid) return;
        const uid = this.editingPrefUid;
        
        if (!this.scheduleData.submissions[uid]) this.scheduleData.submissions[uid] = {};
        
        const newPref = {
            batch: document.getElementById('edit-pref-batch').value,
            monthlyMix: document.getElementById('edit-pref-mix')?.value || '2',
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
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存';
        }
    }

    goToAutoSchedule() {
        if (this.isDirty) {
            if (!confirm("您有未儲存的變更，是否繼續？(未儲存的變更將不會應用於排班)")) return;
        }
        window.location.hash = `/schedule/edit?unitId=${this.scheduleData.unitId}&year=${this.scheduleData.year}&month=${this.scheduleData.month}`;
    }
}
