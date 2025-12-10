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
                            <i class="fas fa-eraser"></i> 清除排班 (保留預班)
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
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header bg-gradient-primary text-white" style="background: linear-gradient(45deg, #6366f1, #8b5cf6);">
                                <h5 class="modal-title"><i class="fas fa-robot"></i> AI 排班結果選擇</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p class="text-muted small">系統已生成 3 種排班方案，請選擇一個最適合的版本套用。</p>
                                <div class="row" id="versions-container"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        
        // 綁定按鈕
        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.clearSchedule());
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
            // 平行載入
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            
            if (!schedule) {
                // 初始化空班表
                const staffIds = staffList.map(s => s.id);
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId,
                    year: this.state.year,
                    month: this.state.month,
                    status: 'draft',
                    assignments: {}
                };
                staffIds.forEach(id => this.state.scheduleData.assignments[id] = {});
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

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        const rules = unitSettings?.rules || { constraints: {} }; 
        const validation = RuleEngine.validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules);
        const { staffReport, coverageErrors } = validation;

        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);
        shiftMap['OFF'] = { color: '#e5e7eb', name: '休' };
        shiftMap['M_OFF'] = { color: '#6f42c1', name: '管休' }; // 紫色顯示

        let headerHtml = '<thead><tr><th class="sticky-col bg-light" style="min-width:120px; z-index:20;">人員 / 日期</th>';
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
            const assignments = scheduleData.assignments[staff.id] || {};
            const staffErrors = staffReport[staff.id]?.errors || {};

            bodyHtml += `<tr>
                <td class="sticky-col bg-white" style="z-index:10;">
                    <strong>${staff.name}</strong><br>
                    <span class="text-muted small">${staff.level || ''}</span>
                </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const code = assignments[d] || '';
                // 顏色處理
                let style = '';
                if(code === 'M_OFF') {
                    style = 'background-color:#6f42c1; color:white;';
                } else if (code && shiftMap[code]) {
                    style = `background-color:${shiftMap[code].color}40; border-bottom: 2px solid ${shiftMap[code].color}`;
                }
                
                const errorMsg = staffErrors[d];
                const borderStyle = errorMsg ? 'border: 2px solid red !important;' : '';
                const title = errorMsg ? `title="${errorMsg}"` : '';

                bodyHtml += `
                    <td class="shift-cell" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        style="cursor:pointer; ${style}; ${borderStyle}"
                        ${title}>
                        ${code === 'M_OFF' ? 'OFF' : code}
                    </td>`;
            }
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';

        container.innerHTML = `<table class="schedule-table table table-bordered table-sm text-center mb-0">${headerHtml}${bodyHtml}</table>`;

        const cells = container.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openShiftMenu(e.currentTarget, shiftDefs);
            });
        });
    }

    openShiftMenu(targetCell, availableShifts) {
        this.closeMenu();
        const menu = document.createElement('div');
        menu.className = 'shift-menu shadow rounded border bg-white';
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000';
        menu.style.padding = '5px';

        const opts = [
            { code: '', name: '清除', color: 'transparent' },
            { code: 'OFF', name: '休假', color: '#e5e7eb' },
            ...availableShifts
        ];

        opts.forEach(s => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item p-1';
            item.style.cursor = 'pointer';
            item.innerHTML = `<span style="display:inline-block;width:15px;height:15px;background:${s.color};margin-right:5px;"></span> ${s.code}`;
            item.onclick = () => this.handleShiftSelect(targetCell, s.code);
            item.onmouseover = () => item.style.backgroundColor = '#f0f0f0';
            item.onmouseout = () => item.style.backgroundColor = 'transparent';
            menu.appendChild(item);
        });

        const rect = targetCell.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    async handleShiftSelect(cell, shiftCode) {
        this.closeMenu();
        const staffId = cell.dataset.staffId;
        const day = cell.dataset.day;

        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;

        this.renderGrid(); // Optimistic Update

        try {
            await ScheduleService.updateShift(
                this.state.currentUnitId,
                this.state.year,
                this.state.month,
                staffId,
                day,
                shiftCode
            );
        } catch (e) {
            console.error(e);
            alert("儲存失敗");
        }
    }

    // =========================================================
    //  多版本 AI 排班 (Req 6)
    // =========================================================
    async runMultiVersionAI() {
        if (!confirm("確定執行智慧排班？\n這將計算 3 個版本供您選擇。")) return;

        const loading = document.getElementById('loading-indicator');
        loading.style.display = 'block';

        try {
            const currentData = this.state.scheduleData;
            const staffList = this.state.staffList;
            const unitSettings = this.state.unitSettings; 
            const preSchedule = await PreScheduleService.getPreSchedule(
                this.state.currentUnitId, this.state.year, this.state.month
            );

            this.generatedVersions = [];

            for (let i = 1; i <= 3; i++) {
                const result = AutoScheduler.run(currentData, staffList, unitSettings, preSchedule);
                const stats = this.calculateStats(result.assignments);
                
                this.generatedVersions.push({
                    id: i,
                    assignments: result.assignments,
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
        
        return {
            sdTotal: sd(counts.map(c=>c.total)),
            sdNight: sd(counts.map(c=>c.night))
        };
    }

    renderVersionsModal() {
        const container = document.getElementById('versions-container');
        container.innerHTML = this.generatedVersions.map(v => `
            <div class="col-md-4">
                <div class="card h-100 border-primary version-card hover-shadow">
                    <div class="card-header bg-light fw-bold text-center">版本 ${v.id}</div>
                    <div class="card-body">
                        <ul class="list-unstyled small mb-3">
                            <li class="d-flex justify-content-between">
                                <span>總班數標準差:</span> <strong class="text-primary">${v.stats.sdTotal}</strong>
                            </li>
                            <li class="d-flex justify-content-between">
                                <span>夜班標準差:</span> <strong class="text-warning">${v.stats.sdNight}</strong>
                            </li>
                            <li class="d-flex justify-content-between mt-2">
                                <span>未滿警告:</span> <span class="badge ${v.logs.length>0?'bg-danger':'bg-success'}">${v.logs.length}</span>
                            </li>
                        </ul>
                        <button class="btn btn-outline-primary w-100" onclick="window.routerPage.applyVersion(${v.id-1})">
                            套用此版本
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        window.routerPage = this;
    }

    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        this.state.scheduleData.assignments = selected.assignments;
        
        await ScheduleService.updateAllAssignments(
            this.state.currentUnitId, this.state.year, this.state.month, selected.assignments
        );
        
        this.versionsModal.hide();
        this.renderGrid();
        
        if (selected.logs.length > 0) {
            alert(`已套用版本 ${selected.id}。\n注意：有 ${selected.logs.length} 處人力不足，請手動調整。`);
        } else {
            alert(`✅ 已成功套用版本 ${selected.id}。`);
        }
    }

    async clearSchedule() {
        if(!confirm("確定清除？\n這將刪除所有已排的班別，只保留「預班(OFF/M_OFF)」。")) return;
        
        const assignments = this.state.scheduleData.assignments;
        let count = 0;
        
        Object.keys(assignments).forEach(uid => {
            Object.keys(assignments[uid]).forEach(day => {
                const code = assignments[uid][day];
                // ✅ 保留 OFF 與 M_OFF
                if (code && code !== 'OFF' && code !== 'M_OFF') {
                    delete assignments[uid][day];
                    count++;
                }
            });
        });

        await ScheduleService.updateAllAssignments(
            this.state.currentUnitId, this.state.year, this.state.month, assignments
        );
        
        this.renderGrid();
        alert(`已清除 ${count} 格班別，保留預班設定。`);
    }

    showStatistics() {
        const stats = this.calculateStats(this.state.scheduleData.assignments);
        alert(`當前評分：\n總班數 SD: ${stats.sdTotal}\n夜班 SD: ${stats.sdNight}`);
        // 也可以用 Modal 顯示更詳細的
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
            if(btn) {
                btn.textContent = '撤回班表';
                btn.classList.replace('btn-success', 'btn-warning');
            }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2';
            badge.textContent = '草稿';
            if(btn) {
                btn.textContent = '發布班表';
                btn.classList.replace('btn-warning', 'btn-success');
            }
        }
    }
}
