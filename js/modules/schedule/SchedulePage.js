import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { BasicAlgorithm } from "../ai/BasicAlgorithm.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            unitSettings: null, 
            staffList: [],
            scheduleData: null,
            rules: null, 
            daysInMonth: 0,
            activeMenu: null 
        };
        // 綁定 this，確保在 removeEventListener 時能正確參照
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        const myUnitId = user.unitId;

        const units = await UnitService.getAllUnits();
        let unitOptions = '';
        
        if (isSystemAdmin) {
            unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            const myUnit = units.find(u => u.unitId === myUnitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
                this.state.currentUnitId = myUnit.unitId;
            }
        }

        const monthVal = `${this.state.year}-${String(this.state.month).padStart(2, '0')}`;

        return `
            <div class="schedule-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <h2 style="margin:0;">排班管理平台</h2>
                        <span id="schedule-status-badge" class="badge bg-secondary">未載入</span>
                    </div>
                    <div id="loading-indicator" style="display:none; color: var(--primary-color); font-weight:bold;">
                        <i class="fas fa-spinner fa-spin"></i> 處理中...
                    </div>
                </div>
                
                <div class="schedule-toolbar">
                    <div style="display:flex; gap: 10px; align-items:center;">
                        <label>單位：</label>
                        <select id="schedule-unit-select" style="padding:6px; border-radius:4px; border:1px solid #ccc;" ${!isSystemAdmin ? 'disabled' : ''}>
                            ${isSystemAdmin ? '<option value="">請選擇...</option>' : ''}
                            ${unitOptions}
                        </select>
                        
                        <label>月份：</label>
                        <input type="month" id="schedule-month-picker" 
                               value="${monthVal}"
                               style="padding:5px; border-radius:4px; border:1px solid #ccc;">
                        
                        <button id="btn-load-schedule" class="btn-primary">
                            <i class="fas fa-search"></i> 查詢
                        </button>
                    </div>

                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button id="btn-validate" class="btn-secondary" style="background:#e11d48; color:white; display:none;">
                            <i class="fas fa-check-circle"></i> 規則檢查
                        </button>
                        <button id="btn-auto-fill" class="btn-secondary" style="background:#8b5cf6; color:white; display:none;">
                            <i class="fas fa-magic"></i> AI 填充 OFF
                        </button>
                        <button id="btn-publish" class="btn-primary" style="background-color:#10b981; display:none;">
                            <i class="fas fa-paper-plane"></i> 發布班表
                        </button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper">
                    <div style="text-align:center; padding:50px; color:#666;">
                        <i class="fas fa-calendar-alt fa-3x" style="color:#ccc; margin-bottom:10px;"></i><br>
                        請選擇單位與月份以開始排班
                    </div>
                </div>
                
                <div id="rule-info-bar" style="margin-top:10px; padding:10px; background:#f8fafc; border-top:1px solid #e2e8f0; font-size:0.9em; display:none;">
                    <strong>系統訊息：</strong>
                    <span id="rule-desc">準備就緒</span>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        
        document.getElementById('btn-load-schedule').addEventListener('click', async () => {
            this.state.currentUnitId = unitSelect.value;
            const dateVal = monthPicker.value;
            if (!this.state.currentUnitId || !dateVal) { alert("請選擇單位與月份"); return; }
            
            const [y, m] = dateVal.split('-');
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            await this.loadData();
        });

        document.getElementById('btn-auto-fill').addEventListener('click', () => this.runAutoFillOff());
        
        document.getElementById('btn-validate').addEventListener('click', () => {
            this.renderGrid();
            alert("驗證完成，違規項目已標示紅框。");
        });

        const btnPublish = document.getElementById('btn-publish');
        if(btnPublish) {
             btnPublish.addEventListener('click', async () => {
                 if(!this.state.scheduleData) return;
                 const newStatus = this.state.scheduleData.status === 'published' ? 'draft' : 'published';
                 if(confirm(`確定要將狀態變更為 ${newStatus === 'published' ? '發布 (Published)' : '草稿 (Draft)'} 嗎？`)) {
                     await ScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, newStatus);
                     this.state.scheduleData.status = newStatus;
                     this.updateStatusBadge();
                 }
             });
        }

        // 全域點擊監聽 (用於關閉選單)
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        // 如果單位選單有值 (單位管理者)，自動觸發載入
        if (unitSelect.value) {
            this.state.currentUnitId = unitSelect.value;
            setTimeout(() => {
                 const btn = document.getElementById('btn-load-schedule');
                 if(btn) btn.click();
            }, 500); 
        }
    }

    // 【補回】全域點擊處理
    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) {
            this.closeMenu();
        }
    }

    // 【補回】關閉選單
    closeMenu() {
        if (this.state.activeMenu) {
            this.state.activeMenu.remove();
            this.state.activeMenu = null;
        }
    }

    async loadData() {
        if (!this.state.currentUnitId) return alert('請選擇單位');
        const container = document.getElementById('schedule-grid-container');
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';
        container.innerHTML = '<div class="text-center p-5">資料載入中...</div>';

        try {
            // 檢查預班狀態
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            if (preSchedule && preSchedule.status === 'open') {
                if (confirm(`目前 ${this.state.month} 月還在預班開放期間。\n是否要提早關閉預班並開始排班？`)) {
                    await PreScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, 'closed');
                } else {
                    container.innerHTML = '<div class="text-center p-5">已取消排班 (預班進行中)</div>';
                    if(loading) loading.style.display = 'none';
                    return;
                }
            }

            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            
            if (!schedule) {
                // 若無班表，建立空物件 (暫不寫入 DB，等使用者操作)
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
            
            // 顯示功能按鈕
            document.getElementById('btn-auto-fill').style.display = 'inline-block';
            document.getElementById('btn-validate').style.display = 'inline-block';
            document.getElementById('btn-publish').style.display = 'inline-block';

            this.renderGrid();
            this.updateStatusBadge();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="color:red; padding:20px;">載入失敗: ${error.message}</div>`;
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        const shiftDefs = unitSettings?.settings?.shifts || [];
        
        // 執行驗證
        const rules = { minStaff: {}, constraints: {} }; 
        const validation = RuleEngine.validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules);
        const { staffReport, coverageErrors } = validation;

        // 準備 Shift Map
        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);
        shiftMap['OFF'] = { color: '#e5e7eb', name: '休' };

        // 繪製表頭
        let headerHtml = '<thead><tr><th class="sticky-col bg-light" style="min-width:120px; z-index:20;">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            let thClass = isWeekend ? 'text-danger' : '';
            if (coverageErrors && coverageErrors[d]) thClass += ' bg-warning'; // 缺人警示
            
            headerHtml += `<th class="${thClass}" style="min-width:40px;">${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        headerHtml += '</tr></thead>';

        // 繪製內容
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
                const style = (code && shiftMap[code]) ? `background-color:${shiftMap[code].color}40; border-bottom: 2px solid ${shiftMap[code].color}` : '';
                
                // 違規紅框
                const errorMsg = staffErrors[d];
                const borderStyle = errorMsg ? 'border: 2px solid red !important;' : '';
                const title = errorMsg ? `title="${errorMsg}"` : '';

                bodyHtml += `
                    <td class="shift-cell" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        style="cursor:pointer; ${style}; ${borderStyle}"
                        ${title}>
                        ${code}
                    </td>`;
            }
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';

        container.innerHTML = `<table class="schedule-table table table-bordered table-sm text-center mb-0">${headerHtml}${bodyHtml}</table>`;

        // 綁定儲存格點擊事件
        const cells = container.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openShiftMenu(e.currentTarget, shiftDefs);
            });
        });
    }

    // 【補回】開啟班別選單
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

        // 定位
        const rect = targetCell.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
        
        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    // 【補回】處理班別選擇
    async handleShiftSelect(cell, shiftCode) {
        this.closeMenu();
        const staffId = cell.dataset.staffId;
        const day = cell.dataset.day;

        // 更新本地資料
        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;

        // 重新渲染 (觸發驗證)
        this.renderGrid();

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

    // 【補回】AI 填充
    async runAutoFillOff() {
        if (!confirm("確定要將所有空白格子填入 OFF？")) return;
        const { updatedAssignments, count } = BasicAlgorithm.fillEmptyWithOff(
            this.state.scheduleData,
            this.state.daysInMonth,
            this.state.staffList
        );
        this.state.scheduleData.assignments = updatedAssignments;
        this.renderGrid();
        
        await ScheduleService.updateAllAssignments(
            this.state.currentUnitId, 
            this.state.year, 
            this.state.month, 
            updatedAssignments
        );
        alert(`已填充 ${count} 格 OFF`);
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        if(!badge || !this.state.scheduleData) return;
        
        const status = this.state.scheduleData.status;
        if (status === 'published') {
            badge.className = 'badge bg-success';
            badge.textContent = '已發布 (Published)';
            document.getElementById('btn-publish').textContent = '撤回班表';
            document.getElementById('btn-publish').classList.replace('btn-primary', 'btn-warning');
        } else {
            badge.className = 'badge bg-warning text-dark';
            badge.textContent = '草稿 (Draft)';
            document.getElementById('btn-publish').textContent = '發布班表';
            document.getElementById('btn-publish').classList.replace('btn-warning', 'btn-primary');
        }
    }
}
