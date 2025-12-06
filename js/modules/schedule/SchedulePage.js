import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { BasicAlgorithm } from "../ai/BasicAlgorithm.js";

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            unitSettings: null, 
            staffList: [],
            scheduleData: null,
            daysInMonth: 0,
            activeMenu: null 
        };
        
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="schedule-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <h2 style="margin:0;">排班管理</h2>
                        <span id="schedule-status-badge"></span>
                    </div>
                    <div id="loading-indicator" style="display:none; color: var(--primary-color); font-weight:bold;">
                        <i class="fas fa-spinner fa-spin"></i> 處理中...
                    </div>
                </div>
                
                <div class="schedule-toolbar">
                    <div style="display:flex; gap: 10px; align-items:center;">
                        <label>單位：</label>
                        <select id="schedule-unit-select" style="padding:6px; border-radius:4px; border:1px solid #ccc;">
                            <option value="">請選擇...</option>
                            ${unitOptions}
                        </select>
                        
                        <label>月份：</label>
                        <input type="month" id="schedule-month-picker" 
                               value="${this.state.year}-${String(this.state.month).padStart(2, '0')}"
                               style="padding:5px; border-radius:4px; border:1px solid #ccc;">
                        
                        <button id="btn-load-schedule" class="btn-primary">
                            <i class="fas fa-search"></i> 查詢
                        </button>
                    </div>

                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button id="btn-auto-fill" class="btn-secondary" style="background:#8b5cf6; color:white; display:none;">
                            <i class="fas fa-magic"></i> AI 填充
                        </button>
                        
                        <button id="btn-publish" class="btn-primary" style="background-color:#10b981; display:none;">
                            <i class="fas fa-paper-plane"></i> 發布班表
                        </button>

                        <button id="btn-unlock" class="btn-secondary" style="background-color:#f59e0b; color:white; display:none;">
                            <i class="fas fa-lock-open"></i> 解鎖編輯
                        </button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper">
                    <div style="text-align:center; padding:50px; color:#666;">
                        <i class="fas fa-calendar-alt fa-3x" style="color:#ccc; margin-bottom:10px;"></i><br>
                        請選擇單位與月份以開始排班
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        const loadBtn = document.getElementById('btn-load-schedule');
        const autoFillBtn = document.getElementById('btn-auto-fill');
        const publishBtn = document.getElementById('btn-publish');
        const unlockBtn = document.getElementById('btn-unlock');

        // 載入按鈕
        loadBtn.addEventListener('click', async () => {
            const unitId = unitSelect.value;
            const dateVal = monthPicker.value;
            if (!unitId || !dateVal) { alert("請選擇單位與月份"); return; }
            const [y, m] = dateVal.split('-');
            this.state.currentUnitId = unitId;
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            await this.loadData();
        });

        // AI 填充按鈕
        autoFillBtn.addEventListener('click', async () => {
            if (confirm("AI 助手：確定要將所有「空白格子」自動填入 OFF 嗎？")) {
                await this.runAutoFillOff();
            }
        });

        // 發布按鈕
        publishBtn.addEventListener('click', async () => {
            // 這裡可以加入檢查邏輯 (例如：是否還有空白格)
            if (confirm("確定要發布此班表嗎？\n發布後將鎖定編輯，並開放給員工查閱。")) {
                await this.changeStatus('published');
            }
        });

        // 解鎖按鈕
        unlockBtn.addEventListener('click', async () => {
            if (confirm("確定要撤回發布並解鎖編輯嗎？\n班表將變回「草稿」狀態。")) {
                await this.changeStatus('draft');
            }
        });

        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);
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
        container.innerHTML = '<div style="text-align:center; padding:20px;">資料載入中...</div>';
        
        // 重置按鈕狀態
        document.getElementById('btn-auto-fill').style.display = 'none';
        document.getElementById('btn-publish').style.display = 'none';
        document.getElementById('btn-unlock').style.display = 'none';
        document.getElementById('schedule-status-badge').innerHTML = '';

        try {
            const unit = await UnitService.getUnitById(this.state.currentUnitId);
            this.state.unitSettings = unit;
            this.state.staffList = await userService.getUnitStaff(this.state.currentUnitId);
            
            let schedule = await ScheduleService.getSchedule(
                this.state.currentUnitId, this.state.year, this.state.month
            );

            if (!schedule) {
                const staffIds = this.state.staffList.map(s => s.id);
                schedule = await ScheduleService.createEmptySchedule(
                    this.state.currentUnitId, this.state.year, this.state.month, staffIds
                );
            }
            this.state.scheduleData = schedule;
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            this.updateUIByStatus(); // 根據狀態更新 UI (按鈕、標籤)
            this.renderGrid();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="color:red; padding:20px;">載入失敗: ${error.message}</div>`;
        }
    }

    /**
     * 【Phase 3.4 新增】根據狀態切換按鈕與鎖定
     */
    updateUIByStatus() {
        const status = this.state.scheduleData.status || 'draft';
        const badgeEl = document.getElementById('schedule-status-badge');
        const autoFillBtn = document.getElementById('btn-auto-fill');
        const publishBtn = document.getElementById('btn-publish');
        const unlockBtn = document.getElementById('btn-unlock');

        if (status === 'published') {
            // 已發布狀態
            badgeEl.className = 'status-badge status-published';
            badgeEl.innerHTML = '<i class="fas fa-check-circle"></i> 已發布';
            
            autoFillBtn.style.display = 'none'; // 鎖定時不可用 AI
            publishBtn.style.display = 'none';
            unlockBtn.style.display = 'inline-block'; // 顯示解鎖
        } else {
            // 草稿狀態
            badgeEl.className = 'status-badge status-draft';
            badgeEl.innerHTML = '<i class="fas fa-pencil-alt"></i> 草稿';
            
            autoFillBtn.style.display = 'inline-block';
            publishBtn.style.display = 'inline-block';
            unlockBtn.style.display = 'none';
        }
    }

    /**
     * 【Phase 3.4 新增】切換狀態
     */
    async changeStatus(newStatus) {
        const indicator = document.getElementById('loading-indicator');
        indicator.style.display = 'block';
        try {
            await ScheduleService.updateStatus(
                this.state.currentUnitId,
                this.state.year,
                this.state.month,
                newStatus
            );
            // 更新本地狀態
            this.state.scheduleData.status = newStatus;
            this.updateUIByStatus();
            this.renderGrid(); // 重新渲染以套用/解除鎖定樣式
            
            // alert(`班表狀態已更新為：${newStatus === 'published' ? '已發布' : '草稿'}`);
        } catch (error) {
            alert("狀態更新失敗: " + error.message);
        } finally {
            indicator.style.display = 'none';
        }
    }

    async runAutoFillOff() {
        const indicator = document.getElementById('loading-indicator');
        indicator.style.display = 'block';
        indicator.innerHTML = '<i class="fas fa-magic fa-spin"></i> AI 計算中...';

        try {
            const { updatedAssignments, count } = BasicAlgorithm.fillEmptyWithOff(
                this.state.scheduleData,
                this.state.daysInMonth,
                this.state.staffList
            );

            if (count === 0) {
                alert("目前沒有空白格子需要填充。");
                indicator.style.display = 'none';
                return;
            }

            this.state.scheduleData.assignments = updatedAssignments;
            this.renderGrid(); 

            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId,
                this.state.year,
                this.state.month,
                updatedAssignments
            );
            
            alert(`AI 完成！共填入了 ${count} 個 OFF。`);
        } catch (error) {
            alert("AI 執行失敗: " + error.message);
        } finally {
            indicator.style.display = 'none';
        }
    }

    calculateStats(assignments) {
        const stats = { totalHours: 0, shiftCounts: {} };
        const shifts = this.state.unitSettings?.settings?.shifts || [];
        shifts.forEach(s => stats.shiftCounts[s.code] = 0);

        for (let d = 1; d <= this.state.daysInMonth; d++) {
            const code = assignments[d];
            if (code) {
                if (stats.shiftCounts[code] !== undefined) stats.shiftCounts[code]++;
                else stats.shiftCounts[code] = 1; 
                if (code !== 'OFF') stats.totalHours += 8; 
            }
        }
        return stats;
    }

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        
        // 檢查是否鎖定
        const isLocked = scheduleData.status === 'published';

        const shiftMap = {};
        const availableShifts = unitSettings?.settings?.shifts || [];
        availableShifts.forEach(s => {
            shiftMap[s.code] = { color: s.color, name: s.name };
        });
        if (!shiftMap['OFF']) shiftMap['OFF'] = { color: '#e5e7eb', name: '休假' };

        let headerHtml = '<thead><tr><th class="sticky-col">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            headerHtml += `<th class="${isWeekend ? 'is-weekend' : ''}">${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        
        headerHtml += `<th class="stats-col stats-header sticky-col-right" title="總工時">工時</th>`;
        availableShifts.forEach(s => {
            if(s.code !== 'OFF') {
                headerHtml += `<th class="stats-col stats-header">${s.code}</th>`;
            }
        });
        headerHtml += '</tr></thead>';

        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            const assignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            const stats = this.calculateStats(assignments || {});

            bodyHtml += `<tr>`;
            bodyHtml += `<td class="sticky-col" style="text-align:left; padding-left:10px;">
                            <strong>${staff.name}</strong><br>
                            <span style="color:#666; font-size:0.8em">${staff.level || ''}</span>
                         </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const shiftCode = assignments ? (assignments[d] || '') : '';
                const style = shiftCode && shiftMap[shiftCode] 
                    ? `background-color:${shiftMap[shiftCode].color}40; border-bottom: 3px solid ${shiftMap[shiftCode].color}` 
                    : ''; 

                bodyHtml += `
                    <td class="shift-cell" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        data-current="${shiftCode}"
                        style="${style}">
                        ${shiftCode}
                        ${isLocked ? '<i class="fas fa-lock lock-icon" style="display:none;"></i>' : ''}
                    </td>`;
            }

            bodyHtml += `<td class="stats-col" style="font-weight:bold;">${stats.totalHours}</td>`;
            availableShifts.forEach(s => {
                if(s.code !== 'OFF') {
                    bodyHtml += `<td class="stats-col">${stats.shiftCounts[s.code] || 0}</td>`;
                }
            });
            bodyHtml += `</tr>`;
        });
        bodyHtml += '</tbody>';

        // 加入 locked class 以便 CSS 控制游標
        const tableClass = isLocked ? 'schedule-table locked' : 'schedule-table';
        container.innerHTML = `<table class="${tableClass}">${headerHtml}${bodyHtml}</table>`;

        // 只有在非鎖定狀態下，才綁定點擊事件
        if (!isLocked) {
            this.bindEvents(availableShifts, shiftMap);
        }
    }

    bindEvents(availableShifts, shiftMap) {
        const cells = document.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation(); 
                this.openShiftMenu(e.target, availableShifts, shiftMap);
            });
        });
    }

    openShiftMenu(targetCell, availableShifts, shiftMap) {
        this.closeMenu(); 

        const menu = document.createElement('div');
        menu.className = 'shift-menu';

        const clearItem = document.createElement('div');
        clearItem.className = 'shift-menu-item';
        clearItem.innerHTML = `<span class="shift-color-dot" style="background:transparent; border:1px solid #ccc;"></span> 清除`;
        clearItem.onclick = () => this.handleShiftSelect(targetCell, '', shiftMap);
        menu.appendChild(clearItem);

        const offItem = document.createElement('div');
        offItem.className = 'shift-menu-item';
        offItem.innerHTML = `<span class="shift-color-dot" style="background:#e5e7eb;"></span> OFF (休假)`;
        offItem.onclick = () => this.handleShiftSelect(targetCell, 'OFF', shiftMap);
        menu.appendChild(offItem);

        availableShifts.forEach(shift => {
            if (shift.code === 'OFF') return; 
            const item = document.createElement('div');
            item.className = 'shift-menu-item';
            item.innerHTML = `
                <span class="shift-color-dot" style="background:${shift.color}"></span>
                <span>${shift.code} (${shift.name})</span>
            `;
            item.onclick = () => this.handleShiftSelect(targetCell, shift.code, shiftMap);
            menu.appendChild(item);
        });

        const rect = targetCell.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;

        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    async handleShiftSelect(cell, shiftCode, shiftMap) {
        this.closeMenu();
        const staffId = cell.dataset.staffId;
        const day = cell.dataset.day;
        const currentVal = cell.dataset.current;

        if (shiftCode === currentVal) return; 

        cell.textContent = shiftCode;
        cell.dataset.current = shiftCode;
        if (shiftCode && shiftMap[shiftCode]) {
            cell.style.backgroundColor = shiftMap[shiftCode].color + '40'; 
            cell.style.borderBottom = `3px solid ${shiftMap[shiftCode].color}`;
        } else {
            cell.style.background = 'none';
            cell.style.borderBottom = '1px solid #e5e7eb';
        }

        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;
        this.renderGrid(); 

        const indicator = document.getElementById('loading-indicator');
        if(indicator) {
            indicator.innerHTML = '<i class="fas fa-save"></i> 儲存中...';
            indicator.style.display = 'block';
        }

        try {
            await ScheduleService.updateShift(
                this.state.currentUnitId,
                this.state.year,
                this.state.month,
                staffId,
                day,
                shiftCode
            );
        } catch (error) {
            console.error(error);
            alert('儲存失敗');
        } finally {
            if(indicator) indicator.style.display = 'none';
        }
    }
}
