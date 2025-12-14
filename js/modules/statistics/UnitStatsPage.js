import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { UnitStatsTemplate } from "./templates/UnitStatsTemplate.js"; // 引入 Template

export class UnitStatsPage {
    constructor() {
        const today = new Date();
        this.startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}`;
        this.endMonth = this.startMonth;
    }

    async render() {
        return UnitStatsTemplate.renderLayout(this.startMonth, this.endMonth);
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('stats-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let units = [];
        if (isAdmin) {
            units = await UnitService.getAllUnits();
        } else {
            units = await UnitService.getUnitsByManager(user.uid);
            if (units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if (u) units.push(u);
            }
        }

        if (units.length === 0) {
            unitSelect.innerHTML = '<option value="">無權限</option>';
            unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            if (units.length === 1) unitSelect.disabled = true;
        }

        document.getElementById('btn-unit-query').addEventListener('click', () => this.loadStats());
    }

    async loadStats() {
        const unitId = document.getElementById('stats-unit-select').value;
        const sVal = document.getElementById('start-month').value;
        const eVal = document.getElementById('end-month').value;
        
        if(!unitId) return alert("請確認單位");
        if(!sVal || !eVal) return alert("請選擇完整區間");
        if(sVal > eVal) return alert("起始月份不可大於結束月份");

        const tbody = document.getElementById('unit-stats-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="p-5"><span class="spinner-border spinner-border-sm"></span> 統計中...</td></tr>';

        let current = new Date(sVal + '-01');
        const end = new Date(eVal + '-01');
        const aggregate = {};

        while(current <= end) {
            const y = current.getFullYear();
            const m = current.getMonth() + 1;
            const schedule = await ScheduleService.getSchedule(unitId, y, m);
            
            if(schedule && schedule.assignments) {
                const daysInMonth = new Date(y, m, 0).getDate();
                Object.values(schedule.assignments).forEach(staffShifts => {
                    for(let d=1; d<=daysInMonth; d++) {
                        const shift = staffShifts[d];
                        const dateKey = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                        if(!aggregate[dateKey]) aggregate[dateKey] = { D:0, E:0, N:0, OFF:0, Total:0 };
                        
                        if(shift === 'D') aggregate[dateKey].D++;
                        else if(shift === 'E') aggregate[dateKey].E++;
                        else if(shift === 'N') aggregate[dateKey].N++;
                        else if(shift === 'OFF' || shift === 'M_OFF') aggregate[dateKey].OFF++;
                        
                        if(['D','E','N'].includes(shift)) aggregate[dateKey].Total++;
                    }
                });
            }
            current.setMonth(current.getMonth() + 1);
        }

        const sortedKeys = Object.keys(aggregate).sort();
        // 使用 Template 渲染
        tbody.innerHTML = UnitStatsTemplate.renderRows(sortedKeys, aggregate);
    }
}
