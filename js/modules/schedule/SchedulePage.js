import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js"; // 引入
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
                        <input type="month" id="schedule-month-picker" value="${monthVal}" style="padding:5px; border-radius:4px;">
                        <button id="btn-load-schedule" class="btn-primary"><i class="fas fa-search"></i> 查詢</button>
                    </div>
                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button id="btn-auto-fill" class="btn-secondary" style="display:none;"><i class="fas fa-magic"></i> AI 填充</button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper">
                    <div style="text-align:center; padding:50px; color:#666;">
                        <i class="fas fa-calendar-alt fa-3x" style="color:#ccc;"></i><br>請查詢
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('schedule-unit-select');
        const monthPicker = document.getElementById('schedule-month-picker');
        
        document.getElementById('btn-load-schedule').addEventListener('click', async () => {
            this.state.currentUnitId = unitSelect.value;
            const [y, m] = monthPicker.value.split('-');
            this.state.year = parseInt(y);
            this.state.month = parseInt(m);
            await this.loadData();
        });

        // 自動載入 (Fix 3: 如果預設有單位，自動載入)
        if (unitSelect.value) {
            this.state.currentUnitId = unitSelect.value;
            // 等待一下確保 DOM 穩定
            setTimeout(() => document.getElementById('btn-load-schedule').click(), 100);
        }
    }

    async loadData() {
        if (!this.state.currentUnitId) return alert('請選擇單位');
        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '載入中...';

        try {
            // Fix 4: 檢查預班狀態
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            if (preSchedule && preSchedule.status === 'open') {
                if (confirm(`目前 ${this.state.month} 月還在預班開放期間。\n是否要提早關閉預班並開始排班？`)) {
                    await PreScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, 'closed');
                } else {
                    container.innerHTML = '<div class="text-center p-5">已取消排班 (預班進行中)</div>';
                    return;
                }
            }

            // 載入正式班表與資料
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            
            // Fix 3: 若無班表，建立空物件以供渲染
            if (!schedule) {
                const staffIds = staffList.map(s => s.id);
                // 這裡暫時只在前端模擬，不直接寫入 DB，等使用者編輯才存
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
            document.getElementById('btn-auto-fill').style.display = 'inline-block';

        } catch (error) {
            console.error(error);
            container.innerHTML = `載入失敗: ${error.message}`;
        }
    }

    renderGrid() {
        // ... (保持原有的 Grid 渲染邏輯) ...
        const container = document.getElementById('schedule-grid-container');
        // ... 實作 Table HTML ...
        // 為節省篇幅，請沿用上一版的 renderGrid 程式碼，重點是 loadData 的修正
        // 但需確保即使 assignments 為空物件也能正確畫出空格子
        
        let html = '<table class="schedule-table"><thead><tr><th class="sticky-col">人員</th>';
        for(let d=1; d<=this.state.daysInMonth; d++) html += `<th>${d}</th>`;
        html += '</tr></thead><tbody>';
        
        this.state.staffList.forEach(staff => {
            const shifts = this.state.scheduleData.assignments[staff.id] || {};
            html += `<tr><td class="sticky-col fw-bold">${staff.name}</td>`;
            for(let d=1; d<=this.state.daysInMonth; d++) {
                const s = shifts[d] || '';
                html += `<td class="shift-cell">${s}</td>`; // 簡化版
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }
    
    // ... 其他 bindEvents ...
}
