import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";

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
            activeMenu: null // 追蹤目前開啟的選單
        };
        
        // 綁定點擊空白處關閉選單事件
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="schedule-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h2 style="margin:0;">排班管理 (Manual)</h2>
                    <div id="loading-indicator" style="display:none; color: var(--primary-color); font-weight:bold;">
                        <i class="fas fa-spinner fa-spin"></i> 儲存中...
                    </div>
                </div>
                
                <div class="schedule-toolbar">
                    <label>單位：</label>
                    <select id="schedule-unit-select" style="padding:5px;">
                        <option value="">請選擇...</option>
                        ${unitOptions}
                    </select>
                    
                    <label>月份：</label>
                    <input type="month" id="schedule-month-picker" 
                           value="${this.state.year}-${String(this.state.month).padStart(2, '0')}"
                           style="padding:5px;">
                    
                    <button id="btn-load-schedule" class="btn-primary">查詢 / 重新載入</button>
                    <button id="btn-auto-fill" class="btn-secondary" disabled style="background:#e5e7eb; color:#999; cursor:not-allowed;">AI 自動排班</button>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper">
                    <div style="text-align:center; padding:50px; color:#666;">
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
            const dateVal = monthPicker.value;
            if (!unitId || !dateVal) { alert("請選擇單位與月份"); return; }

            const [y, m] = dateVal.split('-');
            this.state.currentUnitId = unitId;
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            await this.loadData();
        });

        // 全域監聽點擊，用於關閉選單
        document.removeEventListener('click', this.handleGlobalClick); // 防止重複綁定
        document.addEventListener('click', this.handleGlobalClick);
    }

    handleGlobalClick(e) {
        // 如果點擊的不是 shift-cell 且選單是開啟的，就關閉它
        if (!e.target.classList.contains('shift-cell') && this.state.activeMenu) {
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

        try {
            // 1. 取得單位設定
            const unit = await UnitService.getUnitById(this.state.currentUnitId);
            this.state.unitSettings = unit;

            // 2. 取得人員
            this.state.staffList = await userService.getUnitStaff(this.state.currentUnitId);

            // 3. 取得班表
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

            this.renderGrid();
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="color:red; padding:20px;">載入失敗: ${error.message}</div>`;
        }
    }

    /**
     * 計算統計資料
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
                    stats.shiftCounts[code] = 1; // 處理未定義的班別
                }
                
                // 累加工時 (簡單 parsing: "8" -> 8)
                const shiftSetting = shifts.find(s => s.code === code);
                if (shiftSetting) {
                    // 假設 shiftSetting.hours 欄位存在，或從 time (08-16) 計算
                    // 這裡暫時預設每班 8 小時，若有 OFF 則 0
                    if (code !== 'OFF') {
                        stats.totalHours += 8; // TODO: 之後應從 Shift Settings 讀取精確工時
                    }
                }
            }
        }
        return stats;
    }

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        
        // 班別對照表
        const shiftMap = {};
        const availableShifts = unitSettings?.settings?.shifts || [];
        availableShifts.forEach(s => {
            shiftMap[s.code] = { color: s.color, name: s.name };
        });

        // --- 表頭 ---
        let headerHtml = '<thead><tr><th class="sticky-col">人員</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            headerHtml += `<th class="${isWeekend ? 'is-weekend' : ''}">${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        // 統計欄位表頭
        headerHtml += `<th class="stats-col stats-header sticky-col-right">總工時</th>`;
        availableShifts.forEach(s => {
            // 只顯示非 OFF 的班別統計
            if(s.code !== 'OFF') {
                headerHtml += `<th class="stats-col stats-header">${s.code}</th>`;
            }
        });
        headerHtml += '</tr></thead>';

        // --- 內容 ---
        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
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

            // 統計數據格子
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

        // 綁定事件
        this.bindEvents(availableShifts, shiftMap);
    }

    bindEvents(availableShifts, shiftMap) {
        // 移除舊的 listeners (如果是重新渲染)
        const cells = document.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止觸發全域關閉
                this.openShiftMenu(e.target, availableShifts, shiftMap);
            });
        });
    }

    /**
     * 開啟班別選擇選單
     */
    openShiftMenu(targetCell, availableShifts, shiftMap) {
        this.closeMenu(); // 關閉已存在的

        // 建立選單 DOM
        const menu = document.createElement('div');
        menu.className = 'shift-menu';

        // 1. 加入「清除」選項
        const clearItem = document.createElement('div');
        clearItem.className = 'shift-menu-item';
        clearItem.innerHTML = `<span class="shift-color-dot" style="background:transparent; border:1px solid #ccc;"></span> 清除`;
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

        // 3. 定位選單 (簡單定位，可再優化邊界偵測)
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

        if (shiftCode === currentVal) return; // 沒變更

        // 1. UI 樂觀更新 (Optimistic UI Update)
        cell.textContent = shiftCode;
        cell.dataset.current = shiftCode;
        if (shiftCode && shiftMap[shiftCode]) {
            cell.style.backgroundColor = shiftMap[shiftCode].color + '40';
            cell.style.borderBottom = `3px solid ${shiftMap[shiftCode].color}`;
        } else {
            cell.style.background = 'none';
            cell.style.borderBottom = '1px solid #e5e7eb';
        }

        // 2. 更新本地資料 (為了統計計算)
        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;

        // 3. 重新渲染 (為了更新統計數字)
        // 為了效能，我們可以只更新該列的統計數字 DOM，但這裡先簡單暴力重繪整個表格
        // 為了避免閃爍，我們或許可以只重算 Stats，但先求功能正確
        this.renderGrid(); 

        // 4. 背景儲存
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
            alert('儲存失敗');
            // TODO: 若失敗應回滾 UI
        } finally {
            if(indicator) indicator.style.display = 'none';
        }
    }
}
