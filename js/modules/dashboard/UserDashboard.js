import { authService } from "../../services/firebase/AuthService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";

export class UserDashboard {
    constructor(user) {
        this.user = user;
    }

    async render() {
        // 簡易資訊卡片
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 text-gray-800">個人儀表板</h2>
                    <span class="badge bg-info">${this.user.unitId || '無單位'}</span>
                </div>

                <div class="row">
                    <div class="col-xl-3 col-md-6 mb-4">
                        <div class="card border-left-primary shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">下次上班</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800" id="next-shift">載入中...</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-calendar fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/pre-schedule/submit'" style="cursor:pointer;">
                        <div class="card border-left-success shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-success text-uppercase mb-1">本月預班</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800">前往提交</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-edit fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/swaps/apply'" style="cursor:pointer;">
                        <div class="card border-left-warning shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">換班申請</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800">發起/查詢</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-exchange-alt fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3">
                        <h6 class="m-0 font-weight-bold text-primary">公告事項</h6>
                    </div>
                    <div class="card-body">
                        <p>歡迎使用新版排班系統。請確認您的個人資料與班別需求。</p>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // 簡單抓取下一班 (模擬邏輯)
        const date = new Date();
        const schedule = await ScheduleService.getSchedule(this.user.unitId, date.getFullYear(), date.getMonth() + 1);
        if (schedule && schedule.assignments && schedule.assignments[this.user.uid]) {
            const today = date.getDate();
            const shifts = schedule.assignments[this.user.uid];
            let next = '無';
            for(let d = today; d <= 31; d++) {
                if(shifts[d] && shifts[d] !== 'OFF') {
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
