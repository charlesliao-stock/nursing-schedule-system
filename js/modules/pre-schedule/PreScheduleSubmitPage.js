import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        this.currentUser = null;
        this.currentUnit = null; // 當前選擇的單位 (Admin 可切換)
        this.preSchedulesList = []; // 預班表清單
        this.currentSchedule = null; // 當前正在編輯/檢視的預班表
        this.myWishes = {};
        this.isReadOnly = false; // 是否唯讀 (過期或未開放)
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求。</p>
                </div>

                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <div id="admin-unit-selector" style="display:none;" class="d-flex align-items-center">
                            <label class="fw-bold mb-0 text-nowrap me-2 text-danger">管理員模式：</label>
                            <select id="unit-select" class="form-select form-select-sm w-auto fw-bold"></select>
                        </div>
                        <div id="user-unit-info" class="fw-bold text-primary">
                            <span class="spinner-border spinner-border-sm"></span> 載入中...
                        </div>
                    </div>
                </div>

                <div id="list-view" class="card shadow">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 font-weight-bold text-primary">預班表清單</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>預班月份</th>
                                        <th>單位</th>
                                        <th>開放期間</th>
                                        <th>狀態</th>
                                        <th class="text-end pe-4">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="schedule-list-tbody">
                                    <tr><td colspan="5" class="text-center py-5 text-muted">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div id="detail-view" style="display:none;">
                    <div class="d-flex align-items-center mb-3">
                        <button class="btn btn-outline-secondary btn-sm me-3" id="btn-back">
                            <i class="fas fa-arrow-left"></i> 返回清單
                        </button>
                        <h4 class="m-0 fw-bold text-gray-800" id="detail-title">202X-XX 預班</h4>
                    </div>

                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 d-flex justify-content-between align-items-center bg-white">
                                    <h6 class="m-0 fw-bold text-primary">班表日曆</h6>
                                    <div class="small">
                                        <span class="badge bg-white text-dark border me-2">白色: 可選</span>
                                        <span class="badge bg-danger text-white">紅色: 已選 OFF</span>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <div id="calendar-grid" class="calendar-grid"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4 sticky-top" style="top: 80px; z-index: 10;">
                                <div class="card-header py-3 bg-primary text-white">
                                    <h6 class="m-0 fw-bold"><i class="fas fa-check-circle"></i> 提交確認</h6>
                                </div>
                                <div class="card-body">
                                    <ul class="list-group list-group-flush mb-3">
                                        <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                                            <span>
                                                預班總數 
                                                <small class="text-muted">(上限 <span id="limit-total">0</span>)</small>
                                            </span>
                                            <span class="badge bg-primary rounded-pill fs-6" id="count-total">0</span>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                                            <span>
                                                假日預休 
                                                <small class="text-muted">(上限 <span id="limit-holiday">0</span>)</small>
                                            </span>
                                            <span class="badge bg-info rounded-pill fs-6" id="count-holiday">0</span>
                                        </li>
                                    </ul>
                                    
                                    <div class="mb-3">
                                        <label class="form-label small fw-bold text-secondary">備註說明</label>
                                        <textarea id="wish-notes" class="form-control" rows="3" placeholder="例如：連假需求..."></textarea>
                                    </div>
                                    
                                    <div class="d-grid gap-2">
                                        <button id="btn-submit" class="btn btn-success btn-lg shadow-sm">
                                            <i class="fas fa-paper-plane"></i> 提交預班
                                        </button>
                                        <div id="readonly-msg" class="alert alert-secondary text-center small mb-0" style="display:none;">
                                            <i class="fas fa-lock"></i> 目前無法提交 (已截止或唯讀)
                                        </div>
                                    </div>
                                    <div class="mt-3 text-center">
                                        <small id="last-submit-time" class="text-muted d-block"></small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                    .calendar-header { text-align: center; font-weight: bold; color: #4e73df; padding-bottom: 5px; }
                    .calendar-cell { 
                        border: 1px solid #e3e6f0; border-radius: 8px; min-height: 80px; padding: 5px; 
                        cursor: pointer; background: #fff; position: relative; transition: all 0.2s;
                        display: flex; flex-direction: column; justify-content: space-between;
                    }
                    .calendar-cell:hover { background-color: #f8f9fc; border-color: #4e73df; transform: translateY(-2px); }
                    .calendar-cell.weekend { background-color: #fffaf0; }
                    .calendar-cell.selected-off { background-color: #ffeaea; border: 2px solid #e74a3b; }
                    .calendar-cell.disabled { opacity: 0.6; cursor: not-allowed; background-color: #eaecf4; }
                    .day-number { font-weight: 800; font-size: 1.1rem; color: #5a5c69; }
                    .day-number.weekend-text { color: #e74a3b; }
                    .wish-badge { 
                        display: block; text-align: center; font-weight: bold; font-size: 1rem; color: #e74a3b; 
                        background: rgba(231, 74, 59, 0.1); border-radius: 4px; padding: 2px 0;
                    }
                </style>
            </div>
        `;
    }

    async afterRender() {
        const authUser = authService.getCurrentUser();
        if (!authUser) { alert("請先登入"); return; }

        try {
            this.currentUser = await userService.getUserData(authUser.uid);
            const isAdmin = this.currentUser.role === 'system_admin' || this.currentUser.originalRole === 'system_admin';

            // 1. 初始化單位選單 (Admin) 或 鎖定單位 (User)
            if (isAdmin) {
                document.getElementById('admin-unit-selector').style.display = 'flex';
                document.getElementById('user-unit-info').style.display = 'none';
                
                const units = await UnitService.getAllUnits();
                const select = document.getElementById('unit-select');
                select.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
                
                select.addEventListener('change', (e) => this.loadList(e.target.value));
                
                // 預設載入第一個
                if(units.length > 0) this.loadList(units[0].unitId);

            } else {
                if (!this.currentUser.unitId) {
                    document.getElementById('user-unit-info').innerHTML = '<span class="text-danger">未綁定單位</span>';
                    return;
                }
                const unit = await UnitService.getUnitById(this.currentUser.unitId);
                this.currentUnit = unit;
                document.getElementById('user-unit-info').innerHTML = `<i class="fas fa-hospital-user"></i> ${unit.unitName}`;
                
                // 載入該單位列表
                this.loadList(this.currentUser.unitId);
            }

            // 2. 綁定按鈕
            document.getElementById('btn-back').addEventListener('click', () => this.showListView());
            document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

        } catch (error) {
            console.error(error);
            alert("初始化失敗");
        }
    }

    // --- 列表視圖邏輯 ---

    async loadList(unitId) {
        const tbody = document.getElementById('schedule-list-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';
        
        // 切換單位時先取得單位資訊 (為了顯示 Unit Name)
        if (!this.currentUnit || this.currentUnit.unitId !== unitId) {
            this.currentUnit = await UnitService.getUnitById(unitId);
        }

        try {
            this.preSchedulesList = await PreScheduleService.getPreSchedulesList(unitId);
            
            if (this.preSchedulesList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">此單位目前沒有預班表</td></tr>';
                return;
            }

            const now = new Date().toISOString().split('T')[0];

            tbody.innerHTML = this.preSchedulesList.map(p => {
                const openDate = p.settings?.openDate || 'N/A';
                const closeDate = p.settings?.closeDate || 'N/A';
                
                // 判斷狀態
                let statusBadge = '';
                let actionBtn = '';
                let isExpired = false;

                if (p.status === 'closed') {
                    statusBadge = '<span class="badge bg-secondary">已關閉</span>';
                    isExpired = true;
                } else if (now < openDate) {
                    statusBadge = '<span class="badge bg-warning text-dark">未開放</span>';
                    isExpired = true; // 未開放也視為唯讀
                } else if (now > closeDate) {
                    statusBadge = '<span class="badge bg-secondary">已截止</span>';
                    isExpired = true;
                } else {
                    statusBadge = '<span class="badge bg-success">開放中</span>';
                    isExpired = false;
                }

                // 按鈕文字與樣式
                const btnText = isExpired ? '<i class="fas fa-eye"></i> 檢視' : '<i class="fas fa-edit"></i> 提交';
                const btnClass = isExpired ? 'btn-outline-secondary' : 'btn-primary';

                return `
                    <tr>
                        <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td>${this.currentUnit?.unitName || unitId}</td>
                        <td><small>${openDate} ~ ${closeDate}</small></td>
                        <td>${statusBadge}</td>
                        <td class="text-end pe-4">
                            <button class="btn btn-sm ${btnClass}" onclick="window.routerPage.openSchedule('${p.id}', ${isExpired})">
                                ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            // 綁定 window 讓 onclick 生效
            window.routerPage = this;

        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>';
        }
    }

    showListView() {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('filter-section').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    // --- 填寫/檢視介面邏輯 ---

    openSchedule(docId, isReadOnly) {
        // 1. 找出對應的資料
        this.currentSchedule = this.preSchedulesList.find(s => s.id === docId);
        if (!this.currentSchedule) return;

        this.isReadOnly = isReadOnly;
        
        // 2. 切換視圖
        document.getElementById('list-view').style.display = 'none';
        document.getElementById('filter-section').style.display = 'none';
        document.getElementById('detail-view').style.display = 'block';
        
        document.getElementById('detail-title').textContent = `${this.currentSchedule.year}年 ${this.currentSchedule.month}月 預班表`;

        // 3. 載入個人資料
        const { settings, submissions } = this.currentSchedule;
        const mySub = submissions && submissions[this.currentUser.uid] ? submissions[this.currentUser.uid] : {};
        this.myWishes = mySub.wishes || {};

        // 4. 設定 UI (限制顯示)
        document.getElementById('limit-total').textContent = settings.maxOffDays;
        document.getElementById('limit-holiday').textContent = settings.maxHoliday || 0; // 新增假日上限顯示
        
        document.getElementById('wish-notes').value = mySub.notes || '';
        document.getElementById('wish-notes').disabled = isReadOnly;

        // 5. 設定按鈕狀態
        const btnSubmit = document.getElementById('btn-submit');
        const msgReadonly = document.getElementById('readonly-msg');
        
        if (isReadOnly) {
            btnSubmit.style.display = 'none';
            msgReadonly.style.display = 'block';
        } else {
            btnSubmit.style.display = 'block';
            msgReadonly.style.display = 'none';
        }

        // 6. 渲染
        this.renderCalendar();
        this.updateCounters();
        
        // 上次提交時間
        if (mySub.submittedAt) {
            const date = mySub.submittedAt.toDate ? mySub.submittedAt.toDate() : new Date(mySub.submittedAt);
            document.getElementById('last-submit-time').textContent = `上次提交: ${date.toLocaleString()}`;
        } else {
            document.getElementById('last-submit-time').textContent = '';
        }
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        
        // 星期標題
        ['日','一','二','三','四','五','六'].forEach(w => grid.innerHTML += `<div class="calendar-header">${w}</div>`);

        const { year, month } = this.currentSchedule;
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDay = new Date(year, month - 1, 1).getDay();

        // 空白格
        for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="calendar-cell" style="background:#f8f9fc; cursor:default; border:none;"></div>`;

        // 日期格
        for(let d=1; d<=daysInMonth; d++) {
            const currentWeekDay = new Date(year, month - 1, d).getDay();
            const isWeekend = (currentWeekDay === 0 || currentWeekDay === 6);
            const wish = this.myWishes[d];
            
            const cell = document.createElement('div');
            let classes = 'calendar-cell';
            if (wish === 'OFF') classes += ' selected-off';
            if (isWeekend) classes += ' weekend';
            if (this.isReadOnly) classes += ' disabled';
            
            cell.className = classes;
            if (!this.isReadOnly) cell.onclick = () => this.toggleDate(d, isWeekend);

            cell.innerHTML = `
                <div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div>
                ${wish ? '<span class="wish-badge">OFF</span>' : ''}
            `;
            grid.appendChild(cell);
        }
    }

    toggleDate(day, isWeekend) {
        if (this.myWishes[day]) {
            delete this.myWishes[day];
        } else {
            // 檢查上限
            const settings = this.currentSchedule.settings;
            const maxOff = parseInt(settings.maxOffDays);
            const maxHoliday = parseInt(settings.maxHoliday || 0);

            // 1. 總數檢查
            const currentTotal = Object.keys(this.myWishes).length;
            if (currentTotal >= maxOff) {
                alert(`已達總預班上限 (${maxOff} 天)`);
                return;
            }

            // 2. 假日檢查 (如果點的是假日)
            if (isWeekend) {
                let holidayCount = 0;
                Object.keys(this.myWishes).forEach(d => {
                    const wd = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d).getDay();
                    if (wd === 0 || wd === 6) holidayCount++;
                });
                
                if (holidayCount >= maxHoliday) {
                    alert(`已達假日預班上限 (${maxHoliday} 天)`);
                    return;
                }
            }

            this.myWishes[day] = 'OFF';
        }
        this.renderCalendar();
        this.updateCounters();
    }

    updateCounters() {
        const days = Object.keys(this.myWishes);
        const total = days.length;
        let holiday = 0;
        
        days.forEach(d => {
            const wd = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d).getDay();
            if (wd === 0 || wd === 6) holiday++;
        });

        document.getElementById('count-total').textContent = total;
        document.getElementById('count-holiday').textContent = holiday;

        // 樣式提示
        const maxOff = parseInt(this.currentSchedule.settings.maxOffDays);
        const maxHoliday = parseInt(this.currentSchedule.settings.maxHoliday || 0);

        document.getElementById('count-total').className = `badge rounded-pill fs-6 ${total > maxOff ? 'bg-danger' : 'bg-primary'}`;
        document.getElementById('count-holiday').className = `badge rounded-pill fs-6 ${holiday > maxHoliday ? 'bg-danger' : 'bg-info'}`;
    }

    async handleSubmit() {
        if (this.isReadOnly) return;
        if (!confirm('確定提交預班需求？')) return;

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = '提交中...';

        try {
            const res = await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId,
                this.currentSchedule.year,
                this.currentSchedule.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value
            );

            if (res.success) {
                alert('✅ 提交成功！');
                this.loadList(this.currentUnit.unitId); // 重整列表資料
                this.showListView(); // 返回列表
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            alert("提交失敗: " + e.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交預班';
        }
    }
}
