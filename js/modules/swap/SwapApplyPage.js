import { SwapService } from "../../services/firebase/SwapService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SwapApplyPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        this.currentUser = null;
        this.schedule = null;
        this.staffList = [];
        this.swapModal = null;
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <h2 class="mb-4"><i class="fas fa-exchange-alt"></i> 申請換班</h2>
                <div class="alert alert-info"><i class="fas fa-info-circle"></i> 請在下方班表中，<strong>點選您想要換班的日期</strong>。</div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex justify-content-between align-items-center">
                        <h6 class="m-0 font-weight-bold text-primary">本月班表 (${this.year}-${this.month})</h6>
                        <input type="month" id="swap-month" class="form-control form-control-sm w-auto" value="${this.year}-${String(this.month).padStart(2,'0')}">
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive" id="schedule-container">
                            <div class="p-5 text-center">載入中...</div>
                        </div>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-success">我的申請紀錄</h6></div>
                    <div class="card-body p-0">
                        <table class="table table-hover mb-0">
                            <thead class="table-light"><tr><th>日期</th><th>對象</th><th>內容</th><th>狀態</th></tr></thead>
                            <tbody id="history-tbody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="modal fade" id="swap-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header"><h5 class="modal-title">提出換班申請</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body">
                                <form id="swap-form">
                                    <div class="mb-3"><label>日期</label><input type="text" id="modal-date" class="form-control" disabled></div>
                                    <div class="mb-3"><label>我的班別</label><input type="text" id="modal-my-shift" class="form-control" disabled></div>
                                    <div class="mb-3"><label>換班對象</label><select id="modal-target" class="form-select"></select></div>
                                    <div class="mb-3"><label>對方的班別</label><input type="text" id="modal-target-shift" class="form-control" disabled></div>
                                    <div class="mb-3"><label>原因</label><textarea id="modal-reason" class="form-control" rows="2"></textarea></div>
                                </form>
                            </div>
                            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-submit-swap" class="btn btn-primary">送出申請</button></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // Fix: 等待 Auth
        let retries = 0;
        while (!authService.getProfile() && retries < 10) {
            await new Promise(r => setTimeout(r, 200));
            retries++;
        }
        this.currentUser = authService.getProfile();
        
        if (!this.currentUser) return; // 避免 Crash

        this.swapModal = new bootstrap.Modal(document.getElementById('swap-modal'));
        document.getElementById('swap-month').addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-');
            this.year = parseInt(y); this.month = parseInt(m);
            this.loadSchedule();
        });
        document.getElementById('modal-target').addEventListener('change', (e) => this.updateTargetShift(e.target.value));
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitRequest());

        await this.loadSchedule();
        await this.loadHistory(); // 確保 UID 存在後才呼叫
    }

    async loadSchedule() {
        const container = document.getElementById('schedule-container');
        if(!this.currentUser.unitId) { container.innerHTML = '<div class="p-5 text-center text-muted">無單位資料</div>'; return; }
        
        const [schedule, staff] = await Promise.all([
            ScheduleService.getSchedule(this.currentUser.unitId, this.year, this.month),
            userService.getUnitStaff(this.currentUser.unitId)
        ]);
        this.schedule = schedule;
        this.staffList = staff;

        if(!schedule) { container.innerHTML = '<div class="p-5 text-center text-muted">本月尚無班表</div>'; return; }

        const days = new Date(this.year, this.month, 0).getDate();
        let html = '<table class="table table-bordered text-center mb-0"><thead><tr><th>人員</th>';
        for(let d=1; d<=days; d++) html += `<th>${d}</th>`;
        html += '</tr></thead><tbody>';

        staff.forEach(s => {
            html += `<tr><td class="fw-bold">${s.name}</td>`;
            for(let d=1; d<=days; d++) {
                const shift = schedule.assignments?.[s.uid]?.[d] || '';
                const isMe = s.uid === this.currentUser.uid;
                const style = isMe ? 'cursor:pointer; background-color:#e0f2fe;' : '';
                const click = isMe ? `onclick="window.routerPage.openSwapModal(${d}, '${shift}')"` : '';
                html += `<td style="${style}" ${click}>${shift}</td>`;
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
        window.routerPage = this;
    }

    openSwapModal(day, myShift) {
        if(!myShift || myShift === 'OFF') { alert("您當天無排班，無需換班"); return; }
        const dateStr = `${this.year}-${String(this.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        document.getElementById('modal-date').value = dateStr;
        document.getElementById('modal-my-shift').value = myShift;
        
        // 填入對象選單 (排除自己)
        const select = document.getElementById('modal-target');
        select.innerHTML = '<option value="">請選擇...</option>' + 
            this.staffList.filter(s => s.uid !== this.currentUser.uid).map(s => `<option value="${s.uid}">${s.name}</option>`).join('');
        
        // 暫存目前的 day
        this.currentDay = day;
        this.swapModal.show();
    }

    updateTargetShift(targetId) {
        if(!targetId) return;
        const shift = this.schedule.assignments?.[targetId]?.[this.currentDay] || 'OFF';
        document.getElementById('modal-target-shift').value = shift;
    }

    async submitRequest() {
        const targetId = document.getElementById('modal-target').value;
        if(!targetId) return alert('請選擇對象');

        const data = {
            unitId: this.currentUser.unitId,
            requestorId: this.currentUser.uid,
            requestorName: this.currentUser.name,
            targetId: targetId,
            targetName: this.staffList.find(s => s.uid === targetId).name,
            date: document.getElementById('modal-date').value,
            requestorShift: document.getElementById('modal-my-shift').value,
            targetShift: document.getElementById('modal-target-shift').value,
            reason: document.getElementById('modal-reason').value
        };

        const res = await SwapService.createRequest(data);
        if (res.success) { alert('申請已送出'); this.swapModal.hide(); this.loadHistory(); }
        else { alert('失敗: ' + res.error); }
    }

    async loadHistory() {
        const list = await SwapService.getUserRequests(this.currentUser.uid);
        document.getElementById('history-tbody').innerHTML = list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} &rarr; ${req.targetShift}</td>
                <td><span class="badge bg-secondary">${req.status}</span></td>
            </tr>`).join('');
    }
}
