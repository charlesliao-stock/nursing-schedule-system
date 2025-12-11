import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { authService } from "../../services/firebase/AuthService.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";
import { ScoringService } from "../../services/ScoringService.js"; // ✅ 引入評分服務

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null,
            year: null,
            month: null,
            unitSettings: null, 
            staffList: [],
            scheduleData: null,
            daysInMonth: 0,
            activeMenu: null,
            scoreResult: null // 暫存分數
        };
        this.versionsModal = null; 
        this.scoreModal = null;
        this.generatedVersions = [];
        this.draggedShift = null; 
        
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if(!this.state.currentUnitId) return `<div class="alert alert-danger m-4">無效的參數，請從列表頁進入。</div>`;

        return `
            <div class="schedule-container">
                <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-secondary me-3" onclick="window.location.hash='/schedule/list'">
                            <i class="fas fa-arrow-left"></i> 回列表
                        </button>
                        <div>
                            <span class="h4 align-middle fw-bold text-gray-800">
                                ${this.state.year}年 ${this.state.month}月 排班作業
                            </span>
                            <span id="schedule-status-badge" class="badge bg-secondary ms-2">載入中</span>
                        </div>
                    </div>
                    
                    <div id="loading-indicator" style="display:none;" class="text-primary fw-bold">
                        <i class="fas fa-spinner fa-spin"></i> 處理中...
                    </div>

                    <div class="d-flex align-items-center bg-white border rounded px-3 py-1 shadow-sm" style="min-width: 180px;">
                        <div class="me-3 text-end flex-grow-1">
                            <div class="small text-muted fw-bold" style="font-size: 0.75rem;">排班品質總分</div>
                            <div class="h4 mb-0 fw-bold text-primary" id="score-display">--</div>
                        </div>
                        <button class="btn btn-sm btn-outline-info rounded-circle" style="width:32px;height:32px;" 
                                onclick="window.routerPage.showScoreDetails()" title="查看評分詳情">
                            <i class="fas fa-info"></i>
                        </button>
                    </div>
                </div>
                
                <div class="schedule-toolbar d-flex justify-content-between mb-3">
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm shadow-sm" onclick="window.location.hash='/unit/settings/rules'">
                            <i class="fas fa-cog"></i> 規則與權重
                        </button>
                        <button id="btn-clear" class="btn btn-outline-danger btn-sm shadow-sm">
                            <i class="fas fa-undo"></i> 重置回預班狀態
                        </button>
                    </div>

                    <div class="d-flex gap-2">
                        <button id="btn-auto-schedule" class="btn btn-primary shadow-sm" style="background-color: #6366f1; border:none;">
                            <i class="fas fa-magic"></i> 智慧排班 (多版本)
                        </button>
                        
                        <button id="btn-validate" class="btn btn-secondary shadow-sm btn-sm">
                            <i class="fas fa-check-circle"></i> 檢查規則
                        </button>

                        <button id="btn-publish" class="btn btn-success shadow-sm btn-sm">
                            <i class="fas fa-paper-plane"></i> 發布班表
                        </button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper border rounded"></div>

                <div class="modal fade" id="score-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white">
                                <h5 class="modal-title"><i class="fas fa-chart-pie"></i> 評分詳情</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-0">
                                <div id="score-details-body"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="versions-modal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header bg-gradient-primary text-white" style="background: linear-gradient(45deg, #6366f1, #8b5cf6);">
                                <h5 class="modal-title"><i class="fas fa-robot"></i> AI 排班結果預覽與選擇</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-0">
                                <ul class="nav nav-tabs nav-fill bg-light" id="versionTabs" role="tablist">
                                    <li class="nav-item"><button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#v1">版本 1</button></li>
                                    <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v2">版本 2</button></li>
                                    <li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v3">版本 3</button></li>
                                </ul>
                                <div class="tab-content" id="versionTabsContent">
                                    <div class="tab-pane fade show active" id="v1"></div>
                                    <div class="tab-pane fade" id="v2"></div>
                                    <div class="tab-pane fade" id="v3"></div>
                                </div>
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
        document.getElementById('btn-validate').addEventListener('click', () => {
            this.renderGrid();
            alert("驗證完成，違規項目已標示紅框。");
        });
        document.getElementById('btn-publish').addEventListener('click', () => this.togglePublish());

        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        await this.loadData();
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) {
            this.closeMenu();
        }
    }

    closeMenu() {
        if (this.state.activeMenu) {
            this.state.activeMenu.remove();
            this.state.activeMenu = null;
        }
    }

    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';
        container.innerHTML = '<div class="text-center p-5">資料載入中...</div>';

        try {
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            
            if (!schedule) {
                const staffIds = staffList.map(s => s.id);
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId,
                    year: this.state.year,
                    month: this.state.month,
                    status: 'draft',
                    assignments: {}
                };
                staffIds.forEach(id => this.state.scheduleData.assignments[id] = {});
                await this.resetToPreSchedule(false);
            } else {
                this.state.scheduleData = schedule;
            }
            
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            this.renderGrid();
            this.updateStatusBadge();
            
            // ✅ 載入後立即計算分數
            this.updateScoreDisplay();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger m-3">載入失敗: ${error.message}</div>`;
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // ✅ 計算並顯示分數 (右上角)
    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;

        // 讀取預班資料 (計算滿意度所需)
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
        
        // 呼叫 ScoringService
        const result = ScoringService.calculate(scheduleData, staffList, unitSettings, preSchedule);
        this.state.scoreResult = result;

        const scoreEl = document.getElementById('score-display');
        scoreEl.textContent = result.totalScore;
        
        if (result.totalScore >= 90) scoreEl.className = "h4 mb-0 fw-bold text-success";
        else if (result.totalScore >= 70) scoreEl.className = "h4 mb-0 fw-bold text-primary";
        else scoreEl.className = "h4 mb-0 fw-bold text-danger";
    }

    // ✅ 顯示分數詳情 Modal
    showScoreDetails() {
        const r = this.state.scoreResult;
        if (!r) return alert("尚未計算分數");
        
        const d = r.details;
        let html = `
            <div class="p-3 bg-light text-center border-bottom">
                <h1 class="display-4 fw-bold mb-0 ${r.totalScore>=80?'text-success':'text-primary'}">${r.totalScore}</h1>
                <div class="small text-muted">排班品質總分</div>
                ${r.passed ? '<span class="badge bg-success">硬性約束通過</span>' : '<span class="badge bg-danger">硬性約束未通過</span>'}
            </div>
            <div class="list-group list-group-flush">
        `;

        const addItem = (label, scoreObj, suffix='') => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <span class="fw-bold">${label}</span>
                </div>
                <div class="text-end">
                    <span class="badge bg-primary rounded-pill">${scoreObj.score.toFixed(0)}分</span>
                    <div class="small text-muted">${suffix}</div>
                </div>
            </div>
        `;

        html += addItem('公平性 (工時/班次)', d.fairness, `SD: ${d.fairness.stdDev}`);
        html += addItem('員工滿意度', d.satisfaction, `最大連上: ${d.satisfaction.maxConsecutive}`);
        html += addItem('排班效率 (覆蓋率)', d.efficiency, `覆蓋: ${d.efficiency.coverage}`);
        html += addItem('健康安全 (夜班)', d.health, `違規: ${d.health.violations}`);
        html += addItem('排班品質 (資深)', d.quality, `資深率: ${d.quality.ratio}`);
        html += addItem('成本控制 (加班)', d.cost, `加班天: ${d.cost.overtimeDays}`);

        html += `</div>`;

        if (!d.hardConstraints.passed) {
            html += `<div class="alert alert-danger m-3 small"><strong><i class="fas fa-exclamation-triangle"></i> 硬性約束違反：</strong><br>${d.hardConstraints.logs.join('<br>')}</div>`;
        }

        document.getElementById('score-details-body').innerHTML = html;
        this.scoreModal.show();
    }

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = this.generateTableHtml(this.state.scheduleData.assignments, true, false);
        
        const cells = container.querySelectorAll('.shift-cell');
        const shiftDefs = this.state.unitSettings?.settings?.shifts || [];
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openShiftMenu(e.currentTarget, shiftDefs);
            });
        });
    }

    generateTableHtml(assignments, isInteractive, isDropZone, versionIdx = null) {
        const { year, month, daysInMonth, staffList, unitSettings } = this.state;
        const shiftDefs = unitSettings?.settings?.shifts || [];
        const rules = unitSettings?.rules || { constraints: {} }; 
        const tempSchedule = { year, month, assignments };
        const validation = RuleEngine.validateAll(tempSchedule, daysInMonth, staffList, unitSettings, rules);
        const { staffReport, coverageErrors } = validation;

        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);
        shiftMap['OFF'] = { color: '#e5e7eb', name: '休' };
        shiftMap['M_OFF'] = { color: '#6f42c1', name: '管休' }; 

        let headerHtml = '<thead><tr><th class="sticky-col bg-light" style="min-width:140px; z-index:20;">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            let thClass = isWeekend ? 'text-danger' : '';
            if (coverageErrors && coverageErrors[d]) thClass += ' bg-warning'; 
            headerHtml += `<th class="${thClass}" style="min-width:40px;">${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        headerHtml += '</tr></thead>';

        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            const staffAssignments = assignments[staff.id] || {};
            const staffErrors = staffReport[staff.id]?.errors || {};
            const deleteBtn = isInteractive 
                ? `<i class="fas fa-times text-danger ms-2" style="cursor:pointer;" title="移除此人" onclick="window.routerPage.deleteStaff('${staff.id}')"></i>` 
                : '';

            bodyHtml += `<tr>
                <td class="sticky-col bg-white" style="z-index:10;">
                    <div class="d-flex justify-content-between align-items-center">
                        <div><strong>${staff.name}</strong><br><span class="text-muted small">${staff.level || ''}</span></div>
                        ${deleteBtn}
                    </div>
                </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const code = staffAssignments[d] || '';
                let style = '';
                if(code === 'M_OFF') style = 'background-color:#6f42c1; color:white;';
                else if (code && shiftMap[code]) style = `background-color:${shiftMap[code].color}40; border-bottom: 2px solid ${shiftMap[code].color}`;
                
                const errorMsg = staffErrors[d];
                const borderStyle = errorMsg ? 'border: 2px solid red !important;' : '';
                const title = errorMsg ? `title="${errorMsg}"` : '';
                const cellClass = isInteractive ? 'shift-cell' : ''; 
                const cursor = isInteractive ? 'cursor:pointer;' : '';
                const dropAttrs = isDropZone ? `ondragover="event.preventDefault()" ondrop="window.routerPage.handleDrop(event, '${staff.id}', ${d}, ${versionIdx})"` : '';

                bodyHtml += `<td class="${cellClass}" data-staff-id="${staff.id}" data-day="${d}" style="${cursor} ${style}; ${borderStyle}" ${title} ${dropAttrs}>${code === 'M_OFF' ? 'OFF' : code}</td>`;
            }
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';
        return `<table class="schedule-table table table-bordered table-sm text-center mb-0">${headerHtml}${bodyHtml}</table>`;
    }

    async runMultiVersionAI() {
        if (!confirm("確定執行智慧排班？\n這將計算 3 個版本供您選擇。")) return;
        const loading = document.getElementById('loading-indicator');
        loading.style.display = 'block';

        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            const currentData = { ...this.state.scheduleData };
            this.generatedVersions = [];

            for (let i = 1; i <= 3; i++) {
                const result = AutoScheduler.run(currentData, this.state.staffList, this.state.unitSettings, preSchedule);
                // ✅ 計算該版本的詳細分數
                const scoreRes = ScoringService.calculate({ assignments: result.assignments, year: this.state.year, month: this.state.month }, this.state.staffList, this.state.unitSettings, preSchedule);
                
                this.generatedVersions.push({
                    id: i,
                    assignments: result.assignments,
                    logs: result.logs,
                    score: scoreRes // 包含 totalScore 與 details
                });
            }

            this.renderVersionsModal();
            this.versionsModal.show();

        } catch (e) {
            console.error(e);
            alert("演算失敗: " + e.message);
        } finally {
            loading.style.display = 'none';
        }
    }

    renderVersionsModal() {
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;
            const missing = this.calculateMissingShifts(v.assignments);
            
            // ✅ 在版本預覽中顯示分數摘要
            const scoreBadge = v.score.passed 
                ? `<span class="badge bg-success fs-5">${v.score.totalScore} 分</span>` 
                : `<span class="badge bg-danger fs-5">不合格</span>`;

            const infoHtml = `
                <div class="alert alert-light border d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center gap-3">
                        ${scoreBadge}
                        <div class="small text-muted border-start ps-3">
                            <div>公平性: ${v.score.details.fairness.score.toFixed(0)}</div>
                            <div>滿意度: ${v.score.details.satisfaction.score.toFixed(0)}</div>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="window.routerPage.applyVersion(${idx})">套用此版本</button>
                </div>`;

            let poolHtml = '';
            if (missing.length > 0) {
                poolHtml = '<div class="card mb-2 border-danger"><div class="card-header bg-danger text-white py-1 small">缺班池 (請拖曳補班)</div><div class="card-body p-2 d-flex flex-wrap gap-2">';
                missing.forEach(m => {
                    poolHtml += `<span class="badge bg-dark p-2" style="cursor:grab;" draggable="true" ondragstart="window.routerPage.handleDragStart(event, '${m.shift}')">${m.day}日: ${m.shift} <span class="badge bg-light text-dark rounded-pill ms-1">${m.count}</span></span>`;
                });
                poolHtml += '</div></div>';
            } else {
                poolHtml = '<div class="alert alert-success py-1 mb-2 small"><i class="fas fa-check"></i> 人力需求已全數滿足</div>';
            }

            const gridHtml = `<div style="max-height:60vh; overflow:auto;">${this.generateTableHtml(v.assignments, false, true, idx)}</div>`;
            tabPane.innerHTML = infoHtml + poolHtml + gridHtml;
        });
    }

    calculateMissingShifts(assignments) {
        const missing = [];
        const staffReq = this.state.unitSettings.staffRequirements || { D:{}, E:{}, N:{} };
        for(let d=1; d<=this.state.daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month-1, d);
            const w = date.getDay();
            ['N', 'E', 'D'].forEach(shift => {
                const needed = staffReq[shift]?.[w] || 0;
                let count = 0;
                Object.values(assignments).forEach(row => { if(row[d] === shift) count++; });
                if(count < needed) missing.push({ day: d, shift: shift, count: needed - count });
            });
        }
        return missing;
    }

    handleDragStart(e, shift) { e.dataTransfer.setData("text/plain", shift); this.draggedShift = shift; }
    handleDrop(e, uid, day, versionIdx) {
        e.preventDefault();
        const shift = e.dataTransfer.getData("text/plain") || this.draggedShift;
        if(!shift) return;
        const targetVersion = this.generatedVersions[versionIdx];
        if(!targetVersion.assignments[uid]) targetVersion.assignments[uid] = {};
        targetVersion.assignments[uid][day] = shift;
        
        // 重新計算分數
        const preSchedule = { /* 這裡無法同步取得 preSchedule，建議只重繪 UI */ }; 
        // 簡單重繪
        this.renderVersionsModal(); 
    }

    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        this.state.scheduleData.assignments = selected.assignments;
        await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, selected.assignments);
        this.versionsModal.hide();
        this.renderGrid();
        this.updateScoreDisplay(); // 更新主畫面分數
        alert(`✅ 已成功套用版本 ${selected.id} (分數: ${selected.score.totalScore})。`);
    }

    async resetToPreSchedule(showConfirm = true) {
        if(showConfirm && !confirm("確定重置？\n這將清除所有已排的班別，並重新載入預班資料。")) return;
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            const newAssignments = {};
            this.state.staffList.forEach(s => { newAssignments[s.id] = {}; });
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
            await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, newAssignments);
            this.renderGrid();
            this.updateScoreDisplay(); // 更新分數
            if(showConfirm) alert("✅ 已重置為預班初始狀態。");
        } catch(e) { console.error(e); alert("重置失敗"); } finally { if(loading) loading.style.display = 'none'; }
    }

    // 輔助方法：其餘如 togglePublish, updateStatusBadge, openShiftMenu, handleShiftSelect, deleteStaff 保持原樣
    // 為確保完整性，請將上一版的這些方法複製貼上，這裡不再重複列出
    async togglePublish() { /* ... */ }
    updateStatusBadge() { /* ... */ }
    openShiftMenu(cell, shifts) { /* ... */ }
    async handleShiftSelect(cell, code) { /* ... */ }
    async deleteStaff(uid) { /* ... */ }
}
