import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { MyScheduleTemplate } from "./templates/MyScheduleTemplate.js"; // 引入 Template

export class MySchedulePage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        this.currentUser = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        return MyScheduleTemplate.renderLayout(this.year, this.month);
    }

    async afterRender() {
        document.getElementById('btn-query').addEventListener('click', () => this.loadSchedule());
        if(this.currentUser && this.currentUser.unitId) {
            this.loadSchedule();
        }
    }

    async loadSchedule() {
        const val = document.getElementById('my-month').value;
        if(!val) return;
        const [y, m] = val.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        
        // 1. 渲染表頭
        document.getElementById('table-head-date').innerHTML = MyScheduleTemplate.renderHeadDate(this.year, this.month, daysInMonth);
        document.getElementById('table-head-week').innerHTML = MyScheduleTemplate.renderHeadWeek(this.year, this.month, daysInMonth);

        // 2. 查詢資料
        const unitId = this.currentUser.unitId;
        if(!unitId) {
            document.getElementById('table-body-shift').innerHTML = `<td colspan="${daysInMonth}" class="p-5 text-muted">您尚未綁定單位</td>`;
            return;
        }

        const schedule = await ScheduleService.getSchedule(unitId, this.year, this.month);
        
        // 3. 渲染內容
        document.getElementById('table-body-shift').innerHTML = 
            MyScheduleTemplate.renderBodyRow(schedule, this.currentUser.uid, daysInMonth);
    }
}
