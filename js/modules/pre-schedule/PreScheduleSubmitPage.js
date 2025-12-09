import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; 
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1; 
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth = 1; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        this.currentUser = null;
        this.preSchedule = null;
        this.myWishes = {}; 
        this.isExpired = false; // 是否已截止
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">填寫下個月的預班需求。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <label class="fw-bold mb-0 text-nowrap">預班月份：</label>
                        <input type="month" id="submit-month" class="form-control w-auto" 
                               value="${this.year}-${String(this.month).padStart(2,'0')}">
                        <div class="vr mx-2"></div>
                        <button id="btn-load" class="btn btn-primary w-auto text-nowrap"><i class="fas fa-search"></i> 查詢</button>
                    </div>
                </div>

                <div id="not-open-alert" class="alert alert-warning text-center p-5 shadow-sm" style="display:none;">
                    <h4><i class="fas fa-info-circle"></i> 本月預班尚未開放</h4>
                </div>
                
                <div id="expired-alert" class="alert alert-secondary text-center p-3 shadow-sm" style="display:none;">
                    <h4><i class="fas fa-lock"></i> 預班已截止</h4>
                    <p class="mb-0">已超過截止日期，無法進行修改。</p>
                </div>

                <div id="submit-area" class="row" style="display:none;">
                    <div class="col-lg-8">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 bg-white d-flex justify-content-between align-items-center">
                                <h6 class="m-0 fw-bold text-primary">班表日曆</h6>
                                <span class="badge bg-info text-white">數字 = 全單位預休人數</span>
                            </div>
                            <div class="card-body"><div id="calendar-grid" class="calendar-grid"></div></div>
                        </div>
                    </div>

                    <div class="col-lg-4">
                        <div class="card shadow mb-4 sticky-top" style="top: 80px;">
                            <div class="card-header py-3 bg-primary text-white"><h6 class="m-0 fw-bold">提交確認</h6></div>
                            <div class="card-body">
                                <ul class="list-group list-group-flush mb-3">
                                    <li class="list-group-item d-flex justify-content-between px-0">
                                        <span>預班上限 (含假)</span><span class="badge bg-secondary rounded-pill" id="limit-max">0</span>
                                    </li>
                                    <li class="list-group-item d-flex justify-content-between px-0">
                                        <span class="text-danger">假日上限</span><span class="badge bg-danger rounded-pill" id="limit-holiday">0</span>
                                    </li>
                                    <li class="list-group-item d-flex justify-content-between px-0 bg-light rounded p-2 mt-1">
                                        <span class="fw-bold">目前已選</span><span class="badge bg-primary rounded-pill fs-5" id="current-count">0</span>
                                    </li>
                                </ul>
                                
                                <div class="mb-3">
                                    <label class="small fw-bold text-secondary">備註</label>
                                    <textarea id="wish-notes" class="form-control" rows="3"></textarea>
                                </div>
                                
                                <div class="d-grid gap-2">
                                    <button id="btn-submit" class="btn btn-success btn-lg shadow-sm">提交預班</button>
                                </div>
                                <div class="mt-3 text-center"><small id="last-submit-time" class="text-muted"></small></div>
                            </div>
                        </div>
                    </div>
                </div>
                <style>
                    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                    .calendar-header { text-align: center; font-weight: bold; padding: 5px; color: #4e73df; }
                    .calendar-cell { border: 1px solid #e3e6f0; border-radius: 8px; min-height: 80px; padding: 5px; cursor: pointer; background: #fff; position: relative; }
                    .calendar-cell:hover { background-color: #f8f9fc; border-color: #4e73df; }
                    .calendar-cell.weekend { background-color: #fffaf0; }
                    .calendar-cell.selected-off { background-color: #ffeaea; border: 2px solid #e74a3b; }
                    .calendar-cell.disabled { opacity: 0.6; cursor: not-allowed; background-color: #f0f0f0; }
                    .day-number { font-weight: bold; font-size: 1.1rem; color: #5a5c69; }
                    .day-number.weekend-text { color: #e74a3b; }
                    .wish-badge { display: block; text-align: center; font-weight: bold; color: #e74a3b; background: rgba(231,74,59,0.1); border-radius: 4px; }
                    .agg-info { text-align: right; font-size: 0.8rem; color: #858796; position: absolute; bottom: 5px; right: 5px; }
                </style>
            </div>
        `;
    }

    async afterRender() {
        const authUser = authService.getCurrentUser();
        if (!authUser) { alert("請先登入"); return; }

        this.currentUser = await userService.getUserData(authUser.uid);
        
        document.getElementById('btn-load').addEventListener('click', () => this.loadData());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

        await this.loadData();
    }

    async loadData() {
        const monthInput = document.getElementById('submit-month').value;
        if (!monthInput) return;
        const [y, m] = monthInput.split('-');
        this.year = parseInt(y); this.month = parseInt(m);

        document.getElementById('submit-area').style.display = 'none';
        document.getElementById('not-open-alert').style.display = 'none';
        document.getElementById('expired-alert').style.display = 'none';

        try {
            this.preSchedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
            
            if (!this.preSchedule || this.preSchedule.status !== 'open') {
                document.getElementById('not-open-alert').style.display = 'block'; return;
            }

            // 檢查是否過期
            const now = new Date().toISOString().split('T')[0];
            this.isExpired = now > this.preSchedule.settings.closeDate;

            if (this.isExpired) {
                document.getElementById('expired-alert').style.display = 'block';
                document.getElementById('submit-area').style.display = 'flex'; // 仍顯示內容但鎖定
                document.getElementById('btn-submit').disabled = true;
                document.getElementById('wish-notes').disabled = true;
            } else {
                document.getElementById('submit-area').style.display = 'flex';
                document.getElementById('btn-submit').disabled = false;
                document.getElementById('wish-notes').disabled = false;
            }

            const { settings, submissions } = this.preSchedule;
            const mySub = submissions && submissions[this.currentUser.uid] ? submissions[this.currentUser.uid] : {};
            this.myWishes = mySub.wishes || {};
            
            document.getElementById('wish-notes').value = mySub.notes || '';
            document.getElementById('limit-max').textContent = settings.maxOffDays;
            document.getElementById('limit-holiday').textContent = settings.maxHoliday || 2;
            
            // 計算統計與渲染
            this.calculateAggregate(submissions);
            this.renderCalendar();
            this.updateCounter();

        } catch (error) { console.error(error); alert("讀取失敗"); }
    }

    calculateAggregate(submissions) {
        this.unitAggregate = {};
        if (!submissions) return;
        Object.values(submissions).forEach(sub => {
            if (sub.wishes) Object.entries(sub.wishes).forEach(([day, wish]) => {
                if (wish === 'OFF') this.unitAggregate[day] = (this.unitAggregate[day] || 0) + 1;
            });
        });
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        ['日','一','二','三','四','五','六'].forEach(w => grid.innerHTML += `<div class="calendar-header">${w}</div>`);

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const firstDay = new Date(this.year, this.month - 1, 1).getDay();
        
        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell" style="cursor:default; background:#f8f9fc;"></div>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const wish = this.myWishes[d];
            const agg = this.unitAggregate[d] || 0;
            const currentWeekDay = new Date(this.year, this.month - 1, d).getDay();
            const isWeekend = (currentWeekDay === 0 || currentWeekDay === 6);
            
            const cell = document.createElement('div');
            let classes = 'calendar-cell';
            if (wish === 'OFF') classes += ' selected-off';
            if (isWeekend) classes += ' weekend';
            if (this.isExpired) classes += ' disabled'; // 過期鎖定樣式
            
            cell.className = classes;
            if (!this.isExpired) cell.onclick = () => this.toggleDate(d, isWeekend);
            
            cell.innerHTML = `
                <div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div>
                ${wish ? '<span class="wish-badge">OFF</span>' : ''}
                <div class="agg-info"><i class="fas fa-users"></i> ${agg}</div>
            `;
            grid.appendChild(cell);
        }
    }

    toggleDate(day, isWeekend) {
        if (this.myWishes[day]) {
            delete this.myWishes[day];
        } else {
            // 檢查總上限
            const currentTotal = Object.keys(this.myWishes).length;
            const maxOff = parseInt(this.preSchedule.settings.maxOffDays);
            if (currentTotal >= maxOff) { alert(`已達總預班上限 (${maxOff} 天)`); return; }

            // 檢查假日上限
            if (isWeekend) {
                let holidayCount = 0;
                Object.keys(this.myWishes).forEach(d => {
                    const wd = new Date(this.year, this.month - 1, d).getDay();
                    if (wd === 0 || wd === 6) holidayCount++;
                });
                const maxHoliday = parseInt(this.preSchedule.settings.maxHoliday || 2);
                if (holidayCount >= maxHoliday) { alert(`已達假日預班上限 (${maxHoliday} 天)`); return; }
            }

            this.myWishes[day] = 'OFF';
        }
        this.renderCalendar();
        this.updateCounter();
    }

    updateCounter() {
        document.getElementById('current-count').textContent = Object.keys(this.myWishes).length;
    }

    async handleSubmit() {
        if (this.isExpired) return;
        if (!confirm('確定提交？')) return;
        const res = await PreScheduleService.submitPersonalWish(
            this.currentUser.unitId, this.year, this.month, this.currentUser.uid,
            this.myWishes, document.getElementById('wish-notes').value
        );
        if (res.success) { alert('✅ 提交成功'); this.loadData(); }
        else alert('❌ 失敗: ' + res.error);
    }
}
