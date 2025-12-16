import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";
import { ScoringService } from "../../services/ScoringService.js";
// 原本的 Template 可能無法支援這麼複雜的 Sticky Layout，故直接在 Page 內渲染

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null, year: null, month: null,
            unitSettings: null, staffList: [], 
            scheduleData: null, // { assignments, prevAssignments, ... }
            daysInMonth: 0,
            scoreResult: null,
            sortKey: 'id', // 預設依職編排序
            sortAsc: true
        };
        this.versionsModal = null; 
        this.scoreModal = null;
        this.generatedVersions = [];
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    cleanup() {
        document.removeEventListener('click', this.handleGlobalClick);
        this.closeMenu();
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(b => b.remove());
    }

    async render() {
        // 先載入必要的 CSS (Sticky Table 樣式)
        const style = `
            <style>
                .schedule-table-wrapper { position: relative; max-height: 100%; width: 100%; overflow: auto; }
                .schedule-grid th, .schedule-grid td { vertical-align: middle; white-space: nowrap; padding: 2px 4px; height: 38px; border-color: #dee2e6; }
                .sticky-col { position: sticky; z-index: 10; }
                .first-col { left: 0; z-index: 11; border-right: 2px solid #ccc !important; width: 60px; }
                .second-col { left: 60px; z-index: 11; width: 80px; }
                .third-col { left: 140px; z-index: 11; border-right: 2px solid #999 !important; width: 60px; }
                .right-col-1 { right: 0; z-index: 11; border-left: 2px solid #ccc !important; width: 45px; } 
                .right-col-2 { right: 45px; z-index: 11; width: 45px; }
                .right-col-3 { right: 90px; z-index: 11; width: 45px; }
                .right-col-4 { right: 135px; z-index: 11; border-left: 2px solid #999 !important; width: 45px; }
                thead .sticky-col { z-index: 15 !important; }
                .bg-light-gray { background-color: #f8f9fa !important; color: #aaa; }
                .shift-input:focus { background-color: #e8f0fe !important; font-weight: bold; outline: none; }
                .cursor-pointer { cursor: pointer; }
            </style>
        `;

        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if(!this.state.currentUnitId) return `<div class="alert alert-danger m-4">無效的參數。</div>`;

        // 回傳 Layout HTML
        return `
            ${style}
            <div class="container-fluid p-0 h-100 d-flex flex-column">
                <div class="schedule-toolbar p-3 bg-white border-bottom d-flex align-items-center gap-3 justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <h4 class="mb-0 fw-bold text-primary"><i class="bi bi-calendar-week"></i> 排班作業</h4>
                        <span id="schedule-status-badge" class="badge bg-secondary">載入中</span>
                        <div id="loading-indicator" class="spinner-border spinner-border-sm text-primary" style="display:none;"></div>
                    </div>

                    <div class="d-flex align-items-center gap-3">
                        <div id="score-display-card" class="d-flex align-items-center px-3 py-1 bg-light rounded border cursor-pointer" onclick="window.routerPage.showScoreDetails()">
                            <span class="text-muted me-2 small">排班評分</span>
                            <h3 class="mb-0 fw-bold text-secondary" id="score-display">--</h3>
                            <span class="ms-1 small">分</span>
                        </div>

                        <button id="btn-auto-schedule" class="btn btn-outline-primary"><i class="bi bi-robot"></i> AI 排班</button>
                        <button id="btn-clear" class="btn btn-outline-danger"><i class="bi bi-arrow-counterclockwise"></i> 重置</button>
                        <button id="btn-publish" class="btn btn-success"><i class="bi bi-check-circle"></i> 發布班表</button>
                    </div>
                </div>

                <div class="flex-grow-1 overflow-auto bg-light p-3" id="schedule-grid-container">
                    </div>
            </div>

            <div class="modal fade" id="score-modal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title">排班品質評分報告</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="score-details-body"></div>
                    </div>
                </div>
            </div>
            
            <div class="modal fade" id="versions-modal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">AI 智慧排班結果選擇</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="ai-progress-container" class="mb-3" style="display:none;">
                                <div id="ai-progress-text" class="mb-1 text-primary">正在運算中...</div>
                                <div class="progress"><div id="ai-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" style="width: 0%"></div></div>
                            </div>
                            <ul class="nav nav-tabs" id="versionTabs" role="tablist">
                                <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#v1">版本 1</button></li>
                                <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#v2">版本 2</button></li>
                                <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#v3">版本 3</button></li>
                            </ul>
                            <div class="tab-content p-3 border border-top-0" id="versionTabContent">
                                <div class="tab-pane fade show active" id="v1"></div>
                                <div class="tab-pane fade" id="v2"></div>
                                <div class="tab-pane fade" id="v3"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        this.scoreModal = new bootstrap.Modal(document.getElementById('score-modal'));
        window.routerPage = this;

        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-publish').addEventListener('click', () => this.togglePublish());

        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        await this.loadData();
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) this.closeMenu();
    }

    closeMenu() {
        if (this.state.activeMenu) { this.state.activeMenu.remove(); this.state.activeMenu = null; }
    }
    
    // --- 載入資料 ---
    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitByIdWithCache(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            if (!schedule) {
                // 若無資料，建立新班表 (ScheduleService 內部會自動抓上個月)
                const newSched = await ScheduleService.createEmptySchedule(
                    this.state.currentUnitId, this.state.year, this.state.month, staffList.map(s=>s.uid)
                );
                this.state.scheduleData = newSched;
                // 自動填入預班
                await this.resetToPreSchedule(false);
            } else {
                this.state.scheduleData = schedule;
                this.renderGrid();
                this.updateStatusBadge();
                this.updateScoreDisplay();
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger m-3">載入失敗: ${error.message}</div>`;
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // --- 核心：渲染表格 (取代 Template) ---
    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, sortKey, sortAsc } = this.state;
        const assignments = scheduleData.assignments || {};
        const prevAssignments = scheduleData.prevAssignments || {};

        // 1. 計算上個月最後 6 天
        const prevMonthLastDate = new Date(year, month - 1, 0); 
        const prevLastDayVal = prevMonthLastDate.getDate();
        const prevDaysToShow = [];
        for(let i=5; i>=0; i--) {
            prevDaysToShow.push(prevLastDayVal - i);
        }

        // 2. 排序人員
        staffList.sort((a, b) => {
            const valA = a[sortKey] || '';
            const valB = b[sortKey] || '';
            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        // 3. 建構 HTML
        let html = `
            <div class="schedule-table-wrapper shadow-sm bg-white rounded">
                <table class="table table-bordered table-sm text-center mb-0 align-middle schedule-grid">
                    <thead class="bg-light">
                        <tr>
                            <th class="sticky-col first-col bg-light cursor-pointer" onclick="window.routerPage.sortStaff('id')">
                                職編 ${sortKey==='id' ? (sortAsc?'↑':'↓') : ''}
                            </th>
                            <th class="sticky-col second-col bg-light">姓名</th>
                            <th class="sticky-col third-col bg-light">備註</th>
        `;

        // 上個月日期 (灰色)
        prevDaysToShow.forEach(d => html += `<th class="text-muted bg-light-gray" style="font-size:0.8rem">${d}</th>`);

        // 當月日期
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            html += `<th class="${isWeekend?'text-danger':''}" style="font-size:0.9rem">${d}<div style="font-size:0.7rem">${['日','一','二','三','四','五','六'][date.getDay()]}</div></th>`;
        }

        html += `
                            <th class="sticky-col right-col-4 bg-light text-primary">OFF</th>
                            <th class="sticky-col right-col-3 bg-light">小夜</th>
                            <th class="sticky-col right-col-2 bg-light">大夜</th>
                            <th class="sticky-col right-col-1 bg-light">假日</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        staffList.forEach(staff => {
            const uid = staff.uid;
            const userShifts = assignments[uid] || {};
            const prevUserShifts = prevAssignments[uid] || {};
            
            // 統計 (初始計算)
            const stats = this.calculateRowStats(userShifts);

            html += `
                <tr>
                    <td class="sticky-col first-col bg-white fw-bold">${staff.id || ''}</td>
                    <td class="sticky-col second-col bg-white">${staff.name}</td>
                    <td class="sticky-col third-col bg-white small text-muted text-truncate" title="${staff.note || ''}">${staff.note || ''}</td>
            `;

            // 上個月內容 (唯讀)
            prevDaysToShow.forEach(d => {
                html += `<td class="bg-light-gray text-muted small">${prevUserShifts[d] || '-'}</td>`;
            });

            // 當月內容 (可點擊)
            for (let d = 1; d <= daysInMonth; d++) {
                const val = userShifts[d] || '';
                // 這裡簡化：點擊觸發選單 (原本邏輯)
                html += `<td class="p-0 shift-cell" data-staff-id="${uid}" data-day="${d}" style="cursor:pointer; ${val==='OFF'?'background:#f0f0f0':''}">
                            ${val}
                         </td>`;
            }

            // 右側統計
            html += `
                    <td class="sticky-col right-col-4 bg-white fw-bold text-primary" id="stat-off-${uid}">${stats.off}</td>
                    <td class="sticky-col right-col-3 bg-white" id="stat-e-${uid}">${stats.e}</td>
                    <td class="sticky-col right-col-2 bg-white" id="stat-n-${uid}">${stats.n}</td>
                    <td class="sticky-col right-col-1 bg-white" id="stat-hol-${uid}">${stats.hol}</td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
        this.bindMenu();
    }

    // --- 輔助：單人統計計算 ---
    calculateRowStats(shifts) {
        let off = 0, e = 0, n = 0, hol = 0;
        const { year, month, daysInMonth } = this.state;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const s = shifts[d];
            if (!s) continue;
            if (['OFF', 'M_OFF'].includes(s)) off++;
            if (s === 'E') e++;
            if (s === 'N') n++;

            const date = new Date(year, month - 1, d);
            const w = date.getDay();
            // 假日數定義：週六日且非 OFF (即上班)
            if ((w === 0 || w === 6) && !['OFF', 'M_OFF'].includes(s)) {
                hol++;
            }
        }
        return { off, e, n, hol };
    }

    // --- 互動功能 ---
    sortStaff(key) {
        if (this.state.sortKey === key) this.state.sortAsc = !this.state.sortAsc;
        else { this.state.sortKey = key; this.state.sortAsc = true; }
        this.renderGrid();
    }

    // 改寫班別選擇後的操作：包含即時更新統計
    async handleShiftSelect(cell, code) {
        this.closeMenu();
        const uid = cell.dataset.staffId;
        const day = cell.dataset.day;
        
        // 更新 State
        if (!this.state.scheduleData.assignments[uid]) this.state.scheduleData.assignments[uid] = {};
        this.state.scheduleData.assignments[uid][day] = code;
        
        // 更新 UI (不重繪整個 Grid，只更新該格與右側統計)
        cell.textContent = code;
        cell.style.background = code === 'OFF' ? '#f0f0f0' : '';
        
        // 即時重算該員統計
        const stats = this.calculateRowStats(this.state.scheduleData.assignments[uid]);
        document.getElementById(`stat-off-${uid}`).textContent = stats.off;
        document.getElementById(`stat-e-${uid}`).textContent = stats.e;
        document.getElementById(`stat-n-${uid}`).textContent = stats.n;
        document.getElementById(`stat-hol-${uid}`).textContent = stats.hol;

        // 更新資料庫
        await ScheduleService.updateShift(this.state.currentUnitId, this.state.year, this.state.month, uid, day, code);
        this.updateScoreDisplay();
    }

    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;
        
        // 取得預班表 (用於評分比對)
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
        
        // 這裡我們需要傳入 prevAssignments 給 ScoringService 以進行跨月規則檢查
        const fullPreSchedule = {
            ...preSchedule,
            // 為了讓 ScoringService 能讀到上個月的班表，我們將其 assignments 併入或傳入
            // 假設 ScoringService 接受一個名為 preAssignments 的屬性
            assignments: scheduleData.prevAssignments 
        };

        const result = ScoringService.calculate(scheduleData, staffList, unitSettings, fullPreSchedule);
        this.state.scoreResult = result;
        
        const el = document.getElementById('score-display');
        if(el) {
            el.textContent = result.totalScore;
            el.className = `h4 mb-0 fw-bold ${result.totalScore>=80?'text-success':(result.totalScore>=60?'text-warning':'text-danger')}`;
        }
    }

    showScoreDetails() {
        if (!this.state.scoreResult) return alert("尚未計算分數");
        const details = this.state.scoreResult.details;
        
        // 簡單渲染評分細節 (與之前提到的 Modal 結構類似)
        let html = '<div class="accordion" id="scoreAccordion">';
        Object.entries(details).forEach(([key, cat], idx) => {
             html += `
                <div class="accordion-item">
                    <h2 class="accordion-header">
                        <button class="accordion-button ${idx===0?'':'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#c-${key}">
                            <span class="me-auto">${cat.label}</span>
                            <span class="badge bg-primary">${Math.round(cat.score)}分</span>
                        </button>
                    </h2>
                    <div id="c-${key}" class="accordion-collapse collapse ${idx===0?'show':''}">
                        <div class="accordion-body">
                            <ul class="list-group">
                                ${cat.subItems ? cat.subItems.map(item => `
                                    <li class="list-group-item d-flex justify-content-between">
                                        <span>${item.name}</span>
                                        <span>${item.value} <span class="badge bg-secondary">${item.grade}</span></span>
                                    </li>`).join('') : '無細項'}
                            </ul>
                        </div>
                    </div>
                </div>`;
        });
        html += '</div>';
        
        document.getElementById('score-details-body').innerHTML = html;
        this.scoreModal.show();
    }

    async resetToPreSchedule(showConfirm = true) {
        if(showConfirm && !confirm("確定重置？將清除所有已排班別。")) return;
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            const newAssignments = {};
            this.state.staffList.forEach(s => { newAssignments[s.uid] = {}; });

            if (preSchedule && preSchedule.submissions) {
                Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                    if(sub.wishes && newAssignments[uid]) {
                        Object.entries(sub.wishes).forEach(([d, w]) => {
                            newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                        });
                    }
                });
            }
            this.state.scheduleData.assignments = newAssignments;
            
            // 重置時，保留 prevAssignments 不變
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                newAssignments,
                this.state.scheduleData.prevAssignments
            );
            
            this.renderGrid();
            this.updateScoreDisplay();
            if(showConfirm) alert("✅ 已重置。");
        } catch(e) { console.error(e); alert("重置失敗"); } finally { if(loading) loading.style.display = 'none'; }
    }

    async togglePublish() {
        if(!this.state.scheduleData) return;
        const currentStatus = this.state.scheduleData.status;
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        if(confirm(`確定要 ${newStatus==='published'?'發布':'撤回'} 嗎？`)) {
            await ScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, newStatus);
            this.state.scheduleData.status = newStatus;
            this.updateStatusBadge();
            alert(`班表已${newStatus==='published'?'發布':'撤回'}`);
        }
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        const btn = document.getElementById('btn-publish');
        if(!badge || !this.state.scheduleData) return;
        const status = this.state.scheduleData.status;
        if (status === 'published') {
            badge.className = 'badge bg-success'; badge.textContent = '已發布';
            if(btn) { btn.textContent = '撤回班表'; btn.classList.replace('btn-success', 'btn-warning'); }
        } else {
            badge.className = 'badge bg-secondary'; badge.textContent = '草稿';
            if(btn) { btn.textContent = '發布班表'; btn.classList.replace('btn-warning', 'btn-success'); }
        }
    }

    // (RunMultiVersionAI 等方法保持原樣即可，與本次 UI 調整無直接衝突，故省略以節省篇幅)
    async runMultiVersionAI() { /* ... */ }
    renderVersionsModal() { /* ... */ }
    calculateMissingShifts(assignments) { /* ... */ }
    handleDragStart(e, shift) { /* ... */ }
    handleDrop(e, uid, day, versionIdx) { /* ... */ }
    async applyVersion(index) { /* ... */ }
    async deleteStaff(uid) { /* ... */ }
}
