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
    }

    async render() {
        return `
            <div class="container-fluid">
                <h2 class="mb-4"><i class="fas fa-exchange-alt"></i> 申請換班</h2>
                
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> 請在下方班表中，<strong>點選您想要換班的日期</strong> (僅限點選自己的班別)。
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex justify-content-between align-items-center">
                        <h6 class="m-0 font-weight-bold text-primary">本月班表 (${this.year}-${this.month})</h6>
                        <div>
                            <input type="month" id="swap-month" class="form-control form-control-sm" value="${this.year}-${String(this.month).padStart(2,'0')}">
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover text-center text-nowrap mb-0" id="swap-schedule-table">
                                <thead class="table-light" id="swap-thead"></thead>
                                <tbody id="swap-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-secondary">申請紀錄</h6></div>
                    <div class="card-body">
                        <table class="table table-sm" id="history-table">
                            <thead><tr><th>日期</th><th>對象</th><th>內容</th><th>狀態</th></tr></thead>
                            <tbody id="history-tbody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="modal fade" id="swapModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header bg-primary text-white">
                                <h5 class="modal-title">提出換班申請</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="swap-form">
                                    <div class="mb-3">
                                        <label class="fw-bold">日期</label>
                                        <input type="text" id="modal-date" class="form-control" readonly>
                                        <input type="hidden" id="modal-date-val"> </div>
                                    <div class="mb-3">
                                        <label class="fw-bold">我的班別</label>
                                        <input type="text" id="modal-my-shift" class="form-control" readonly>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold">換班對象 <span class="text-danger">*</span></label>
                                        <select id="modal-target" class="form-select" required>
                                            <option value="">請選擇...</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold">對方的班別</label>
                                        <input type="text" id="modal-target-shift" class="form-control" readonly placeholder="自動帶入">
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold">原因</label>
                                        <textarea id="modal-reason" class="form-control" rows="2"></textarea>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" class="btn btn-primary" id="btn-confirm-swap">送出申請</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.currentUser = authService.getProfile();
        this.staffList = await userService.getUnitStaff(this.currentUser.unitId);
        
        // 綁定月份切換
        document.getElementById('swap-month').addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-');
            this.year = parseInt(y);
            this.month = parseInt(m);
            this.loadSchedule();
        });

        // 綁定 Modal 對象切換 -> 自動帶入對方班別
        document.getElementById('modal-target').addEventListener('change', (e) => this.autoFillTargetShift(e.target.value));

        // 綁定送出
        document.getElementById('btn-confirm-swap').addEventListener('click', () => this.submitRequest());

        this.swapModal = new bootstrap.Modal(document.getElementById('swapModal'));
        this.loadSchedule();
        this.loadHistory();
    }

    async loadSchedule() {
        const thead = document.getElementById('swap-thead');
        const tbody = document.getElementById('swap-tbody');
        tbody.innerHTML = '<tr><td colspan="100">載入中...</td></tr>';

        this.schedule = await ScheduleService.getSchedule(this.currentUser.unitId, this.year, this.month);
        
        // Render Header
        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        let headHtml = '<tr><th class="sticky-col bg-light">人員</th>';
        for(let d=1; d<=daysInMonth; d++) headHtml += `<th>${d}</th>`;
        headHtml += '</tr>';
        thead.innerHTML = headHtml;

        // Render Body
        if (!this.schedule) {
            tbody.innerHTML = '<tr><td colspan="100">尚無班表</td></tr>';
            return;
        }

        let bodyHtml = '';
        // 排序：自己排第一
        const sortedStaff = [...this.staffList].sort((a, b) => (a.id === this.currentUser.uid ? -1 : 1));

        sortedStaff.forEach(staff => {
            const isMe = staff.id === this.currentUser.uid;
            const rowClass = isMe ? 'table-primary' : ''; // 自己的行高亮
            
            let row = `<tr class="${rowClass}"><td class="sticky-col text-start fw-bold">${staff.name}</td>`;
            const shifts = this.schedule.assignments[staff.id] || {};

            for(let d=1; d<=daysInMonth; d++) {
                const shift = shifts[d] || '';
                // 只有自己的格子可以點擊
                const clickAttr = isMe ? `onclick="window.openSwapModal(${d}, '${shift}')"` : '';
                const style = isMe ? 'cursor:pointer; font-weight:bold; text-decoration:underline;' : '';
                
                row += `<td ${clickAttr} style="${style}">${shift}</td>`;
            }
            row += '</tr>';
            bodyHtml += row;
        });
        tbody.innerHTML = bodyHtml;

        // 掛載全域點擊函式
        window.openSwapModal = (day, shift) => this.openModal(day, shift);
    }

    openModal(day, shift) {
        if (!shift) return alert('此日期無班別，無法申請');
        
        const dateStr = `${this.year}-${String(this.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        document.getElementById('modal-date').value = dateStr;
        document.getElementById('modal-date-val').value = day; // 存 day 比較好查
        document.getElementById('modal-my-shift').value = shift;
        
        // 重置對象選單
        const select = document.getElementById('modal-target');
        select.innerHTML = '<option value="">請選擇...</option>';
        this.staffList.forEach(s => {
            if (s.id !== this.currentUser.uid) {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            }
        });
        document.getElementById('modal-target-shift').value = '';
        
        this.swapModal.show();
    }

    autoFillTargetShift(targetId) {
        if (!targetId) return;
        const day = document.getElementById('modal-date-val').value;
        const shift = this.schedule.assignments[targetId]?.[day] || 'OFF';
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
            targetName: this.staffList.find(s => s.id === targetId).name,
            date: document.getElementById('modal-date').value,
            requestorShift: document.getElementById('modal-my-shift').value,
            targetShift: document.getElementById('modal-target-shift').value,
            reason: document.getElementById('modal-reason').value
        };

        const res = await SwapService.createRequest(data);
        if (res.success) {
            alert('申請已送出');
            this.swapModal.hide();
            this.loadHistory();
        } else {
            alert('失敗: ' + res.error);
        }
    }

    async loadHistory() {
        const list = await SwapService.getUserRequests(this.currentUser.uid);
        document.getElementById('history-tbody').innerHTML = list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} &rarr; ${req.targetShift}</td>
                <td><span class="badge bg-secondary">${req.status}</span></td>
            </tr>
        `).join('');
    }
}
