import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        const today = new Date();
        // 預設下下個月 (例如現在12月 -> 預排2月)
        let targetMonth = today.getMonth() + 1 + 1; 
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth -= 12; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        this.currentUser = null;
        this.currentUnit = null; 
        this.unitStaffMap = {}; 
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        this.myWishes = {};
        this.myPreferences = {}; 
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.isReadOnly = false;
        
        // 模擬相關
        this.isAdminMode = false;
        this.targetUserId = null; // 管理者正在幫誰填
    }

    async render() {
        // 先顯示基本框架
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求與偏好。</p>
                </div>

                <div id="admin-impersonate-section" class="card shadow-sm mb-3 border-left-danger bg-light" style="display:none;">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <strong class="text-danger"><i class="fas fa-user-secret"></i> 管理員模式：</strong>
                        <select id="admin-unit-select" class="form-select form-select-sm w-auto"></select>
                        <select id="admin-user-select" class="form-select form-select-sm w-auto"><option>請先選單位</option></select>
                        <button id="btn-impersonate" class="btn btn-sm btn-danger">切換身份</button>
                    </div>
                </div>

                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <div class="input-group w-auto">
                                <button class="btn btn-outline-secondary" id="btn-prev-year"><i class="fas fa-chevron-left"></i></button>
                                <span class="input-group-text bg-white fw-bold" id="display-year" style="min-width:80px; justify-content:center;">${this.year}</span>
                                <button class="btn btn-outline-secondary" id="btn-next-year"><i class="fas fa-chevron-right"></i></button>
                            </div>
                            <span class="fw-bold">年</span>
                            
                            <select id="month-select" class="form-select w-auto">
                                ${Array.from({length:12}, (_,i)=>i+1).map(m=>`<option value="${m}" ${m===this.month?'selected':''}>${m}月</option>`).join('')}
                            </select>
                            
                            <button id="btn-load" class="btn btn-primary"><i class="fas fa-search"></i> 讀取預班表</button>
                        </div>
                        <div id="schedule-status-badge"></div>
                    </div>
                </div>

                <div id="main-content" style="display:none;">
                    <div class="alert alert-info py-2 small">
                        <i class="fas fa-info-circle"></i> 
                        開放時間：<strong id="open-date"></strong> ~ <strong id="close-date"></strong> 
                        (上限: <span id="limit-off"></span>天)
                    </div>

                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 d-flex justify-content-between align-items-center bg-white">
                                    <h6 class="m-0 font-weight-bold text-primary">畫休月曆 (<span id="user-name-display"></span>)</h6>
                                    <div>
                                        <span id="count-total" class="badge rounded-pill bg-primary fs-6">0</span>
                                        <span class="text-muted small">/ <span id="limit-display">8</span></span>
                                        <span class="ms-2 small text-danger">(假日: <span id="count-holiday">0</span>)</span>
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div id="calendar-container" class="calendar-grid"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4 border-left-info">
                                <div class="card-header py-3 bg-white">
                                    <h6 class="m-0 font-weight-bold text-info"><i class="fas fa-sliders-h"></i> 排班偏好設定</h6>
                                </div>
                                <div class="card-body">
                                    
                                    <div id="batch-pref-section" class="mb-3" style="display:none;">
                                        <label class="fw-bold d-block mb-2">包班意願 (連續夜班)</label>
                                        <div class="btn-group w-100" role="group">
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-none" value="" checked>
                                            <label class="btn btn-outline-secondary" for="batch-none">無</label>

                                            <input type="radio" class="btn-check" name="batchPref" id="batch-e" value="E">
                                            <label class="btn btn-outline-warning text-dark" for="batch-e">小夜包班</label>

                                            <input type="radio" class="btn-check" name="batchPref" id="batch-n" value="N">
                                            <label class="btn btn-outline-dark" for="batch-n">大夜包班</label>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="fw-bold d-block mb-2">排班偏好 (優先班別, 限選2)</label>
                                        <div class="d-flex gap-2">
                                            <div class="form-check">
                                                <input class="form-check-input pref-check" type="checkbox" value="D" id="pref-d">
                                                <label class="form-check-label" for="pref-d">白班 (D)</label>
                                            </div>
                                            <div class="form-check">
                                                <input class="form-check-input pref-check" type="checkbox" value="E" id="pref-e">
                                                <label class="form-check-label" for="pref-e">小夜 (E)</label>
                                            </div>
                                            <div class="form-check">
                                                <input class="form-check-input pref-check" type="checkbox" value="N" id="pref-n">
                                                <label class="form-check-label" for="pref-n">大夜 (N)</label>
                                            </div>
                                        </div>
                                    </div>

                                    <hr>
                                    <div class="form-group">
                                        <label class="fw-bold">備註說明</label>
                                        <textarea class="form-control" id="wish-notes" rows="3" placeholder="例如：這週想多上一點班..."></textarea>
                                    </div>
                                </div>
                            </div>

                            <button id="btn-submit" class="btn btn-success btn-lg w-100 shadow">
                                <i class="fas fa-paper-plane"></i> 提交預班
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // Fix 1: 等待 Auth 初始化
        let retries = 0;
        while (!authService.getProfile() && retries < 10) {
            await new Promise(r => setTimeout(r, 200));
            retries++;
        }
        
        const currentUserProfile = authService.getProfile();
        
        if (!currentUserProfile) {
            alert("無法讀取使用者資訊，請重新登入");
            return;
        }

        // 檢查是否為系統管理員
        if (currentUserProfile.role === 'system_admin' || currentUserProfile.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI(); // 載入管理員模擬選單
        } else {
            // 一般使用者：直接載入自己
            await this.loadTargetUser(currentUserProfile.uid);
        }

        // 綁定年份按鈕
        document.getElementById('btn-prev-year').addEventListener('click', () => { this.year--; this.updateYearDisplay(); });
        document.getElementById('btn-next-year').addEventListener('click', () => { this.year++; this.updateYearDisplay(); });
        document.getElementById('btn-load').addEventListener('click', () => this.tryLoadSchedule());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

        // 綁定 Checkbox 限制
        document.querySelectorAll('.pref-check').forEach(chk => {
            chk.addEventListener('change', () => {
                if (document.querySelectorAll('.pref-check:checked').length > 2) {
                    chk.checked = false; alert("優先班別最多只能選擇 2 項");
                }
            });
        });

        // 預設嘗試載入
        if(!this.isAdminMode) this.tryLoadSchedule();
    }

    updateYearDisplay() {
        document.getElementById('display-year').textContent = this.year;
    }

    // (Req 3) 管理員模擬 UI 設定
    async setupAdminUI() {
        const section = document.getElementById('admin-impersonate-section');
        section.style.display = 'block';
        
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        const units = await UnitService.getAllUnits();
        unitSelect.innerHTML = `<option value="">請選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">請選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name} (${u.staffId})</option>`).join('');
        });

        btn.addEventListener('click', () => {
            const uid = userSelect.value;
            if(!uid) return alert("請選擇人員");
            this.loadTargetUser(uid);
        });
    }

    // 載入目標使用者的資料 (自己或模擬對象)
    async loadTargetUser(uid) {
        try {
            const userFull = await userService.getUserData(uid);
            if(!userFull) throw new Error("找不到使用者資料");
            
            this.currentUser = userFull; // 更新當前操作對象
            this.targetUserId = uid;
            this.currentUnit = await UnitService.getUnitById(this.currentUser.unitId);
            
            // 更新 UI 顯示
            document.getElementById('user-name-display').textContent = this.currentUser.name;
            document.getElementById('main-content').style.display = 'none'; // 先隱藏舊內容

            // 處理包班顯示 (Req 2)
            if (this.currentUser.constraints?.canBatch) {
                document.getElementById('batch-pref-section').style.display = 'block';
            } else {
                document.getElementById('batch-pref-section').style.display = 'none';
            }

            // 取得該單位人員名單 (為了 hover 顯示)
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
        if(!this.currentUser || !this.currentUser.unitId) {
            if(!this.isAdminMode) alert("尚無單位資料");
            return;
        }

        const m = parseInt(document.getElementById('month-select').value);
        this.month = m;

        // 讀取該單位、該年月的預班表
        const schedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
        
        if (!schedule) {
            document.getElementById('main-content').style.display = 'none';
            document.getElementById('schedule-status-badge').innerHTML = '<span class="badge bg-secondary">未建立預班表</span>';
            alert(`${this.year}年${this.month}月 尚未建立預班表`);
            return;
        }

        this.currentSchedule = schedule;
        this.renderScheduleData();
    }

    renderScheduleData() {
        const schedule = this.currentSchedule;
        document.getElementById('main-content').style.display = 'block';
        
        // 狀態 Badge
        let statusBadge = '';
        if(schedule.status === 'open') statusBadge = '<span class="badge bg-success">開放中</span>';
        else if(schedule.status === 'closed') statusBadge = '<span class="badge bg-danger">已截止</span>';
        else statusBadge = '<span class="badge bg-warning text-dark">準備中</span>';
        document.getElementById('schedule-status-badge').innerHTML = statusBadge;

        document.getElementById('open-date').textContent = schedule.settings.openDate;
        document.getElementById('close-date').textContent = schedule.settings.closeDate;
        document.getElementById('limit-off').textContent = schedule.settings.maxOffDays;
        document.getElementById('limit-display').textContent = schedule.settings.maxOffDays;

        // 讀取提交資料
        const mySub = (schedule.submissions && schedule.submissions[this.currentUser.uid]) || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';

        // 回填偏好
        const myPref = mySub.preferences || {};
        // 包班
        if (myPref.batch) {
            const radio = document.querySelector(`input[name="batchPref"][value="${myPref.batch}"]`);
            if(radio) radio.checked = true;
        } else {
            document.getElementById('batch-none').checked = true;
        }
        // 優先
        document.querySelectorAll('.pref-check').forEach(chk => chk.checked = false);
        if (myPref.priorities && Array.isArray(myPref.priorities)) {
            myPref.priorities.forEach(p => {
                const chk = document.getElementById(`pref-${p.toLowerCase()}`);
                if(chk) chk.checked = true;
            });
        }

        this.calculateAggregate(schedule);

        // 唯讀判斷 (管理員模擬時，無視日期限制，但這裡先照規則走，或可給特權)
        const today = new Date().toISOString().split('T')[0];
        // 如果是 Admin 模式，則總是允許編輯 (方便測試)
        const isTimeValid = (schedule.status === 'open' && today >= schedule.settings.openDate && today <= schedule.settings.closeDate);
        this.isReadOnly = !(isTimeValid || this.isAdminMode);
        
        if (this.isReadOnly) {
            document.getElementById('btn-submit').disabled = true;
            document.getElementById('btn-submit').textContent = "唯讀模式 (非開放時間)";
            document.querySelectorAll('input, textarea').forEach(i => i.disabled = true);
        } else {
            document.getElementById('btn-submit').disabled = false;
            document.getElementById('btn-submit').innerHTML = '<i class="fas fa-paper-plane"></i> 提交預班';
            document.querySelectorAll('input, textarea').forEach(i => i.disabled = false);
        }

        this.renderCalendar();
        this.updateCounts();
    }

    calculateAggregate(schedule) {
        this.unitAggregate = {};
        this.unitNames = {};
        if(!schedule.submissions) return;

        Object.entries(schedule.submissions).forEach(([uid, sub]) => {
            if(!sub.wishes) return;
            Object.entries(sub.wishes).forEach(([day, type]) => {
                if(type === 'OFF') {
                    if(!this.unitAggregate[day]) this.unitAggregate[day] = 0;
                    this.unitAggregate[day]++;
                    
                    if(schedule.settings.showOtherNames) {
                        if(!this.unitNames[day]) this.unitNames[day] = [];
                        const name = this.unitStaffMap[uid] || '未知';
                        this.unitNames[day].push(name);
                    }
                }
            });
        });
    }

    renderCalendar() {
        const container = document.getElementById('calendar-container');
        container.innerHTML = '';
        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const firstDay = new Date(this.year, this.month - 1, 1).getDay();

        const weeks = ['日','一','二','三','四','五','六'];
        weeks.forEach(w => {
            const div = document.createElement('div');
            div.className = `calendar-header ${w==='日'||w==='六'?'text-danger':''}`;
            div.textContent = w;
            container.appendChild(div);
        });

        for(let i=0; i<firstDay; i++) container.appendChild(document.createElement('div'));

        for(let d=1; d<=daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            const date = new Date(this.year, this.month - 1, d);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if(isWeekend) cell.classList.add('weekend');

            const myType = this.myWishes[d];
            if(myType === 'OFF') {
                cell.classList.add('selected');
                cell.innerHTML = `<div class="date-num">${d}</div><div class="shift-tag">OFF</div>`;
            } else {
                cell.innerHTML = `<div class="date-num">${d}</div>`;
            }

            if(this.unitAggregate[d]) {
                const count = this.unitAggregate[d];
                const badge = document.createElement('div');
                badge.className = 'agg-count';
                badge.textContent = `${count}人休`;
                if(this.currentSchedule.settings.showOtherNames && this.unitNames[d]) {
                    badge.title = this.unitNames[d].join(', ');
                }
                cell.appendChild(badge);
            }

            if(!this.isReadOnly) {
                cell.onclick = () => this.toggleDay(d, cell);
            } else {
                cell.classList.add('disabled');
            }
            container.appendChild(cell);
        }
    }

    toggleDay(day, cell) {
        if (this.myWishes[day] === 'OFF') {
            delete this.myWishes[day];
            cell.classList.remove('selected');
            cell.querySelector('.shift-tag')?.remove();
        } else {
            const currentOff = Object.values(this.myWishes).filter(v => v === 'OFF').length;
            const maxOff = parseInt(this.currentSchedule.settings.maxOffDays);
            if (currentOff >= maxOff) { alert("已達預班天數上限！"); return; }
            this.myWishes[day] = 'OFF';
            cell.classList.add('selected');
            if(!cell.querySelector('.shift-tag')) cell.innerHTML += `<div class="shift-tag">OFF</div>`;
        }
        this.updateCounts();
    }

    updateCounts() {
        const total = Object.values(this.myWishes).filter(v => v === 'OFF').length;
        let holiday = 0;
        Object.keys(this.myWishes).forEach(d => {
            if(this.myWishes[d] !== 'OFF') return;
            const date = new Date(this.year, this.month - 1, parseInt(d));
            if(date.getDay() === 0 || date.getDay() === 6) holiday++;
        });

        document.getElementById('count-total').textContent = total;
        document.getElementById('count-holiday').textContent = holiday;
        const maxOff = parseInt(this.currentSchedule.settings.maxOffDays);
        const maxHoliday = parseInt(this.currentSchedule.settings.maxHoliday || 0);
        document.getElementById('count-total').className = `badge rounded-pill fs-6 ${total >= maxOff ? 'bg-danger' : 'bg-primary'}`;
        document.getElementById('count-holiday').className = `badge rounded-pill fs-6 ${holiday >= maxHoliday ? 'bg-danger' : 'bg-info'}`;
    }

    async handleSubmit() {
        if (this.isReadOnly) return;
        if (!confirm('確定提交預班需求？')) return;

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = '提交中...';

        // 收集偏好
        const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
        const priorities = [];
        document.querySelectorAll('.pref-check:checked').forEach(c => priorities.push(c.value));

        const preferences = { batch: batchPref, priorities: priorities };

        try {
            const res = await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId,
                this.currentSchedule.year,
                this.currentSchedule.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value,
                preferences
            );

            if (res.success) {
                alert('✅ 提交成功！');
                this.loadScheduleData(this.preSchedulesList.indexOf(this.currentSchedule));
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            alert("提交失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交預班';
        }
    }
}
