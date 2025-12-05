import { UnitService } from "../../services/firebase/UnitService.js";
// import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 稍後用到

export class SchedulePage {
    constructor() {
        // 狀態管理：目前選擇的單位、年份、月份
        this.state = {
            currentUnitId: null, // 應從 User Session 或下拉選單取得
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1
        };
    }

    async render() {
        return `
            <div class="schedule-container">
                <h2>排班管理</h2>
                
                <div class="schedule-toolbar">
                    <select id="schedule-unit-select">
                        <option value="">載入中...</option>
                    </select>
                    <input type="month" id="schedule-month-picker" value="${this.state.year}-${String(this.state.month).padStart(2, '0')}">
                    <button id="btn-load-schedule" class="btn-primary">查詢班表</button>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper">
                    <p>請選擇單位與月份以檢視班表。</p>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // 1. 綁定事件
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        const loadBtn = document.getElementById('btn-load-schedule');

        // 2. 載入單位列表 (模擬)
        // 實際專案應呼叫 UnitService.getUnits()
        // const units = await UnitService.getAllUnits();
        // 此處先用 console log 測試路由是否正常
        console.log("SchedulePage loaded");
        
        loadBtn.addEventListener('click', () => {
            const [y, m] = monthPicker.value.split('-');
            this.loadScheduleData(unitSelect.value, parseInt(y), parseInt(m));
        });
    }

    async loadScheduleData(unitId, year, month) {
        console.log(`準備載入班表: Unit=${unitId}, ${year}-${month}`);
        // 下一步我們將在這裡呼叫 ScheduleService 並渲染表格
    }
}
