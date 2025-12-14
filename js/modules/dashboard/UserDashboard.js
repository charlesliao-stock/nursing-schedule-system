import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { DashboardTemplate } from "./templates/DashboardTemplate.js"; // 引入 Template

export class UserDashboard {
    constructor(user) { this.user = user; }

    async render() {
        return DashboardTemplate.renderUser(this.user.unitId);
    }

    async afterRender() {
        const date = new Date();
        const schedule = await ScheduleService.getSchedule(this.user.unitId, date.getFullYear(), date.getMonth() + 1);
        
        if (schedule && schedule.assignments && schedule.assignments[this.user.uid]) {
            const today = date.getDate();
            const shifts = schedule.assignments[this.user.uid];
            let next = '無';
            for(let d = today; d <= 31; d++) {
                if(shifts[d] && shifts[d] !== 'OFF' && shifts[d] !== 'M_OFF') {
                    next = `${d}日 (${shifts[d]})`;
                    break;
                }
            }
            document.getElementById('next-shift').textContent = next;
        } else {
            document.getElementById('next-shift').textContent = '未發布';
        }
    }
}
