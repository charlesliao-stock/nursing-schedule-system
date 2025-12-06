import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            unitSettings: null, // 儲存班別設定 (顏色、代號)
            staffList: [],
            scheduleData: null,
            daysInMonth: 0,
            activeMenu: null // 追蹤目前開啟的選單
        };
        
        // 綁定「點擊空白處關閉選單」事件
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        // 載入單位選項
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="schedule-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h2 style="margin:0;">排班管理</h2>
                    <div id="loading-indicator" style="display:none; color: var(--primary-color); font-weight:bold;">
                        <i class="fas fa-spinner fa-spin"></i> 儲存中...
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
                            <i class="fas fa-search"></i> 查詢班表
                        </button>
                    </div>

                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button id="btn-auto-fill" class="btn-secondary" disabled style="background:#e5e7eb; color:#999; cursor:not-allowed;">
                            <i class="fas fa-robot"></i> AI 自動排班
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
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        const loadBtn = document.getElementById('btn-load-schedule');

        loadBtn.addEventListener('click', async () => {
            const unitId = unitSelect.value;
            const dateVal = monthPicker.value; // "2025-01"

            if (!unitId || !dateVal) {
                alert("請選擇單位與月份");
                return;
            }

            const [y, m] = dateVal.split('-');
            this.state.currentUnitId = unitId;
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);

            await this.loadData();
        });

        // 全域監聽點擊，用於關閉選單 (防止選單一直開著)
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);
    }

    handleGlobalClick(e) {
        // 如果點擊的目標不是 shift-cell 且選單是開啟的，就關閉它
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

    /**
     * 載入所有必要資料
     */
    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '<div style="text-align:center; padding:20px;">資料載入中...</div>';

        try {
            // 1. 取得單位設定 (含班別 shifts)
            const unit = await UnitService.getUnitById(this.state.currentUnitId);
            this.state.unitSettings = unit;

            // 2. 取得該單位人員
            this.state.staffList = await userService.getUnitStaff(this.state.currentUnitId);

            // 3. 取得班表 (若無則建立空表)
            let schedule = await ScheduleService.getSchedule(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month
            );

            if (!schedule) {
                console.log("尚無班表，建立新表...");
                // 傳入 staffList 的 IDs 以建立初始結構
                const staffIds = this.state.staffList.map(s => s.id);
                schedule = await ScheduleService.createEmptySchedule(
                    this.state.currentUnitId, 
                    this.state.year, 
                    this.state.month,
                    staffIds
                );
            }
            this.state.scheduleData = schedule;

            // 4. 計算當月天數
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();

            // 5. 渲染表格
            this.renderGrid();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="color:red; padding:20px;">載入失敗: ${error.message}</div>`;
        }
    }

    /**
     * 計算統計資料 (工時與班別次數)
     */
    calculateStats(assignments) {
        const stats = { totalHours: 0, shiftCounts: {} };
        const shifts = this.state.unitSettings?.settings?.shifts || [];
        
        // 初始化計數器
        shifts.forEach(s => stats.shiftCounts[s.code] = 0);

        // 遍歷每一天
        for (let d = 1; d <= this.state.daysInMonth; d++) {
            const code = assignments[d];
            if (code) {
                // 累加次數
                if (stats.shiftCounts[code] !== undefined) {
                    stats.shiftCounts[code]++;
                } else {
                    stats.shiftCounts[code] = 1; 
                }
                
                // 累加工時
                // 這裡暫時預設：非 OFF 的班別皆算 8 小時 (日後可從 shift settings 讀取 hours)
                if (code !== 'OFF') {
                    stats.totalHours += 8; 
                }
            }
        }
        return stats;
    }

    /**
     * 渲染 HTML 表格
     */
    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        
        // 班別對照表 (Code -> Color/Name)
        const shiftMap = {};
        const availableShifts = unitSettings?.settings?.shifts || [];
        availableShifts.forEach(s => {
            shiftMap[s.code] = { color: s.color, name: s.name };
        });

        // --- 1. 建構表頭 (日期 + 統計) ---
        let headerHtml = '<thead><tr><th class="sticky-col">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            
            headerHtml += `
                <th class="${isWeekend ? 'is-weekend' : ''}">
                    ${d}<br><span style="font-size:0.8em">${weekStr}</span>
                </th>`;
        }
        
        // 加入統計表頭
        headerHtml += `<th class="stats-col stats-header sticky-col-right" title="總工時">工時</th>`;
        availableShifts.forEach(s => {
            if(s.code !== 'OFF') { // 不統計 OFF
                headerHtml += `<th class="stats-col stats-header">${s.code}</th>`;
            }
        });
        headerHtml += '</tr></thead>';

        // --- 2. 建構內容 (人員列) ---
        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            // 取得該員工資料
            const assignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            const stats = this.calculateStats(assignments || {});

            bodyHtml += `<tr>`;
            // 姓名欄
            bodyHtml += `<td class="sticky-col" style="text-align:left; padding-left:10px;">
                            <strong>${staff.name}</strong><br>
                            <span style="color:#666; font-size:0.8em">${staff.level || ''}</span>
                         </td>`;

            // 日期格子
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
                    </td>`;
            }

            // 統計數據欄
            bodyHtml += `<td class="stats-col" style="font-weight:bold;">${stats.totalHours}</td>`;
            availableShifts.forEach(s => {
                if(s.code !== 'OFF') {
                    bodyHtml += `<td class="stats-col">${stats.shiftCounts[s.code] || 0}</td>`;
                }
            });

            bodyHtml += `</tr>`;
        });
        bodyHtml += '</tbody>';

        container.innerHTML = `<table class="schedule-table">${headerHtml}${bodyHtml}</table>`;

        // 綁定點擊事件
        this.bindEvents(availableShifts, shiftMap);
    }

    bindEvents(availableShifts, shiftMap) {
        const cells = document.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止冒泡觸發全域關閉
                this.openShiftMenu(e.target, availableShifts, shiftMap);
            });
        });
    }

    /**
     * 開啟班別選擇選單
     */
    openShiftMenu(targetCell, availableShifts, shiftMap) {
        this.closeMenu(); // 先關閉舊的

        // 建立選單 DOM
        const menu = document.createElement('div');
        menu.className = 'shift-menu';

        // 1. 加入「清除」選項
        const clearItem = document.createElement('div');
        clearItem.className = 'shift-menu-item';
        clearItem.innerHTML = `<span class="shift-color-dot" style="background:transparent; border:1px solid #ccc;"></span> 清除 (OFF)`;
        clearItem.onclick = () => this.handleShiftSelect(targetCell, '', shiftMap);
        menu.appendChild(clearItem);

        // 2. 加入各班別選項
        availableShifts.forEach(shift => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item';
            item.innerHTML = `
                <span class="shift-color-dot" style="background:${shift.color}"></span>
                <span>${shift.code} (${shift.name})</span>
            `;
            item.onclick = () => this.handleShiftSelect(targetCell, shift.code, shiftMap);
            menu.appendChild(item);
        });

        // 3. 定位選單
        const rect = targetCell.getBoundingClientRect();
        // 使用 window.scrollX/Y 確保在捲動後位置正確
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

        if (shiftCode === currentVal) return; // 沒變更，不處理

        // 1. UI 樂觀更新 (Optimistic Update)
        cell.textContent = shiftCode;
        cell.dataset.current = shiftCode;
        if (shiftCode && shiftMap[shiftCode]) {
            cell.style.backgroundColor = shiftMap[shiftCode].color + '40'; // 40 hex = 25% opacity
            cell.style.borderBottom = `3px solid ${shiftMap[shiftCode].color}`;
        } else {
            cell.style.background = 'none';
            cell.style.borderBottom = '1px solid #e5e7eb';
        }

        // 2. 更新本地狀態 (為了重新計算統計)
        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;

        // 3. 重新渲染 (觸發統計更新)
        // 為了簡單起見，這裡重新渲染整個表格。
        // 若有效能考量，未來可只更新該列的統計 DOM。
        this.renderGrid(); 

        // 4. 背景儲存到 Firestore
        const indicator = document.getElementById('loading-indicator');
        if(indicator) indicator.style.display = 'block';

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
            alert('儲存失敗，請檢查網路');
            // 失敗時應考慮 rollback UI，這裡暫略
        } finally {
            if(indicator) indicator.style.display = 'none';
        }
    }
}
