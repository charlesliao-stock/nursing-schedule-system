import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; // 預設下個月
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        
        this.currentUser = null;
        this.preSchedule = null;
        this.myWishes = {}; // 本地暫存操作 { day: 'OFF' }
        this.unitShifts = []; // 單位可用班別
    }

    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-edit"></i> 提交預班需求</h2>
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
                                <div class="card-header py-3 d-flex justify-content-between">
                                    <h6 class="m-0 font-weight-bold text-primary">班表日曆</h6>
                                    <span class="small text-muted">點擊日期可切換預班 (OFF/班別)</span>
                                </div>
                                <div class="card-body">
                                    <div id="calendar-grid" class="calendar-grid">
                                        </div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-primary">統計與提交</h6>
                                </div>
                                <div class="card-body">
                                    <ul class="list-group list-group-flush mb-3">
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>可休上限 (含假日)</span>
                                            <strong id="limit-max">8</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between bg-light">
                                            <span>目前已選</span>
                                            <strong id="current-count" class="text-primary">0</strong>
                                        </li>
                                    </ul>
                                    
                                    <div class="mb-3">
                                        <label class="form-label">備註事項</label>
                                        <textarea id="wish-notes" class="form-control" rows="3" placeholder="例如：月底連假請務必安排..."></textarea>
                                    </div>

                                    <div class="d-grid">
                                        <button id="btn-submit" class="btn btn-success btn-lg">
                                            <i class="fas fa-paper-plane"></i> 提交預班
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card shadow border-left-info">
                                <div class="card-body">
                                    <h6 class="fw-bold text-info">說明</h6>
                                    <p class="small mb-0 text-muted">
                                        1. 灰色格子為非本月日期。<br>
                                        2. <span class="badge bg-danger">紅字</span> 為週末/假日。<br>
                                        3. 截止後將無法修改，請聯繫管理員。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <style>
                    .calendar-grid {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 10px;
                    }
                    .calendar-day-header {
                        text-align: center;
                        font-weight: bold;
                        padding: 10px 0;
                        color: #666;
                    }
                    .calendar-cell {
                        border: 1px solid #e3e6f0;
                        border-radius: 8px;
                        min-height: 100px;
                        padding: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                        position: relative;
                        background: #fff;
                    }
                    .calendar-cell:hover {
                        border-color: #3b82f6;
                        background-color: #f8faff;
                    }
                    .calendar-cell.is-weekend {
                        background-color: #fff5f5;
                    }
                    .calendar-cell.is-other-month {
                        background-color: #f8f9fc;
                        color: #ccc;
                        pointer-events: none;
                    }
                    .calendar-cell.selected-off {
                        background-color: #fee2e2; /* Red-100 */
                        border: 2px solid #ef4444;
                    }
                    .calendar-cell.selected-shift {
                        background-color: #dbeafe; /* Blue-100 */
                        border: 2px solid #3b82f6;
                    }
                    .day-number {
                        font-weight: bold;
                        font-size: 1.1em;
                    }
                    .wish-badge {
                        display: block;
                        text-align: center;
                        margin-top: 15px;
                        font-weight: bold;
                        font-size: 1.2em;
                    }
                </style>
            </div>
        `;
    }

    async afterRender() {
        // 1. 初始化使用者資料
        const authUser = authService.getCurrentUser();
        if (authUser) {
            this.currentUser = await userService.getUserData(authUser.uid);
        }

        if (!this.currentUser || !this.currentUser.unitId) {
            alert("錯誤：無法識別您的所屬單位，請聯繫管理員。");
            return;
        }

        // 2. 載入單位班別 (如果允許選班)
        const unitData = await UnitService.getUnitById(this.currentUser.unitId);
        this.unitShifts = unitData?.settings?.shifts || [];

        // 3. 綁定按鈕
        const btnLoad = document.getElementById('btn-load');
        btnLoad.addEventListener('click', () => this.loadData());

        const btnSubmit = document.getElementById('btn-submit');
        btnSubmit.addEventListener('click', () => this.handleSubmit());

        // 自動載入預設月份
        this.loadData();
    }

    async loadData() {
        const monthInput = document.getElementById('submit-month').value;
        if (!monthInput) return;
        
        const [y, m] = monthInput.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        const statusAlert = document.getElementById('status-alert');
        statusAlert.className = 'alert alert-info d-inline-block mb-0 py-2';
        statusAlert.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 載入中...';

        document.getElementById('submit-area').style.display = 'none';

        try {
            this.preSchedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
            
            if (!this.preSchedule) {
                statusAlert.className = 'alert alert-secondary d-inline-block mb-0 py-2';
                statusAlert.textContent = `${this.year}年${this.month}月 尚未建立預班表`;
                return;
            }

            const { status, settings, submissions } = this.preSchedule;
            
            // 讀取個人歷史資料
            const mySub = submissions[this.currentUser.uid] || {};
            this.myWishes = mySub.wishes || {}; // 深拷貝
            document.getElementById('wish-notes').value = mySub.notes || '';

            // 判斷狀態
            if (status === 'open') {
                statusAlert.className = 'alert alert-success d-inline-block mb-0 py-2';
                statusAlert.innerHTML = `<i class="fas fa-check-circle"></i> 開放填寫中 (截止日: ${settings.closeDate})`;
                document.getElementById('btn-submit').disabled = false;
                this.isReadOnly = false;
            } else if (status === 'closed') {
                statusAlert.className = 'alert alert-danger d-inline-block mb-0 py-2';
                statusAlert.innerHTML = `<i class="fas fa-lock"></i> 已截止收件`;
                document.getElementById('btn-submit').disabled = true;
                this.isReadOnly = true; // 唯讀模式
            } else {
                statusAlert.className = 'alert alert-warning d-inline-block mb-0 py-2';
                statusAlert.innerHTML = `草稿階段 (尚未開放)`;
                document.getElementById('btn-submit').disabled = true;
                this.isReadOnly = true;
            }

            // 顯示介面
            document.getElementById('submit-area').style.display = 'block';
            document.getElementById('limit-max').textContent = settings.maxOffDays;
            
            this.renderCalendar();
            this.updateCounter();

        } catch (error) {
            console.error(error);
            statusAlert.className = 'alert alert-danger d-inline-block mb-0 py-2';
            statusAlert.textContent = '載入失敗';
        }
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';

        // Header
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        days.forEach(d => {
            grid.innerHTML += `<div class="calendar-day-header">${d}</div>`;
        });

        // 計算日期
        const firstDay = new Date(this.year, this.month - 1, 1).getDay();
        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        
        // 填充空白前綴
        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="calendar-cell is-other-month"></div>`;
        }

        // 填充日期
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(this.year, this.month - 1, d);
            const dayOfWeek = dateObj.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            // 判斷是否已選
            const wish = this.myWishes[d];
            let cellClass = 'calendar-cell';
            if (isWeekend) cellClass += ' is-weekend';
            if (wish === 'OFF') cellClass += ' selected-off';
            else if (wish) cellClass += ' selected-shift';

            const cell = document.createElement('div');
            cell.className = cellClass;
            
            // 唯讀模式下不綁定點擊
            if (!this.isReadOnly) {
                cell.onclick = () => this.toggleDate(d, cell);
            } else {
                cell.style.cursor = 'default';
            }

            let badgeHtml = '';
            if (wish) {
                badgeHtml = `<span class="wish-badge" style="color:${wish==='OFF'?'#ef4444':'#3b82f6'}">${wish}</span>`;
            }

            cell.innerHTML = `
                <div class="day-number" style="color:${isWeekend?'#e74a3b':'#5a5c69'}">${d}</div>
                ${badgeHtml}
            `;
            
            grid.appendChild(cell);
        }
    }

    toggleDate(day, cellEl) {
        const settings = this.preSchedule.settings;
        const currentWish = this.myWishes[day];

        // 簡單邏輯： 無 -> OFF -> (班別) -> 無
        // 如果 settings.canChooseShift 為 true，則輪詢可用班別
        
        if (!currentWish) {
            // 1. 空白 -> OFF
            // 檢查上限
            const currentCount = Object.values(this.myWishes).filter(w => w === 'OFF').length;
            if (currentCount >= settings.maxOffDays) {
                alert(`已達休假上限 (${settings.maxOffDays}天)`);
                return;
            }
            this.myWishes[day] = 'OFF';
        } else if (currentWish === 'OFF') {
            // 2. OFF -> 第一個班別 (若允許) 或 清除
            if (settings.canChooseShift && this.unitShifts.length > 0) {
                this.myWishes[day] = this.unitShifts[0].code;
            } else {
                delete this.myWishes[day];
            }
        } else if (settings.canChooseShift) {
            // 3. 班別輪詢
            const idx = this.unitShifts.findIndex(s => s.code === currentWish);
            if (idx !== -1 && idx < this.unitShifts.length - 1) {
                this.myWishes[day] = this.unitShifts[idx+1].code;
            } else {
                // 最後一個班別 -> 清除
                delete this.myWishes[day];
            }
        } else {
            // 應該不會跑來這，但防呆
            delete this.myWishes[day];
        }

        this.renderCalendar(); // 重繪 (比較簡單，不需要手動操作 DOM class)
        this.updateCounter();
    }

    updateCounter() {
        const count = Object.values(this.myWishes).filter(w => w === 'OFF').length;
        const el = document.getElementById('current-count');
        el.textContent = count;
        
        const limit = this.preSchedule.settings.maxOffDays;
        if (count > limit) el.className = 'text-danger fw-bold';
        else el.className = 'text-primary fw-bold';
    }

    async handleSubmit() {
        if (!confirm("確定要提交您的預班需求嗎？")) return;

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

        const notes = document.getElementById('wish-notes').value;

        const result = await PreScheduleService.submitPersonalWish(
            this.currentUser.unitId,
            this.year,
            this.month,
            this.currentUser.uid,
            this.myWishes,
            notes
        );

        if (result.success) {
            alert("提交成功！");
            this.loadData(); // 重新載入狀態
        } else {
            alert("提交失敗: " + result.error);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交預班';
        }
    }
}
