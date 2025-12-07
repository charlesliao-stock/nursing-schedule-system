import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 用於計算給班率
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; 
        if (this.month > 12) { this.month = 1; this.year++; }
        
        this.currentUser = null;
        this.currentUnit = null;
        this.preSchedule = null;
        this.myWishes = {}; 
        this.unitAggregate = {}; // 每日預班總數
    }

    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-edit"></i> 提交預班</h2>
                        <div class="text-muted small mt-1" id="header-info">載入中...</div>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold">預班月份：</label>
                            <input type="month" id="submit-month" class="form-control w-auto" 
                                   value="${this.year}-${String(this.month).padStart(2,'0')}">
                            <button id="btn-load" class="btn btn-primary">查詢</button>
                        </div>
                    </div>
                </div>

                <div id="not-open-alert" class="alert alert-warning text-center p-5" style="display:none;">
                    <i class="fas fa-clock fa-3x mb-3"></i>
                    <h4>本月預班尚未開放</h4>
                    <p>請留意單位公告或聯繫管理者。</p>
                </div>

                <div id="submit-area" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 d-flex justify-content-between">
                                    <h6 class="m-0 font-weight-bold text-primary">班表日曆</h6>
                                    <span class="badge bg-info text-white">大表概況：顯示每日已預休人數</span>
                                </div>
                                <div class="card-body">
                                    <div id="calendar-grid" class="calendar-grid"></div>
                                </div>
                            </div>
                            
                            <div class="card shadow mb-4">
                                <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-success">預班給班率統計</h6></div>
                                <div class="card-body">
                                    <div class="row text-center">
                                        <div class="col border-end">
                                            <div class="h3 font-weight-bold text-gray-800" id="stat-req">0</div>
                                            <div class="small">歷史總預休 (天)</div>
                                        </div>
                                        <div class="col border-end">
                                            <div class="h3 font-weight-bold text-success" id="stat-ok">0</div>
                                            <div class="small">實際給假 (天)</div>
                                        </div>
                                        <div class="col">
                                            <div class="h3 font-weight-bold text-primary" id="stat-rate">0%</div>
                                            <div class="small">達成率</div>
                                        </div>
                                    </div>
                                    <div class="mt-2 text-center small text-muted">* 統計範圍：過去 3 個月</div>
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
                    .calendar-cell { border: 1px solid #e3e6f0; border-radius: 6px; min-height: 90px; padding: 5px; cursor: pointer; background: #fff; position: relative; }
                    .calendar-cell:hover { background-color: #f0f4ff; border-color: #4e73df; }
                    .calendar-cell.selected-off { background-color: #fee2e2; border: 2px solid #e74a3b; }
                    .day-number { font-weight: bold; font-size: 1.1em; }
                    .wish-badge { display: block; text-align: center; margin-top: 5px; font-weight: bold; font-size: 1.2em; color: #e74a3b; }
                    .agg-info { position: absolute; bottom: 5px; right: 5px; font-size: 0.75em; color: #888; }
                </style>
            </div>
        `;
    }

    async afterRender() {
        const authUser = authService.getCurrentUser();
        if (authUser) {
            this.currentUser = await userService.getUserData(authUser.uid);
            // 載入單位名稱
            const unit = await UnitService.getUnitById(this.currentUser.unitId);
            this.currentUnit = unit;
            
            // 更新 Header 資訊 (需求 1)
            document.getElementById('header-info').innerHTML = 
                `單位: <strong>${unit.unitName}</strong> | 身分: <strong>${this.currentUser.name}</strong>`;
        }

        document.getElementById('btn-load').addEventListener('click', () => this.loadData());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

        // 初始載入統計
        this.loadStats(); 
        // 初始載入畫面
        this.loadData();
    }

    async loadData() {
        const monthInput = document.getElementById('submit-month').value;
        const [y, m] = monthInput.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        document.getElementById('submit-area').style.display = 'none';
        document.getElementById('not-open-alert').style.display = 'none';

        // 1. 載入預班表
        this.preSchedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
        
        // 若未開放或無資料
        if (!this.preSchedule || this.preSchedule.status !== 'open') {
            document.getElementById('not-open-alert').style.display = 'block';
            return;
        }

        const { settings, submissions } = this.preSchedule;
        const mySub = submissions[this.currentUser.uid] || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';
        document.getElementById('limit-max').textContent = settings.maxOffDays;

        // 計算大表概況 (每日已畫假人數)
        this.calculateAggregate(submissions);

        // 顯示介面
        document.getElementById('submit-area').style.display = 'block';
        this.renderCalendar();
        this.updateCounter();
    }

    calculateAggregate(submissions) {
        this.unitAggregate = {};
        Object.values(submissions).forEach(sub => {
            if (sub.wishes) {
                Object.entries(sub.wishes).forEach(([day, wish]) => {
                    if (wish === 'OFF') {
                        this.unitAggregate[day] = (this.unitAggregate[day] || 0) + 1;
                    }
                });
            }
        });
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        // ... (Header logic same as before) ...
        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const firstDay = new Date(this.year, this.month - 1, 1).getDay();
        
        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell" style="background:#f8f9fc;pointer-events:none;"></div>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const wish = this.myWishes[d];
            const agg = this.unitAggregate[d] || 0;
            
            const cell = document.createElement('div');
            cell.className = `calendar-cell ${wish === 'OFF' ? 'selected-off' : ''}`;
            cell.onclick = () => this.toggleDate(d);
            
            cell.innerHTML = `
                <div class="day-number">${d}</div>
                ${wish ? '<span class="wish-badge">OFF</span>' : ''}
                <div class="agg-info" title="全單位預休人數"><i class="fas fa-users"></i> ${agg}</div>
            `;
            grid.appendChild(cell);
        }
    }

    toggleDate(day) {
        if (this.myWishes[day]) delete this.myWishes[day];
        else {
            if (Object.keys(this.myWishes).length >= this.preSchedule.settings.maxOffDays) return alert('已達上限');
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
        const res = await PreScheduleService.submitPersonalWish(
            this.currentUser.unitId, this.year, this.month, this.currentUser.uid,
            this.myWishes, document.getElementById('wish-notes').value
        );
        if (res.success) { alert('提交成功'); this.loadData(); }
        else alert('失敗: ' + res.error);
    }

    // 模擬計算給班率 (需整合 ScheduleService 撈取過去歷史)
    async loadStats() {
        // 這裡暫時用模擬數據，實作需迴圈撈取前三個月的 PreSchedule 與 Schedule 比對
        // PreSchedule[uid].wishes vs Schedule.assignments[uid]
        document.getElementById('stat-req').textContent = '24';
        document.getElementById('stat-ok').textContent = '20';
        document.getElementById('stat-rate').textContent = '83%';
    }
}
