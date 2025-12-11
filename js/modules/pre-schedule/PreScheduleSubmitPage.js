import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1; 
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth -= 12; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        
        this.currentUser = null;    // 當前模擬的操作對象
        this.realUser = null;       // 實際登入的使用者 (Admin)
        this.currentUnit = null; 
        this.unitStaffMap = {}; 
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        
        this.myWishes = {};
        this.myPreferences = {}; 
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.isReadOnly = false;
        this.isAdminMode = false;
        
        // 定義班別類型
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D':   { label: '白',   color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E':   { label: '小',   color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N':   { label: '大',   color: '#212529', bg: '#212529', text: 'white' },
            'XD':  { label: '勿白', color: '#adb5bd', bg: '#f8f9fa', text: '#0d6efd', border: '1px solid #0d6efd' },
            'XE':  { label: '勿小', color: '#adb5bd', bg: '#f8f9fa', text: '#ffc107', border: '1px solid #ffc107' },
            'XN':  { label: '勿大', color: '#adb5bd', bg: '#f8f9fa', text: '#212529', border: '1px solid #212529' }
        };
    }

    async render() {
        // CSS 樣式：日曆與卡片
        const styles = `
            <style>
                .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; padding: 5px; }
                .calendar-header { text-align: center; font-weight: bold; color: #4e73df; padding: 10px 0; }
                .calendar-cell { 
                    background-color: #fff; border: 1px solid #e3e6f0; border-radius: 6px; min-height: 90px; padding: 6px; 
                    cursor: pointer; position: relative; display: flex; flex-direction: column; transition: all 0.2s; 
                }
                .calendar-cell:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-color: #4e73df; z-index: 5; }
                .calendar-cell.weekend { background-color: #fff0f5; }
                .calendar-cell.selected { background-color: #fff3cd !important; border: 2px solid #ffc107 !important; }
                .calendar-cell.disabled { background-color: #f1f3f5; opacity: 0.7; cursor: default; }
                
                .day-number { font-weight: 800; font-size: 1.1rem; color: #5a5c69; }
                .day-number.weekend-text { color: #e74a3b; }
                
                .shift-badge { 
                    font-size: 1.1rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; 
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1); display:inline-block; margin-top:5px;
                }
                .bottom-stats { position: absolute; bottom: 4px; right: 6px; font-size: 0.75rem; color: #858796; }
                .bottom-stats.full { color: #e74a3b; font-weight: bold; }
            </style>
        `;

        const html = `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求。</p>
                </div>

                <div id="admin-impersonate-section" class="card shadow-sm mb-3 border-left-danger bg-light" style="display:none;">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <strong class="text-danger"><i class="fas fa-user-secret"></i> 管理員模式：</strong>
                        <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">選擇單位</option></select>
                        <select id="admin-user-select" class="form-select form-select-sm w-auto"><option value="">選擇人員</option></select>
                        <button id="btn-impersonate" class="btn btn-sm btn-danger">切換身份</button>
                    </div>
                </div>

                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center flex-wrap gap-2">
                        <div class="input-group w-auto">
                            <button class="btn btn-outline-secondary" id="btn-prev-year"><i class="fas fa-chevron-left"></i></button>
                            <span class="input-group-text bg-white fw-bold" id="display-year" style="min-width:80px; justify-content:center;">${this.year}</span>
                            <button class="btn btn-outline-secondary" id="btn-next-year"><i class="fas fa-chevron-right"></i></button>
                        </div>
                        <span class="fw-bold me-2">年</span>
                        
                        <select id="month-select" class="form-select w-auto">
                            ${Array.from({length:12}, (_,i)=>i+1).map(m=>`<option value="${m}" ${m===this.month?'selected':''}>${m}月</option>`).join('')}
                        </select>
                        
                        <button id="btn-load" class="btn btn-primary"><i class="fas fa-search"></i> 讀取</button>
                        
                        <div id="schedule-status-badge" class="ms-3"></div>
                    </div>
                </div>

                <div id="list-view" style="display:none;">
                    <div class="card shadow">
                        <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-primary">可預班月份清單</h6></div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle mb-0 text-center">
                                    <thead class="table-light"><tr><th>月份</th><th>單位</th><th>開放日期</th><th>狀態</th><th>操作</th></tr></thead>
                                    <tbody id="schedule-list-tbody"><tr><td colspan="5" class="py-5 text-muted">請點選讀取</td></tr></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="detail-view" style="display:none;">
                    <div class="d-flex align-items-center mb-3">
                        <button class="btn btn-outline-secondary btn-sm me-3" id="btn-back"><i class="fas fa-arrow-left"></i> 返回清單</button>
                        <h4 class="m-0 fw-bold text-gray-800" id="calendar-header-title"></h4>
                    </div>

                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-body p-3 bg-light">
                                    <div class="d-flex justify-content-end mb-2 small text-muted">
                                        <span class="me-3"><i class="fas fa-mouse-pointer"></i> 左鍵: OFF/取消</span>
                                        <span><i class="fas fa-mouse-pointer"></i> 右鍵: 選單</span>
                                    </div>
                                    <div id="calendar-container" class="calendar-grid"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4 border-left-info sticky-top" style="top: 80px; z-index: 10;">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-info">排班偏好</h6></div>
                                <div class="card-body">
                                    
                                    <div class="mb-3 d-flex justify-content-between">
                                        <span>總數 <span class="badge bg-primary" id="count-total">0</span> / <span id="limit-total"></span></span>
                                        <span>假日 <span class="badge bg-info" id="count-holiday">0</span> / <span id="limit-holiday"></span></span>
                                    </div>
                                    <hr>

                                    <div id="batch-pref-section" class="mb-3" style="display:none;">
                                        <label class="fw-bold d-block mb-1 small">包班意願 (連續夜班)</label>
                                        <div class="btn-group w-100 btn-group-sm" role="group">
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-none" value="" checked>
                                            <label class="btn btn-outline-secondary" for="batch-none">無</label>
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-e" value="E">
                                            <label class="btn btn-outline-warning text-dark" for="batch-e">小夜</label>
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-n" value="N">
                                            <label class="btn btn-outline-dark" for="batch-n">大夜</label>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="fw-bold d-block mb-1 small">排班偏好 (請選擇)</label>
                                        <div class="input-group input-group-sm mb-2">
                                            <span class="input-group-text">優先 1</span>
                                            <select class="form-select" id="pref-1">
                                                <option value="">(無)</option><option value="D">白班</option><option value="E">小夜</option><option value="N">大夜</option>
                                            </select>
                                        </div>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text">優先 2</span>
                                            <select class="form-select" id="pref-2">
                                                <option value="">(無)</option><option value="D">白班</option><option value="E">小夜</option><option value="N">大夜</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="fw-bold small">備註</label>
                                        <textarea class="form-control form-control-sm" id="wish-notes" rows="2"></textarea>
                                    </div>

                                    <button id="btn-submit" class="btn btn-success w-100"><i class="fas fa-paper-plane"></i> 提交預班</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 右鍵選單
        const contextMenu = `
            <div id="user-shift-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                ${Object.entries(this.shiftTypes).map(([key, cfg]) => 
                    `<button class="list-group-item list-group-item-action py-1 text-center small fw-bold" 
                        style="color:${cfg.bg==='#f8f9fa'?cfg.text:'white'}; background:${cfg.bg==='#f8f9fa'?'white':cfg.bg};"
                        onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                ).join('')}
                <button class="list-group-item list-group-item-action py-1 text-center text-secondary small" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
            </div>
        `;

        return styles + html + contextMenu;
    }

    async afterRender() {
        // 等待 Auth 初始化
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        
        this.realUser = authService.getProfile();
        if (!this.realUser) { alert("無法讀取使用者資訊"); return; }

        window.routerPage = this;

        // 綁定事件
        document.getElementById('btn-prev-year').addEventListener('click', () => { this.year--; this.updateYearDisplay(); });
        document.getElementById('btn-next-year').addEventListener('click', () => { this.year++; this.updateYearDisplay(); });
        document.getElementById('btn-load').addEventListener('click', () => this.tryLoadSchedule());
        document.getElementById('btn-back').addEventListener('click', () => this.showListView());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());
        
        document.addEventListener('click', (e) => {
            if(!e.target.closest('#user-shift-menu')) document.getElementById('user-shift-menu').style.display = 'none';
        });

        // 判斷權限與初始化
        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI();
            document.getElementById('list-view').innerHTML = '<div class="alert alert-warning m-3">請先選擇上方「管理員模式」的單位與人員，進行模擬。</div>';
            document.getElementById('list-view').style.display = 'block';
        } else {
            // 一般使用者：直接載入自己
            await this.loadTargetUser(this.realUser.uid);
        }
    }

    updateYearDisplay() {
        document.getElementById('display-year').textContent = this.year;
    }

    // 管理員模擬 UI
    async setupAdminUI() {
        const section = document.getElementById('admin-impersonate-section');
        section.style.display = 'block';
        
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        const units = await UnitService.getAllUnits();
        unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', () => {
            const uid = userSelect.value;
            if(!uid) return alert("請選擇人員");
            this.loadTargetUser(uid);
        });
    }

    // 載入目標使用者 (自己或模擬對象)
    async loadTargetUser(uid) {
        try {
            // ✅ Fix: 確保讀取到完整的 User Data (包含 constraints)
            const userFull = await userService.getUserData(uid);
            if(!userFull) throw new Error("找不到使用者資料");
            
            this.currentUser = userFull; 
            this.currentUnit = await UnitService.getUnitById(this.currentUser.unitId);
            
            // UI 更新
            document.getElementById('detail-view').style.display = 'none';
            document.getElementById('list-view').style.display = 'block';

            // 包班選項顯示控制
            if (this.currentUser.constraints?.canBatch) {
                document.getElementById('batch-pref-section').style.display = 'block';
            } else {
                document.getElementById('batch-pref-section').style.display = 'none';
            }

            // 預載單位人員名單
            const staff = await userService.getUnitStaff(this.currentUser.unitId);
            staff.forEach(s => this.unitStaffMap[s.uid] = s.name);

            // 自動觸發讀取
            this.tryLoadSchedule();

        } catch(e) { 
            console.error(e); 
            alert("載入使用者失敗: " + e.message);
        }
    }

    async tryLoadSchedule() {
        if(!this.currentUser || !this.currentUser.unitId) return;

        const allSchedules = await PreScheduleService.getPreSchedulesList(this.currentUser.unitId);
        this.preSchedulesList = allSchedules;
        const tbody = document.getElementById('schedule-list-tbody');

        if (allSchedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted">此單位目前無預班表</td></tr>';
            return;
        }

        const now = new Date().toISOString().split('T')[0];

        tbody.innerHTML = allSchedules.map(p => {
            // 權限過濾：只顯示 staffIds 包含自己的預班表 (或管理員)
            if (!p.staffIds.includes(this.currentUser.uid) && !this.isAdminMode) return '';

            const openDate = p.settings?.openDate || '';
            const closeDate = p.settings?.closeDate || '';
            let statusHtml = '';
            let isExpired = false;

            if (p.status === 'closed') {
                statusHtml = '<span class="badge bg-secondary">已關閉</span>'; isExpired = true;
            } else if (now < openDate) {
                statusHtml = '<span class="badge bg-warning text-dark">未開放</span>'; isExpired = true;
            } else if (now > closeDate) {
                statusHtml = '<span class="badge bg-danger">已截止</span>'; isExpired = true;
            } else {
                statusHtml = '<span class="badge bg-success">進行中</span>';
            }

            const btnText = isExpired ? '檢視' : '預班';
            const btnClass = isExpired ? 'btn-outline-secondary' : 'btn-primary';

            return `
                <tr>
                    <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                    <td>${this.currentUnit.unitName}</td>
                    <td><small>${openDate} ~ ${closeDate}</small></td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="btn btn-sm ${btnClass}" onclick="window.routerPage.openSchedule('${p.id}', ${isExpired})">
                            ${btnText}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    showListView() {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    openSchedule(id, isReadOnly) {
        this.currentSchedule = this.preSchedulesList.find(s => s.id === id);
        if (!this.currentSchedule) return;
        this.isReadOnly = isReadOnly || (this.isAdminMode ? false : false); // 管理員可強制編輯 (若需要)

        document.getElementById('list-view').style.display = 'none';
        document.getElementById('detail-view').style.display = 'block';
        document.getElementById('calendar-header-title').textContent = `${this.currentUnit.unitName} ${this.currentSchedule.year}年${this.currentSchedule.month}月 預班月曆`;

        // 讀取資料
        const mySub = (this.currentSchedule.submissions && this.currentSchedule.submissions[this.currentUser.uid]) || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';

        // 限制顯示
        const settings = this.currentSchedule.settings;
        document.getElementById('limit-total').textContent = settings.maxOffDays;
        document.getElementById('limit-holiday').textContent = settings.maxHoliday || 0;

        // 回填偏好
        const myPref = mySub.preferences || {};
        if (this.currentUser.constraints?.canBatch) {
            if (myPref.batch) {
                const radio = document.querySelector(`input[name="batchPref"][value="${myPref.batch}"]`);
                if(radio) radio.checked = true;
            } else {
                document.getElementById('batch-none').checked = true;
            }
        }
        document.getElementById('pref-1').value = myPref.priority1 || '';
        document.getElementById('pref-2').value = myPref.priority2 || '';

        // UI 狀態
        const disabled = this.isReadOnly && !this.isAdminMode;
        document.getElementById('btn-submit').disabled = disabled;
        document.getElementById('btn-submit').textContent = disabled ? "唯讀模式" : "提交預班";
        document.querySelectorAll('input, textarea, select').forEach(i => i.disabled = disabled);

        this.calculateAggregate();
        this.renderCalendar();
        this.updateCounters();
    }

    calculateAggregate() {
        this.unitAggregate = {};
        this.unitNames = {};
        const subs = this.currentSchedule.submissions || {};
        Object.entries(subs).forEach(([uid, sub]) => {
            if (sub.wishes) {
                Object.entries(sub.wishes).forEach(([day, type]) => {
                    this.unitAggregate[day] = (this.unitAggregate[day] || 0) + 1;
                    if (this.currentSchedule.settings.showOtherNames) {
                        if (!this.unitNames[day]) this.unitNames[day] = [];
                        const name = this.unitStaffMap[uid] || '未知';
                        this.unitNames[day].push(`${name}(${type})`);
                    }
                });
            }
        });
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-container');
        grid.innerHTML = '';
        ['日','一','二','三','四','五','六'].forEach(w => grid.innerHTML += `<div class="calendar-header">${w}</div>`);

        const { year, month } = this.currentSchedule;
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDay = new Date(year, month - 1, 1).getDay();
        
        // 取得每日限額
        const totalStaff = this.currentSchedule.staffIds.length;
        const reserved = this.currentSchedule.settings.reservedStaff || 0;
        const reqMatrix = this.currentUnit.staffRequirements || {D:{}, E:{}, N:{}};

        for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="calendar-cell disabled" style="background:transparent; border:none;"></div>`;

        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const w = date.getDay();
            const isWeekend = (w === 0 || w === 6);
            
            const reqTotal = (reqMatrix.D?.[w]||0) + (reqMatrix.E?.[w]||0) + (reqMatrix.N?.[w]||0);
            let dailyLimit = totalStaff - reqTotal - reserved;
            if(dailyLimit < 0) dailyLimit = 0;

            const count = this.unitAggregate[d] || 0;
            const isFull = count >= dailyLimit;
            const myType = this.myWishes[d];
            const cfg = myType ? this.shiftTypes[myType] : null;

            const cell = document.createElement('div');
            let classes = 'calendar-cell';
            if(isWeekend) classes += ' weekend';
            if(myType) classes += ' selected';
            if(isFull) classes += ' over-limit'; // 紅框
            if(this.isReadOnly && !this.isAdminMode) classes += ' disabled';

            cell.className = classes;
            
            let tagHtml = '';
            if(cfg) {
                const style = cfg.border ? 
                    `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border};` :
                    `background:${cfg.bg}; color:${cfg.text};`;
                tagHtml = `<span class="shift-badge" style="${style}">${cfg.label}</span>`;
            }

            if (this.currentSchedule.settings.showOtherNames && this.unitNames[d]) {
                cell.title = `已預班：${this.unitNames[d].join('、')}`;
            }

            const bottomInfo = `
                <div class="bottom-stats ${isFull ? 'full' : ''}">
                    <i class="fas fa-user"></i> ${count}/${dailyLimit}
                </div>`;

            cell.innerHTML = `<div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div> ${tagHtml} ${bottomInfo}`;

            if(!this.isReadOnly || this.isAdminMode) {
                cell.onclick = () => this.toggleDay(d);
                cell.oncontextmenu = (e) => this.handleRightClick(e, d);
            }
            grid.appendChild(cell);
        }
    }

    toggleDay(day) {
        if (this.myWishes[day]) delete this.myWishes[day];
        else {
            if (!this.checkLimits(day)) return;
            this.myWishes[day] = 'OFF';
        }
        this.renderCalendar();
        this.updateCounters();
    }

    handleRightClick(e, day) {
        e.preventDefault();
        this.tempTarget = day;
        const menu = document.getElementById('user-shift-menu');
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        if(!this.tempTarget) return;
        const day = this.tempTarget;
        if(type) {
            if (!this.myWishes[day] && !this.checkLimits(day)) return;
            this.myWishes[day] = type;
        } else {
            delete this.myWishes[day];
        }
        this.renderCalendar();
        this.updateCounters();
        document.getElementById('user-shift-menu').style.display = 'none';
    }

    checkLimits(day) {
        // 管理員模擬時可跳過限制，或保持限制以測試
        // 這裡設定為：如果是 Admin Mode，不檢查限制
        if (this.isAdminMode) return true;

        const settings = this.currentSchedule.settings;
        const maxOff = parseInt(settings.maxOffDays);
        const maxHoliday = parseInt(settings.maxHoliday || 0);
        
        const currentTotal = Object.keys(this.myWishes).length;
        if (currentTotal >= maxOff) { alert("已達預班總數上限"); return false; }

        const date = new Date(this.currentSchedule.year, this.currentSchedule.month-1, day);
        const w = date.getDay();
        if(w===0 || w===6) {
            let hCount = 0;
            Object.keys(this.myWishes).forEach(d => {
                const dt = new Date(this.currentSchedule.year, this.currentSchedule.month-1, d);
                if(dt.getDay()===0 || dt.getDay()===6) hCount++;
            });
            if(hCount >= maxHoliday) { alert("已達假日預班上限"); return false; }
        }
        return true;
    }

    updateCounters() {
        const total = Object.keys(this.myWishes).length;
        let holiday = 0;
        Object.keys(this.myWishes).forEach(d => {
            const date = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d);
            if(date.getDay() === 0 || date.getDay() === 6) holiday++;
        });

        document.getElementById('count-total').textContent = total;
        document.getElementById('count-holiday').textContent = holiday;
    }

    async handleSubmit() {
        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        
        // 收集偏好
        const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
        const pref1 = document.getElementById('pref-1').value;
        const pref2 = document.getElementById('pref-2').value;

        const preferences = { batch: batchPref, priority1: pref1, priority2: pref2 };

        try {
            await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId,
                this.currentSchedule.year,
                this.currentSchedule.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value,
                preferences
            );
            alert('✅ 提交成功！');
            this.showListView();
            this.tryLoadSchedule(); // 重新整理清單狀態
        } catch (e) {
            alert("提交失敗: " + e.message);
        } finally {
            btn.disabled = false;
        }
    }
}
