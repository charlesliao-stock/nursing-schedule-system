import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
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
        this.currentUnit = null; 
        this.unitStaffMap = {}; 
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        this.myWishes = {};
        this.myPreferences = {}; // ✅ 儲存偏好
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.isReadOnly = false; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求與偏好。</p>
                </div>

                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-3">
                        <label class="fw-bold">預班月份：</label>
                        <select id="schedule-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-load" class="btn btn-primary">讀取</button>
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
                                    <h6 class="m-0 font-weight-bold text-primary">畫休月曆</h6>
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
                                        <label class="fw-bold d-block mb-2">優先班別 (最多選 2 項)</label>
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
        this.currentUser = authService.getProfile();
        if(!this.currentUser) return;

        // 1. 處理「優先班別」只能選 2 個的邏輯
        const prefChecks = document.querySelectorAll('.pref-check');
        prefChecks.forEach(chk => {
            chk.addEventListener('change', () => {
                const checked = document.querySelectorAll('.pref-check:checked');
                if (checked.length > 2) {
                    chk.checked = false; // 取消當前勾選
                    alert("優先班別最多只能選擇 2 項");
                }
            });
        });

        // 2. 載入資料
        try {
            const userFull = await userService.getUserData(this.currentUser.uid);
            this.currentUser = userFull; // 更新為完整資料 (含 constraints)
            this.currentUnit = await UnitService.getUnitById(this.currentUser.unitId);
            
            // 顯示/隱藏包班選項
            const canBatch = this.currentUser.constraints?.canBatch;
            if (canBatch) {
                document.getElementById('batch-pref-section').style.display = 'block';
            }

            const staff = await userService.getUnitStaff(this.currentUser.unitId);
            staff.forEach(s => this.unitStaffMap[s.uid] = s.name);

            this.loadList(this.currentUser.unitId);
        } catch(e) { console.error(e); }

        document.getElementById('btn-load').addEventListener('click', () => {
            const val = document.getElementById('schedule-select').value;
            if(val) this.loadScheduleData(val);
        });

        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());
    }

    async loadList(unitId) {
        const list = await PreScheduleService.getPreSchedulesList(unitId);
        this.preSchedulesList = list;
        
        const select = document.getElementById('schedule-select');
        if (list.length === 0) {
            select.innerHTML = '<option value="">無開放的預班</option>';
            return;
        }

        select.innerHTML = list.map((s, index) => {
            let label = `${s.year}-${String(s.month).padStart(2,'0')}`;
            if(s.status === 'open') label += ' (開放中)';
            else if(s.status === 'closed') label += ' (已截止)';
            else label += ' (準備中)';
            return `<option value="${index}">${label}</option>`;
        }).join('');

        // 自動選取第一個開放的
        const openIdx = list.findIndex(s => s.status === 'open');
        if(openIdx >= 0) {
            select.selectedIndex = openIdx;
            this.loadScheduleData(openIdx);
        }
    }

    loadScheduleData(index) {
        const schedule = this.preSchedulesList[index];
        this.currentSchedule = schedule;
        
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('open-date').textContent = schedule.settings.openDate;
        document.getElementById('close-date').textContent = schedule.settings.closeDate;
        document.getElementById('limit-off').textContent = schedule.settings.maxOffDays;
        document.getElementById('limit-display').textContent = schedule.settings.maxOffDays;

        // 讀取我的提交
        const mySub = (schedule.submissions && schedule.submissions[this.currentUser.uid]) || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';

        // ✅ 回填偏好設定
        const myPref = mySub.preferences || {};
        // 包班
        if (myPref.batch) {
            const radio = document.querySelector(`input[name="batchPref"][value="${myPref.batch}"]`);
            if(radio) radio.checked = true;
        } else {
            document.getElementById('batch-none').checked = true;
        }
        // 優先班別
        document.querySelectorAll('.pref-check').forEach(chk => chk.checked = false);
        if (myPref.priorities && Array.isArray(myPref.priorities)) {
            myPref.priorities.forEach(p => {
                const chk = document.getElementById(`pref-${p.toLowerCase()}`);
                if(chk) chk.checked = true;
            });
        }

        // 計算每日統計
        this.calculateAggregate(schedule);

        // 唯讀判斷
        const today = new Date().toISOString().split('T')[0];
        this.isReadOnly = (schedule.status !== 'open' || today < schedule.settings.openDate || today > schedule.settings.closeDate);
        
        if (this.isReadOnly) {
            document.getElementById('btn-submit').disabled = true;
            document.getElementById('btn-submit').textContent = "唯讀模式 (非開放時間)";
            document.getElementById('wish-notes').disabled = true;
            document.querySelectorAll('input').forEach(i => i.disabled = true);
        } else {
            document.getElementById('btn-submit').disabled = false;
            document.getElementById('btn-submit').innerHTML = '<i class="fas fa-paper-plane"></i> 提交預班';
            document.getElementById('wish-notes').disabled = false;
            document.querySelectorAll('input').forEach(i => i.disabled = false);
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
        
        const daysInMonth = new Date(this.currentSchedule.year, this.currentSchedule.month, 0).getDate();
        const firstDay = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, 1).getDay();

        // 星期表頭
        const weeks = ['日','一','二','三','四','五','六'];
        weeks.forEach(w => {
            const div = document.createElement('div');
            div.className = `calendar-header ${w==='日'||w==='六'?'text-danger':''}`;
            div.textContent = w;
            container.appendChild(div);
        });

        // 空白格
        for(let i=0; i<firstDay; i++) {
            container.appendChild(document.createElement('div'));
        }

        // 日期格
        for(let d=1; d<=daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            
            const date = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if(isWeekend) cell.classList.add('weekend');

            // 檢查是否已選
            const myType = this.myWishes[d];
            if(myType === 'OFF') {
                cell.classList.add('selected');
                cell.innerHTML = `<div class="date-num">${d}</div><div class="shift-tag">OFF</div>`;
            } else if (['白','小','大','x白','x小','x大'].includes(myType)) { // 支援其他預班
                cell.classList.add('selected-shift'); 
                cell.innerHTML = `<div class="date-num">${d}</div><div class="shift-tag" style="background:#666;">${myType}</div>`;
            } else {
                cell.innerHTML = `<div class="date-num">${d}</div>`;
            }

            // 顯示統計 (若有開啟)
            if(this.unitAggregate[d]) {
                const count = this.unitAggregate[d];
                // 這裡可以加入 daily limit 檢查顯示紅框，此處略
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
            // 檢查上限
            const currentOff = Object.values(this.myWishes).filter(v => v === 'OFF').length;
            const maxOff = parseInt(this.currentSchedule.settings.maxOffDays);
            
            if (currentOff >= maxOff) {
                alert("已達預班天數上限！");
                return;
            }
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
            const date = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, parseInt(d));
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

        // ✅ 收集偏好
        const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
        const priorities = [];
        document.querySelectorAll('.pref-check:checked').forEach(c => priorities.push(c.value));

        const preferences = {
            batch: batchPref,
            priorities: priorities
        };

        try {
            const res = await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId,
                this.currentSchedule.year,
                this.currentSchedule.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value,
                preferences // ✅ 傳入偏好
            );

            if (res.success) {
                alert('✅ 提交成功！');
                // 重新載入以確認狀態
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
