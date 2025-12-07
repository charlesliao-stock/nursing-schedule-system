// ... (imports 保持不變) ...
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { SheetsService } from "../../services/sheets/SheetsService.js";
import { BasicAlgorithm } from "../ai/BasicAlgorithm.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { authService } from "../../services/firebase/AuthService.js"; // 引入 Auth

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
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        // 1. 權限判斷
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        const myUnitId = user.unitId;

        // 2. 準備單位選項
        const units = await UnitService.getAllUnits();
        let unitOptions = '';
        
        if (isSystemAdmin) {
            unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            // 僅顯示自己單位
            const myUnit = units.find(u => u.unitId === myUnitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
                this.state.currentUnitId = myUnit.unitId; // 預設選中
            }
        }

        // 格式化月份
        const monthVal = `${this.state.year}-${String(this.state.month).padStart(2, '0')}`;

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
                    <strong>目前套用規則：</strong>
                    <span id="rule-desc">載入中...</span>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        const loadBtn = document.getElementById('btn-load-schedule');
        
        loadBtn.addEventListener('click', () => {
            this.state.currentUnitId = unitSelect.value;
            const dateVal = monthPicker.value;
            if (!this.state.currentUnitId || !dateVal) { alert("請選擇單位與月份"); return; }
            
            const [y, m] = dateVal.split('-');
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            this.loadData();
        });
        
        // ... (其他事件綁定保持不變) ...
        document.getElementById('btn-auto-fill').addEventListener('click', () => this.runAutoFillOff());
        document.getElementById('btn-validate').addEventListener('click', () => {
            this.renderGrid();
            alert("驗證完成");
        });
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        // 若非管理員且已有單位，可自動載入 (選用)
        // if (unitSelect.disabled && unitSelect.value) { loadBtn.click(); }
    }

    // ... (loadData, renderGrid, bindEvents 等方法保持不變，為節省篇幅省略) ...
    // 請確保使用上一版 SchedulePage.js 的其餘邏輯
    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) this.closeMenu();
    }
    closeMenu() {
        if (this.state.activeMenu) { this.state.activeMenu.remove(); this.state.activeMenu = null; }
    }
    async loadData() { /*...*/ }
    renderGrid() { /*...*/ }
    bindEvents(a, b) { /*...*/ }
    openShiftMenu(a, b, c) { /*...*/ }
    async handleShiftSelect(a, b, c) { /*...*/ }
    async runAutoFillOff() { /*...*/ }
}
