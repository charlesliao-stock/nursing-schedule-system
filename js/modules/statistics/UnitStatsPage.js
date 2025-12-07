import { StatisticsService } from "../../services/StatisticsService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class UnitStatsPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
    }

    async render() {
        return `
            <div class="container-fluid">
                <h2 class="mb-4"><i class="fas fa-chart-bar"></i> 單位統計報表</h2>
                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold">月份：</label>
                            <input type="month" id="unit-stats-month" class="form-control w-auto" 
                                   value="${this.year}-${String(this.month).padStart(2,'0')}">
                            <button id="btn-unit-query" class="btn btn-primary">查詢</button>
                        </div>
                    </div>
                </div>
                
                <div class="card shadow">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">每日人力覆蓋表</h6></div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-sm text-center">
                                <thead class="table-light">
                                    <tr><th>日期</th><th>白班 (D)</th><th>小夜 (E)</th><th>大夜 (N)</th><th>休假 (OFF)</th><th>總上班</th></tr>
                                </thead>
                                <tbody id="unit-stats-tbody">
                                    <tr><td colspan="6">請查詢</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        
        const load = async () => {
            const [y, m] = document.getElementById('unit-stats-month').value.split('-');
            const schedule = await ScheduleService.getSchedule(user.unitId, parseInt(y), parseInt(m));
            const tbody = document.getElementById('unit-stats-tbody');

            if (!schedule) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-muted p-4">無資料</td></tr>';
                return;
            }

            const dailyStats = StatisticsService.calculateUnitCoverage(schedule);
            
            tbody.innerHTML = Object.entries(dailyStats).map(([day, stats]) => `
                <tr>
                    <td class="fw-bold">${day}</td>
                    <td class="text-primary">${stats.D}</td>
                    <td class="text-warning">${stats.E}</td>
                    <td class="text-danger">${stats.N}</td>
                    <td class="text-muted">${stats.OFF}</td>
                    <td class="fw-bold">${stats.Total}</td>
                </tr>
            `).join('');
        };

        document.getElementById('btn-unit-query').addEventListener('click', load);
        load();
    }
}
