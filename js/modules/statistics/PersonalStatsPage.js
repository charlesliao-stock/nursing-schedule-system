import { StatisticsService } from "../../services/StatisticsService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PersonalStatsPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
    }

    async render() {
        return `
            <div class="container-fluid">
                <h2 class="mb-4"><i class="fas fa-chart-pie"></i> 個人統計</h2>
                
                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold">月份：</label>
                            <input type="month" id="stats-month" class="form-control w-auto" 
                                   value="${this.year}-${String(this.month).padStart(2,'0')}">
                            <button id="btn-query" class="btn btn-primary">查詢</button>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6 mb-4">
                        <div class="card shadow h-100">
                            <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">班別分佈</h6></div>
                            <div class="card-body">
                                <div id="stats-content" class="text-center p-4">請查詢</div>
                            </div>
                        </div>
                    </div>
                    </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        
        const loadStats = async () => {
            const [y, m] = document.getElementById('stats-month').value.split('-');
            const schedule = await ScheduleService.getSchedule(user.unitId, parseInt(y), parseInt(m));
            
            const content = document.getElementById('stats-content');
            if (!schedule) {
                content.innerHTML = '<div class="text-muted">尚無該月班表</div>';
                return;
            }

            const stats = StatisticsService.calculatePersonal(schedule, user.uid);
            
            content.innerHTML = `
                <div class="row text-center">
                    <div class="col-4 mb-3">
                        <div class="h4 font-weight-bold text-primary">${stats.D}</div>
                        <div class="small text-muted">白班 (D)</div>
                    </div>
                    <div class="col-4 mb-3">
                        <div class="h4 font-weight-bold text-warning">${stats.E}</div>
                        <div class="small text-muted">小夜 (E)</div>
                    </div>
                    <div class="col-4 mb-3">
                        <div class="h4 font-weight-bold text-danger">${stats.N}</div>
                        <div class="small text-muted">大夜 (N)</div>
                    </div>
                    <div class="col-6 mt-3">
                        <div class="h4 font-weight-bold text-success">${stats.OFF}</div>
                        <div class="small text-muted">休假 (OFF)</div>
                    </div>
                    <div class="col-6 mt-3">
                        <div class="h4 font-weight-bold text-info">${stats.holidayShifts}</div>
                        <div class="small text-muted">假日上班</div>
                    </div>
                </div>
                <hr>
                <div class="mt-3">總班數: <strong>${stats.totalShifts}</strong></div>
            `;
        };

        document.getElementById('btn-query').addEventListener('click', loadStats);
        loadStats(); // 初始載入
    }
}
