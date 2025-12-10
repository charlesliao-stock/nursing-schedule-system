import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { authService } from "../../services/firebase/AuthService.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";

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
            activeMenu: null 
        };
        this.versionsModal = null; 
        this.generatedVersions = [];
        this.draggedShift = null; // 用於拖曳
        
        // Bind methods
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
                    <div>
                        <button class="btn btn-sm btn-outline-secondary me-2" onclick="window.location.hash='/schedule/list'"><i class="fas fa-arrow-left"></i> 回列表</button>
                        <span class="h4 align-middle fw-bold text-gray-800">
                            ${this.state.year}年 ${this.state.month}月 排班作業
                        </span>
                        <span id="schedule-status-badge" class="badge bg-secondary ms-2">載入中</span>
                    </div>
                    <div id="loading-indicator" style="display:none;" class="text-primary fw-bold"><i class="fas fa-spinner fa-spin"></i> 處理中...</div>
                </div>
                
                <div class="schedule-toolbar d-flex justify-content-between mb-3">
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm shadow-sm" onclick="window.location.hash='/unit/settings/rules'">
                            <i class="fas fa-cog"></i> 排班規則
                        </button>
                        <button id="btn-clear" class="btn btn-outline-danger btn-sm shadow-sm">
                            <i class="fas fa-undo"></i> 重置回預班狀態
                        </button>
                    </div>

                    <div class="d-flex gap-2">
                        <button id="btn-auto-schedule" class="btn btn-primary shadow-sm" style="background-color: #6366f1; border:none;">
                            <i class="fas fa-magic"></i> 智慧排班 (AI)
                        </button>
                        
                        <button id="btn-show-stats" class="btn btn-info text-white shadow-sm btn-sm">
                            <i class="fas fa-chart-bar"></i> 評分
                        </button>
                        
                        <button id="btn-validate" class="btn btn-secondary shadow-sm btn-sm">
                            <i class="fas fa-check-circle"></i> 檢查
                        </button>

                        <button id="btn-publish" class="btn btn-success shadow-sm btn-sm">
                            <i class="fas fa-paper-plane"></i> 發布
                        </button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper border rounded"></div>

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
        window.routerPage = this; // 供 HTML onclick/ondrop 使用

        // 綁定按鈕
        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-show-stats').addEventListener('click', () => this.showStatistics());
        
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
            // 過濾掉已標記刪除的人 (若需要)
            this.state.staffList = staffList;
            
            if (!schedule) {
                // 若無班表，先建立空殼
                const staffIds = staffList.map(s => s.id);
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId,
                    year: this.state.year,
                    month: this.state.month,
                    status: 'draft',
                    assignments: {}
                };
                staffIds.forEach(id => this.state.scheduleData.assignments[id] = {});
                // 自動帶入預班
                await this.resetToPreSchedule(false); // false = 不跳 confirm
            } else {
                this.state.scheduleData = schedule;
            }
            
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            this.renderGrid();
            this.updateStatusBadge();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger m-3">載入失敗: ${error.message}</div>`;
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // =========================================================
    //  主畫面 Grid 渲染
    // =========================================================
    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        // 主畫面 isInteractive = true (可點擊選單)
        // isDropZone = false (主畫面不需缺班池拖放，那是 AI 預覽的功能)
        container.innerHTML = this.generateTableHtml(this.state.scheduleData.assignments, true, false);
        
        // 綁定 Shift Menu 點擊
        const cells = container.querySelectorAll('.shift-cell');
        const shiftDefs = this.state.unitSettings?.settings?.shifts || [];
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openShiftMenu(e.currentTarget, shiftDefs);
            });
        });
    }

    // ✅ 重置回預班狀態 (Req 5: 點選清除時，重新帶入預班)
    async resetToPreSchedule(showConfirm = true) {
        if(showConfirm && !confirm("確定重置？\n這將清除所有已排的班別，並重新載入預班資料 (OFF/M_OFF/指定班)。")) return;
        
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            // 1. 重新讀取最新的預班
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            
            // 2. 重建 assignments
            const newAssignments = {};
            this.state.staffList.forEach(s => { newAssignments[s.id] = {}; });

            if (preSchedule && preSchedule.submissions) {
                Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                    // 只處理目前還在名單內的人
                    if(sub.wishes && newAssignments[uid]) {
                        Object.entries(sub.wishes).forEach(([d, w]) => {
                            // M_OFF 轉 OFF，其餘保留 (包含預排的 D/E/N)
                            newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                        });
                    }
                });
            }

            // 3. 更新 State & DB
            this.state.scheduleData.assignments = newAssignments;
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, this.state.year, this.state.month, newAssignments
            );
            
            this.renderGrid();
            if(showConfirm) alert("✅ 已重置為預班初始狀態。");

        } catch(e) {
            console.error(e);
            alert("重置失敗");
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // ✅ 刪除人員 (Req 5)
    async deleteStaff(uid) {
        if(!confirm("從本月班表中移除此人員？\n(注意：這只會移除此月份的顯示，不會刪除人員帳號)")) return;
        
        const assignments = this.state.scheduleData.assignments;
        delete assignments[uid];
        
        // 暫時從前端清單移除
        this.state.staffList = this.state.staffList.filter(s => s.id !== uid);
        
        await ScheduleService.updateAllAssignments(
            this.state.currentUnitId, this.state.year, this.state.month, assignments
        );
        this.renderGrid();
    }

    // =========================================================
    //  共用 Table 生成 (支援 刪除按鈕 & DropZone)
    // =========================================================
    generateTableHtml(assignments, isInteractive, isDropZone, versionIdx = null) {
        const { year, month, daysInMonth, staffList, unitSettings } = this.state;
        const shiftDefs = unitSettings?.settings?.shifts || [];
        const rules = unitSettings?.rules || { constraints: {} }; 
        
        // 為了驗證紅框
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

            // 人員名稱 + 刪除按鈕
            // 只有主畫面 (isInteractive) 允許刪除人員，預覽畫面不顯示刪除鈕以防誤觸
            const deleteBtn = isInteractive 
                ? `<i class="fas fa-times text-danger ms-2" style="cursor:pointer;" title="移除此人" onclick="window.routerPage.deleteStaff('${staff.id}')"></i>` 
                : '';

            bodyHtml += `<tr>
                <td class="sticky-col bg-white" style="z-index:10;">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${staff.name}</strong><br>
                            <span class="text-muted small">${staff.level || ''}</span>
                        </div>
                        ${deleteBtn}
                    </div>
                </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const code = staffAssignments[d] || '';
                let style = '';
                if(code === 'M_OFF') {
                    style = 'background-color:#6f42c1; color:white;';
                } else if (code && shiftMap[code]) {
                    style = `background-color:${shiftMap[code].color}40; border-bottom: 2px solid ${shiftMap[code].color}`;
                }
                
                const errorMsg = staffErrors[d];
                const borderStyle = errorMsg ? 'border: 2px solid red !important;' : '';
                const title = errorMsg ? `title="${errorMsg}"` : '';
                
                const cellClass = isInteractive ? 'shift-cell' : ''; 
                const cursor = isInteractive ? 'cursor:pointer;' : '';

                // ✅ Drop Zone 屬性 (僅在 AI 預覽模式啟用)
                const dropAttrs = isDropZone 
                    ? `ondragover="event.preventDefault()" ondrop="window.routerPage.handleDrop(event, '${staff.id}', ${d}, ${versionIdx})"` 
                    : '';

                bodyHtml += `
                    <td class="${cellClass}" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        style="${cursor} ${style}; ${borderStyle}"
                        ${title}
                        ${dropAttrs}>
                        ${code === 'M_OFF' ? 'OFF' : code}
                    </td>`;
            }
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';

        return `<table class="schedule-table table table-bordered table-sm text-center mb-0">${headerHtml}${bodyHtml}</table>`;
    }

    // =========================================================
    //  多版本 AI 排班 (含 缺班池 & Drag-Drop)
    // =========================================================
    async runMultiVersionAI() {
        if (!confirm("確定執行智慧排班？\n這將計算 3 個版本供您選擇。")) return;

        const loading = document.getElementById('loading-indicator');
        loading.style.display = 'block';

        try {
            // 重新讀取資料確保最新
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            
            // 使用「當前畫面上的 assignments」作為基底 (保留已排的)
            // 還是要重新 reset? 通常 AI 排班是填空，所以傳入目前的
            const currentData = { ...this.state.scheduleData };
            
            this.generatedVersions = [];

            for (let i = 1; i <= 3; i++) {
                const result = AutoScheduler.run(currentData, this.state.staffList, this.state.unitSettings, preSchedule);
                const stats = this.calculateStats(result.assignments);
                
                this.generatedVersions.push({
                    id: i,
                    assignments: result.assignments, // 這是 AI 算完的結果
                    logs: result.logs,
                    stats: stats 
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

    // ✅ 渲染 AI 預覽與缺班池 (Req 6)
    renderVersionsModal() {
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;

            // 1. 計算缺班
            const missing = this.calculateMissingShifts(v.assignments);
            
            // 2. 評分資訊
            const infoHtml = `
                <div class="alert alert-info py-2 mb-2 d-flex justify-content-between">
                    <span>
                        <strong>SD總班:</strong> ${v.stats.sdTotal} | 
                        <strong>SD夜班:</strong> ${v.stats.sdNight}
                    </span>
                    <button class="btn btn-primary btn-sm" onclick="window.routerPage.applyVersion(${idx})">套用此版本</button>
                </div>`;

            // 3. 缺班池 (Draggable)
            let poolHtml = '';
            if (missing.length > 0) {
                poolHtml = '<div class="card mb-2 border-danger"><div class="card-header bg-danger text-white py-1 small">缺班池 (請拖曳補班)</div><div class="card-body p-2 d-flex flex-wrap gap-2">';
                missing.forEach(m => {
                    poolHtml += `<span class="badge bg-dark p-2" style="cursor:grab;" draggable="true" 
                                    ondragstart="window.routerPage.handleDragStart(event, '${m.shift}')">
                                    ${m.day}日: ${m.shift} <span class="badge bg-light text-dark rounded-pill ms-1">${m.count}</span>
                                 </span>`;
                });
                poolHtml += '</div></div>';
            } else {
                poolHtml = '<div class="alert alert-success py-1 mb-2 small"><i class="fas fa-check"></i> 人力需求已全數滿足</div>';
            }

            // 4. Grid (開啟 DropZone = true, versionIdx = idx)
            const gridHtml = `<div style="max-height:60vh; overflow:auto;">
                                ${this.generateTableHtml(v.assignments, false, true, idx)}
                              </div>`;

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
                if(count < needed) {
                    missing.push({ day: d, shift: shift, count: needed - count });
                }
            });
        }
        return missing;
    }

    // ✅ Drag & Drop Handlers
    handleDragStart(e, shift) {
        e.dataTransfer.setData("text/plain", shift);
        this.draggedShift = shift; // Fallback
    }

    handleDrop(e, uid, day, versionIdx) {
        e.preventDefault();
        const shift = e.dataTransfer.getData("text/plain") || this.draggedShift;
        if(!shift) return;

        // 更新該版本的 assignments
        const targetVersion = this.generatedVersions[versionIdx];
        if(!targetVersion.assignments[uid]) targetVersion.assignments[uid] = {};
        
        targetVersion.assignments[uid][day] = shift;

        // 重新渲染該 Tab (包含 Grid 與 缺班池重算)
        this.renderVersionsModal(); 
    }

    // ... (其他原有方法: calculateStats, applyVersion, showStatistics, togglePublish, updateStatusBadge, openShiftMenu, handleShiftSelect)
    // 為了節省篇幅，請將上一版 SchedulePage.js 的其餘方法複製過來，它們不需要變動。
    calculateStats(assignments) {
        const counts = this.state.staffList.map(s => {
            let total = 0, night = 0;
            const shifts = assignments[s.id] || {};
            Object.values(shifts).forEach(code => {
                if(code && code !== 'OFF' && code !== 'M_OFF') {
                    total++;
                    if(code === 'N' || code === 'E') night++;
                }
            });
            return { total, night };
        });
        
        const sd = (arr) => {
            const m = arr.reduce((a,b)=>a+b,0)/arr.length;
            return Math.sqrt(arr.map(x=>Math.pow(x-m,2)).reduce((a,b)=>a+b,0)/arr.length).toFixed(2);
        };
        
        return { sdTotal: sd(counts.map(c=>c.total)), sdNight: sd(counts.map(c=>c.night)) };
    }

    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        this.state.scheduleData.assignments = selected.assignments;
        await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, selected.assignments);
        this.versionsModal.hide();
        this.renderGrid();
        alert(`✅ 已成功套用版本 ${selected.id}。`);
    }

    showStatistics() {
        const stats = this.calculateStats(this.state.scheduleData.assignments);
        alert(`當前評分：\n總班數 SD: ${stats.sdTotal}\n夜班 SD: ${stats.sdNight}\n(數值越低越平均)`);
    }

    async togglePublish() {
        if(!this.state.scheduleData) return;
        const currentStatus = this.state.scheduleData.status;
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        const actionText = newStatus === 'published' ? '發布' : '撤回';
        if(confirm(`確定要 ${actionText} 此班表嗎？`)) {
            const res = await ScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, newStatus);
            if(res) {
                this.state.scheduleData.status = newStatus;
                this.updateStatusBadge();
                alert(`班表已${actionText}`);
            }
        }
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        const btn = document.getElementById('btn-publish');
        if(!badge || !this.state.scheduleData) return;
        const status = this.state.scheduleData.status;
        if (status === 'published') {
            badge.className = 'badge bg-success ms-2';
            badge.textContent = '已發布';
            if(btn) { btn.textContent = '撤回班表'; btn.classList.replace('btn-success', 'btn-warning'); }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2';
            badge.textContent = '草稿';
            if(btn) { btn.textContent = '發布班表'; btn.classList.replace('btn-warning', 'btn-success'); }
        }
    }
}
