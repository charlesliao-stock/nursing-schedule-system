import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; 
        if (this.month > 12) { this.month = 1; this.year++; }
        
        this.currentUser = null;
        this.preSchedule = null;
        this.myWishes = {}; 
        this.prevMonthData = null; // 存放前月班表
    }

    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-edit"></i> 提交預班</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="row align-items-center">
                            <div class="col-md-4">
                                <label class="fw-bold">選擇月份：</label>
                                <div class="d-flex gap-2">
                                    <input type="month" id="submit-month" class="form-control" 
                                           value="${this.year}-${String(this.month).padStart(2,'0')}">
                                    <button id="btn-load" class="btn btn-primary">查詢</button>
                                </div>
                            </div>
                            <div class="col-md-8 text-end">
                                <div id="status-alert" class="alert alert-secondary d-inline-block mb-0 py-2">
                                    請選擇月份並查詢
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="submit-area" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-primary">班表日曆</h6>
                                </div>
                                <div class="card-body">
                                    <div id="prev-month-info" class="mb-3 p-2 bg-light border rounded small text-muted">
                                        <i class="fas fa-history"></i> 前月月底班別：<span id="prev-shifts-display">載入中...</span>
                                    </div>
                                    
                                    <div id="calendar-grid" class="calendar-grid"></div>
                                </div>
                            </div>
                            
                            <div class="card shadow mb-4">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-secondary">歷史預班紀錄</h6>
                                </div>
                                <div class="card-body">
                                    <table class="table table-sm table-hover">
                                        <thead><tr><th>月份</th><th>提交日期</th><th>預休天數</th><th>狀態</th></tr></thead>
                                        <tbody id="history-tbody">
                                            <tr><td colspan="4" class="text-center text-muted">尚無歷史紀錄 (開發中)</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-primary">提交確認</h6>
                                </div>
                                <div class="card-body">
                                    <ul class="list-group list-group-flush mb-3">
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>可休上限</span>
                                            <strong id="limit-max">8</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between bg-light">
                                            <span>目前已選</span>
                                            <strong id="current-count" class="text-primary">0</strong>
                                        </li>
                                    </ul>
                                    <textarea id="wish-notes" class="form-control mb-3" rows="3" placeholder="備註..."></textarea>
                                    <div class="d-grid">
                                        <button id="btn-submit" class="btn btn-success btn-lg">提交預班</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <style>
                    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                    .calendar-day-header { text-align: center; font-weight: bold; padding: 10px 0; color: #666; }
                    .calendar-cell { border: 1px solid #e3e6f0; border-radius: 6px; min-height: 80px; padding: 5px; cursor: pointer; background: #fff; position: relative; }
                    .calendar-cell:hover { background-color: #f0f4ff; border-color: #4e73df; }
                    .calendar-cell.is-other-month { background: #f8f9fc; pointer-events: none; }
                    .calendar-cell.selected-off { background-color: #fee2e2; border: 2px solid #e74a3b; }
                    .day-number { font-weight: bold; font-size: 1.1em; }
                    .wish-badge { display: block; text-align: center; margin-top: 10px; font-weight: bold; font-size: 1.2em; color: #e74a3b; }
                </style>
            </div>
        `;
    }

    async afterRender() {
        const authUser = authService.getCurrentUser();
        if (authUser) {
            this.currentUser = await userService.getUserData(authUser.uid);
        }
        if (!this.currentUser || !this.currentUser.unitId) return alert("無法識別單位");

        document.getElementById('btn-load').addEventListener('click', () => this.loadData());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

        this.loadData();
    }

    async loadData() {
        const monthInput = document.getElementById('submit-month').value;
        if (!monthInput) return;
        const [y, m] = monthInput.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        document.getElementById('submit-area').style.display = 'block';
        
        // 1. 載入預班表
        this.preSchedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
        
        // 2. 載入前月班表 (新功能)
        this.prevMonthData = await PreScheduleService.getPreviousMonthLast6Days(
            this.currentUser.unitId, this.year, this.month, this.currentUser.uid
        );
        this.renderPrevMonthInfo();

        if (!this.preSchedule) {
            document.getElementById('status-alert').className = 'alert alert-secondary d-inline-block mb-0 py-2';
            document.getElementById('status-alert').textContent = '尚無預班表';
            document.getElementById('calendar-grid').innerHTML = '';
            return;
        }

        const { status, settings, submissions } = this.preSchedule;
        const mySub = submissions[this.currentUser.uid] || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';
        document.getElementById('limit-max').textContent = settings.maxOffDays;

        // 狀態判斷
        const isOpen = status === 'open';
        document.getElementById('btn-submit').disabled = !isOpen;
        this.isReadOnly = !isOpen;
        
        let statusText = isOpen ? '開放中' : (status==='closed'?'已截止':'草稿');
        let statusClass = isOpen ? 'alert-success' : 'alert-secondary';
        document.getElementById('status-alert').className = `alert ${statusClass} d-inline-block mb-0 py-2`;
        document.getElementById('status-alert').textContent = statusText;

        this.renderCalendar();
        this.updateCounter();
    }

    renderPrevMonthInfo() {
        const el = document.getElementById('prev-shifts-display');
        if (!this.prevMonthData || !this.prevMonthData.data) {
            el.textContent = '無資料';
            return;
        }
        
        // 格式化顯示： 26(D) 27(E) ...
        const shifts = Object.entries(this.prevMonthData.data)
            .map(([day, shift]) => `${day}日:<b>${shift||'-'}</b>`)
            .join(' | ');
        el.innerHTML = shifts;
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        ['日','一','二','三','四','五','六'].forEach(d => grid.innerHTML += `<div class="calendar-day-header">${d}</div>`);

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const firstDay = new Date(this.year, this.month - 1, 1).getDay();

        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell is-other-month"></div>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const wish = this.myWishes[d];
            const cell = document.createElement('div');
            cell.className = `calendar-cell ${wish === 'OFF' ? 'selected-off' : ''}`;
            if(!this.isReadOnly) cell.onclick = () => this.toggleDate(d);
            
            cell.innerHTML = `<div class="day-number">${d}</div>${wish ? '<span class="wish-badge">OFF</span>' : ''}`;
            grid.appendChild(cell);
        }
    }

    toggleDate(day) {
        if (this.myWishes[day]) delete this.myWishes[day];
        else {
            const count = Object.keys(this.myWishes).length;
            if (count >= this.preSchedule.settings.maxOffDays) return alert('已達上限');
            this.myWishes[day] = 'OFF';
        }
        this.renderCalendar();
        this.updateCounter();
    }

    updateCounter() {
        document.getElementById('current-count').textContent = Object.keys(this.myWishes).length;
    }

    async handleSubmit() {
        if (!confirm('確定提交？')) return;
        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        const res = await PreScheduleService.submitPersonalWish(
            this.currentUser.unitId, this.year, this.month, this.currentUser.uid,
            this.myWishes, document.getElementById('wish-notes').value
        );
        if (res.success) { alert('提交成功'); this.loadData(); }
        else { alert('失敗: ' + res.error); btn.disabled = false; }
    }
}
