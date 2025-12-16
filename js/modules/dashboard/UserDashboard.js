import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { SwapService } from "../../services/firebase/SwapService.js"; // 新增引用
import { DashboardTemplate } from "./templates/DashboardTemplate.js"; 

export class UserDashboard {
    constructor(user) { this.user = user; }

    async render() {
        return DashboardTemplate.renderUser(this.user.unitId);
    }

    async afterRender() {
        // 1. 載入下次上班 (維持原樣)
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

        // 2. [新增] 檢查待審核項目
        this.checkPendingSwaps();
    }

    async checkPendingSwaps() {
        const counts = await SwapService.getPendingCounts(this.user.uid, this.user.unitId, false);
        
        if (counts.targetPending > 0) {
            const container = document.getElementById('dashboard-notification-area');
            if (container) {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger d-flex align-items-center justify-content-between shadow-sm" role="alert">
                            <div>
                                <i class="fas fa-exclamation-circle fa-lg me-2"></i>
                                <strong>待辦事項：</strong> 您有 <span class="badge bg-danger fs-6 mx-1">${counts.targetPending}</span> 筆換班申請等待您的同意。
                            </div>
                            <a href="#/swaps/review" class="btn btn-sm btn-danger fw-bold">立即審核</a>
                        </div>
                    </div>
                `;
            }
        }
    }
}
