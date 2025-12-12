import { StatisticsService } from "../../services/StatisticsService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { PersonalStatsTemplate } from "./templates/PersonalStatsTemplate.js"; // 引入 Template

export class PersonalStatsPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
    }

    async render() {
        return PersonalStatsTemplate.renderLayout(this.year, this.month);
    }

    async afterRender() {
        const user = authService.getProfile();
        
        const loadStats = async () => {
            const [y, m] = document.getElementById('stats-month').value.split('-');
            const schedule = await ScheduleService.getSchedule(user.unitId, parseInt(y), parseInt(m));
            
            const content = document.getElementById('stats-content');
            if (!schedule) {
                content.innerHTML = PersonalStatsTemplate.renderContent(null);
                return;
            }

            const stats = StatisticsService.calculatePersonal(schedule, user.uid);
            content.innerHTML = PersonalStatsTemplate.renderContent(stats);
        };

        document.getElementById('btn-query').addEventListener('click', loadStats);
        loadStats(); 
    }
}
