// js/modules/schedule/SchedulePage.js
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { SheetsService } from "../../services/sheets/SheetsService.js"; // 【新增】
import { BasicAlgorithm } from "../ai/BasicAlgorithm.js";
import { RuleEngine } from "../ai/RuleEngine.js";

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            unitSettings: null, 
            staffList: [],
            scheduleData: null,
            rules: null, // 【新增】存放排班規則
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
                        <h2 style="margin:0;">排班管理平台</h2>
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
                    <strong>目前套用規則：</strong>
                    <span id="rule-desc">載入中...</span>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // ... (綁定事件邏輯與之前類似，省略部分以節省篇幅) ...
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        const loadBtn = document.getElementById('btn-load-schedule');
        
        // 綁定查詢按鈕
        loadBtn.addEventListener('click', () => {
            const unitId = unitSelect.value;
            const dateVal = monthPicker.value;
            if (!unitId || !dateVal) { alert("請選擇單位與月份"); return; }
            
            const [y, m] = dateVal.split('-');
            this.state.currentUnitId = unitId;
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            this.loadData();
        });
        
        // 綁定其他按鈕...
        document.getElementById('btn-auto-fill').addEventListener('click', () => this.runAutoFillOff());
        document.getElementById('btn-validate').addEventListener('click', () => {
            this.renderGrid(); // 重新渲染會觸發驗證
            alert("驗證完成，違規項目已標示紅框。");
        });

        // 綁定全域點擊關閉 Menu
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
        const ruleBar = document.getElementById('rule-info-bar');
        const ruleDesc = document.getElementById('rule-desc');
        
        container.innerHTML = '<div style="text-align:center; padding:20px;">資料載入中...</div>';
        ruleBar.style.display = 'block';
        ruleDesc.textContent = '讀取規則中...';

        try {
            // 【關鍵】並行載入所有必要資料
            const [unit, staffList, schedule, rules] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month),
                SheetsService.getLatestRules(this.state.currentUnitId) // 從 GAS 讀取規則
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            this.state.rules = rules || { minStaff: {}, constraints: {} }; // 預防無規則

            // 更新規則顯示文字
            const ms = this.state.rules.minStaff || {};
            ruleDesc.innerHTML = `
                人力低限: D=${ms.D||0}, E=${ms.E||0}, N=${ms.N||0} | 
                連續上限: ${this.state.rules.constraints?.maxWorkDays || 6}天
            `;

            if (!schedule) {
                // 若無班表，建立空的
                const staffIds = staffList.map(s => s.id);
                this.state.scheduleData = await ScheduleService.createEmptySchedule(
                    this.state.currentUnitId, this.state.year, this.state.month, staffIds
                );
            } else {
                this.state.scheduleData = schedule;
            }
            
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            // 顯示功能按鈕
            document.getElementById('btn-auto-fill').style.display = 'inline-block';
            document.getElementById('btn-validate').style.display = 'inline-block';
            document.getElementById('btn-publish').style.display = 'inline-block';

            this.renderGrid();

        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="color:red; padding:20px;">載入失敗: ${error.message}</div>`;
        }
    }

    renderGrid() {
        const container = document.getElementById('schedule-grid-container');
        const { year, month, daysInMonth, staffList, scheduleData, unitSettings, rules } = this.state;
        const shiftDefs = unitSettings?.settings?.shifts || [];

        // 1. 執行驗證 (包含個人與整體人力)
        const validation = RuleEngine.validateAll(scheduleData, daysInMonth, staffList, unitSettings, rules);
        const { staffReport, coverageErrors } = validation;

        // 2. 準備班別 Map
        const shiftMap = {};
        shiftDefs.forEach(s => shiftMap[s.code] = s);
        if (!shiftMap['OFF']) shiftMap['OFF'] = { color: '#e5e7eb', name: '休' };

        // 3. 建立表頭
        let headerHtml = '<thead><tr><th class="sticky-col">人員 / 日期</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month - 1, d);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const weekStr = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            
            // 標示缺人狀況
            let dateClass = isWeekend ? 'is-weekend' : '';
            if (coverageErrors[d]) dateClass += ' header-error'; // 缺人紅字

            const titleAttr = coverageErrors[d] ? `title="${coverageErrors[d].join(', ')}"` : '';
            headerHtml += `<th class="${dateClass}" ${titleAttr}>${d}<br><span style="font-size:0.8em">${weekStr}</span></th>`;
        }
        headerHtml += `<th class="stats-col stats-header sticky-col-right">工時</th></tr></thead>`;

        // 4. 建立內容 (人員列表)
        let bodyHtml = '<tbody>';
        staffList.forEach(staff => {
            const assignments = scheduleData.assignments[staff.id] || {};
            const staffErrors = staffReport[staff.id]?.errors || {};

            bodyHtml += `<tr>
                <td class="sticky-col">
                    <strong>${staff.name}</strong><br>
                    <span style="color:#666; font-size:0.8em">${staff.level || ''}</span>
                </td>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const code = assignments[d] || '';
                const style = (code && shiftMap[code]) 
                    ? `background-color:${shiftMap[code].color}40; border-bottom: 3px solid ${shiftMap[code].color}` 
                    : '';
                
                // 違規標示
                const errorMsg = staffErrors[d];
                const violationClass = errorMsg ? 'violation' : '';
                const errorAttr = errorMsg ? `data-error="${errorMsg}"` : '';
                const icon = errorMsg ? '<i class="fas fa-exclamation-circle violation-icon"></i>' : '';

                bodyHtml += `
                    <td class="shift-cell ${violationClass}" 
                        data-staff-id="${staff.id}" 
                        data-day="${d}" 
                        data-current="${code}"
                        ${errorAttr}
                        style="${style}">
                        ${code}
                        ${icon}
                    </td>`;
            }
            // 簡單統計 (省略詳細計算)
            bodyHtml += `<td class="stats-col">-</td></tr>`;
        });

        // 5. 底部人力統計列 (每日 D/E/N 總數)
        // 使用 RuleEngine 回傳的 dailyCounts
        const { dailyCounts } = RuleEngine.validateDailyCoverage(scheduleData, daysInMonth, rules);
        bodyHtml += `<tr style="background:#f1f5f9; font-weight:bold; border-top:2px solid #cbd5e1;">
            <td class="sticky-col">人力統計</td>`;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const counts = dailyCounts[d];
            const errs = coverageErrors[d] || [];
            // 如果當天有缺人，顯示紅色
            const colorStyle = errs.length > 0 ? 'color:red;' : 'color:#475569;';
            
            bodyHtml += `<td style="font-size:0.75rem; vertical-align:top; ${colorStyle}">
                D:${counts.D}<br>E:${counts.E}<br>N:${counts.N}
            </td>`;
        }
        bodyHtml += `<td></td></tr></tbody>`;

        container.innerHTML = `<table class="schedule-table">${headerHtml}${bodyHtml}</table>`;

        // 綁定點擊事件
        this.bindEvents(shiftDefs, shiftMap);
    }

    bindEvents(availableShifts, shiftMap) {
        const cells = document.querySelectorAll('.shift-cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation(); 
                this.openShiftMenu(e.target.closest('.shift-cell'), availableShifts, shiftMap);
            });
        });
    }

    openShiftMenu(targetCell, availableShifts, shiftMap) {
        this.closeMenu();
        // ... (Menu 邏輯與之前相同，請沿用) ...
        const menu = document.createElement('div');
        menu.className = 'shift-menu';

        // 增加 OFF 與清除
        const opts = [
            { code: '', name: '清除', color: 'transparent' },
            { code: 'OFF', name: '休假', color: '#e5e7eb' },
            ...availableShifts
        ];

        opts.forEach(s => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item';
            item.innerHTML = `<span class="shift-color-dot" style="background:${s.color}"></span> ${s.code}`;
            item.onclick = () => this.handleShiftSelect(targetCell, s.code, shiftMap);
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

        // 更新本地資料
        if (!this.state.scheduleData.assignments[staffId]) {
            this.state.scheduleData.assignments[staffId] = {};
        }
        this.state.scheduleData.assignments[staffId][day] = shiftCode;

        // 重新渲染 (觸發即時驗證)
        this.renderGrid();

        // 非同步儲存
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
}
