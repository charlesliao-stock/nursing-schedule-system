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
            daysInMonth: 0
        };
    }

    async render() {
        // 載入單位選項
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
                    <button id="btn-auto-fill" class="btn-secondary" disabled title="尚未實作" style="background:#e5e7eb; color:#999; cursor:not-allowed;">AI 自動排班</button>
                    <button id="btn-publish" class="btn-primary" style="background-color:#10b981; display:none;">發布班表</button>
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
    }

    /**
     * 載入所有必要資料
     */
    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '<div style="text-align:center; padding:20px;">資料載入中...</div>';

        try {
            // 1. 取得單位資料 (包含班別設定 shifts)
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
     * 渲染 HTML 表格
     */
    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings } = this.state;
        
        // 準備班別顏色的對照表 (Code -> Color)
        const shiftMap = {};
        if (unitSettings && unitSettings.settings && unitSettings.settings.shifts) {
            unitSettings.settings.shifts.forEach(s => {
                shiftMap[s.code] = { color: s.color, name: s.name };
            });
        }

        // --- 1. 建構表頭 (日期) ---
        let headerHtml = '<thead><tr><th class="sticky-col">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dayOfWeek];
            
            headerHtml += `
                <th class="${isWeekend ? 'is-weekend' : ''}">
                    ${d}<br><span style="font-size:0.8em">${weekStr}</span>
                </th>`;
        }
        headerHtml += '</tr></thead>';

        // --- 2. 建構內容 (人員列) ---
        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            // 取得該員工的排班資料 (Map 結構)
            const staffAssignments = scheduleData.assignments ? scheduleData.assignments[staff.id] : {};
            
            bodyHtml += `<tr>`;
            // 固定左側欄：姓名 + 職級
            bodyHtml += `<td class="sticky-col" style="text-align:left; padding-left:10px;">
                            <strong>${staff.name}</strong><br>
                            <span style="color:#666; font-size:0.8em">${staff.level || ''}</span>
                         </td>`;

            // 產生每日格子
            for (let d = 1; d <= daysInMonth; d++) {
                const shiftCode = staffAssignments ? (staffAssignments[d] || '') : '';
                const style = shiftCode && shiftMap[shiftCode] 
                    ? `background-color:${shiftMap[shiftCode].color}40; border-bottom: 3px solid ${shiftMap[shiftCode].color}` 
                    : ''; 

                bodyHtml += `
                    <td class="shift-cell" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        data-current="${shiftCode}"
                        style="${style}"
                        onclick="window.handleCellClick(this)">
                        ${shiftCode}
                    </td>`;
            }
            bodyHtml += `</tr>`;
        });
        bodyHtml += '</tbody>';

        container.innerHTML = `<table class="schedule-table">${headerHtml}${bodyHtml}</table>`;

        // 綁定全域點擊事件處理
        this.bindCellInteraction(shiftMap);
    }

    /**
     * 處理格子點擊互動 (輸入班別)
     */
    bindCellInteraction(shiftMap) {
        window.handleCellClick = async (cell) => {
            const staffId = cell.dataset.staffId;
            const day = cell.dataset.day;
            const currentVal = cell.dataset.current;

            // 產生提示字串
            const shiftOptions = Object.keys(shiftMap).join(', ');
            const input = prompt(`請輸入 ${day} 號的班別 (${shiftOptions}):`, currentVal);

            if (input !== null) { // 如果不是按取消
                const newVal = input.toUpperCase().trim();
                
                // 1. 更新 UI (樂觀更新)
                cell.textContent = newVal;
                // 樣式更新
                if (shiftMap[newVal]) {
                    cell.style.backgroundColor = shiftMap[newVal].color + '40';
                    cell.style.borderBottom = `3px solid ${shiftMap[newVal].color}`;
                } else {
                    cell.style.background = 'none';
                    cell.style.borderBottom = '1px solid #e5e7eb';
                }

                // 2. 顯示 loading
                const indicator = document.getElementById('loading-indicator');
                if(indicator) indicator.style.display = 'block';

                try {
                    // 3. 寫入 Firestore
                    await ScheduleService.updateShift(
                        this.state.currentUnitId,
                        this.state.year,
                        this.state.month,
                        staffId,
                        day,
                        newVal
                    );
                    // 更新本地狀態
                    if (!this.state.scheduleData.assignments[staffId]) {
                        this.state.scheduleData.assignments[staffId] = {};
                    }
                    this.state.scheduleData.assignments[staffId][day] = newVal;
                } catch (error) {
                    alert('儲存失敗，請檢查網路');
                    // 回滾 UI
                    cell.textContent = currentVal;
                } finally {
                    if(indicator) indicator.style.display = 'none';
                }
            }
        };
    }
}
