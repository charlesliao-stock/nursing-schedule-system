import { SwapService } from "../../services/firebase/SwapService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SwapApplyPage {
    constructor() {
        this.schedule = null;
        this.staffList = [];
        this.currentUser = null;
    }

    async render() {
        return `
            <div class="container-fluid">
                <h2 class="mb-4"><i class="fas fa-exchange-alt"></i> 申請換班</h2>
                
                <div class="row">
                    <div class="col-md-5">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">填寫申請</h6></div>
                            <div class="card-body">
                                <form id="swap-form">
                                    <div class="mb-3">
                                        <label class="form-label">日期</label>
                                        <input type="date" id="swap-date" class="form-control" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">我的班別</label>
                                        <input type="text" id="my-shift" class="form-control" readonly placeholder="選擇日期後自動帶入">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">換班對象</label>
                                        <select id="target-staff" class="form-select" required>
                                            <option value="">請選擇...</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">對方的班別</label>
                                        <input type="text" id="target-shift" class="form-control" readonly placeholder="選擇對象後自動帶入">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">原因</label>
                                        <textarea id="swap-reason" class="form-control" rows="2"></textarea>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100">送出申請</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-7">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-secondary">申請紀錄</h6></div>
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead><tr><th>日期</th><th>對象</th><th>原班/換班</th><th>狀態</th></tr></thead>
                                        <tbody id="history-tbody"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        this.currentUser = await userService.getUserData(user.uid);
        
        // 載入同單位人員
        this.staffList = await userService.getUnitStaff(this.currentUser.unitId);
        const select = document.getElementById('target-staff');
        this.staffList.forEach(s => {
            if (s.id !== this.currentUser.uid) {
                select.innerHTML += `<option value="${s.id}">${s.name} (${s.level})</option>`;
            }
        });

        // 綁定日期變更 (載入當日班別)
        document.getElementById('swap-date').addEventListener('change', (e) => this.handleDateChange(e.target.value));
        
        // 綁定對象變更
        document.getElementById('target-staff').addEventListener('change', () => this.updateTargetShift());

        // 綁定送出
        document.getElementById('swap-form').addEventListener('submit', (e) => this.handleSubmit(e));

        this.loadHistory();
    }

    async handleDateChange(dateStr) {
        if (!dateStr) return;
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // 載入該月班表
        this.schedule = await ScheduleService.getSchedule(this.currentUser.unitId, year, month);
        
        if (this.schedule && this.schedule.assignments) {
            const myShift = this.schedule.assignments[this.currentUser.uid]?.[day] || 'OFF';
            document.getElementById('my-shift').value = myShift;
            this.updateTargetShift();
        } else {
            document.getElementById('my-shift').value = '無班表';
        }
    }

    updateTargetShift() {
        const targetId = document.getElementById('target-staff').value;
        const dateStr = document.getElementById('swap-date').value;
        
        if (targetId && dateStr && this.schedule) {
            const day = new Date(dateStr).getDate();
            const targetShift = this.schedule.assignments[targetId]?.[day] || 'OFF';
            document.getElementById('target-shift').value = targetShift;
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        const targetId = document.getElementById('target-staff').value;
        const targetName = this.staffList.find(s => s.id === targetId)?.name;
        
        const data = {
            unitId: this.currentUser.unitId,
            requestorId: this.currentUser.uid,
            requestorName: this.currentUser.name,
            targetId: targetId,
            targetName: targetName,
            date: document.getElementById('swap-date').value,
            requestorShift: document.getElementById('my-shift').value,
            targetShift: document.getElementById('target-shift').value,
            reason: document.getElementById('swap-reason').value
        };

        const res = await SwapService.createRequest(data);
        if (res.success) {
            alert('申請已送出');
            this.loadHistory();
        } else {
            alert('失敗: ' + res.error);
        }
    }

    async loadHistory() {
        const list = await SwapService.getUserRequests(this.currentUser.uid);
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} &harr; ${req.targetShift}</td>
                <td><span class="badge bg-${this.getStatusColor(req.status)}">${req.status}</span></td>
            </tr>
        `).join('');
    }

    getStatusColor(s) {
        if(s==='approved') return 'success';
        if(s==='rejected') return 'danger';
        return 'warning';
    }
}
