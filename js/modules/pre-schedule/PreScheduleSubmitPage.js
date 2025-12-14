import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { PreScheduleSubmitTemplate } from "./templates/PreScheduleSubmitTemplate.js"; 

export class PreScheduleSubmitPage {
    constructor() {
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1; 
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth -= 12; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        
        this.realUser = null;       
        this.currentUser = null;    
        this.targetUnitId = null;   
        this.currentUnit = null;    
        
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        this.myWishes = {};
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.unitStaffMap = {};
        
        this.isReadOnly = false;
        this.isAdminMode = false;
        this.isImpersonating = false; 
        
        this.shiftTypes = {
            'OFF':   { label: 'OFF',  color: '#dc3545', bg: '#dc3545', text: 'white' },
            'M_OFF': { label: 'M',    color: '#212529', bg: '#212529', text: 'white' },
            'D':     { label: '白',   color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E':     { label: '小',   color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N':     { label: '大',   color: '#212529', bg: '#212529', text: 'white' },
            'NO_D':  { label: '勿白', color: '#adb5bd', bg: '#f8f9fa', text: '#0d6efd', border: '1px solid #0d6efd' },
            'NO_E':  { label: '勿小', color: '#adb5bd', bg: '#f8f9fa', text: '#ffc107', border: '1px solid #ffc107' },
            'NO_N':  { label: '勿大', color: '#adb5bd', bg: '#f8f9fa', text: '#212529', border: '1px solid #212529' }
        };
    }

    async render() {
        return PreScheduleSubmitTemplate.renderLayout(this.year, this.month);
    }

    async afterRender() {
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        
        this.realUser = authService.getProfile();
        if (!this.realUser) { alert("無法讀取使用者資訊"); return; }

        window.routerPage = this;
        this.bindEvents();

        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI();
            const tbody = document.getElementById('schedule-list-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-5 text-center text-muted"><div class="alert alert-warning d-inline-block shadow-sm"><i class="fas fa-hand-point-up me-2"></i>請先選擇上方「管理員模式」的單位與人員，並點擊 <span class="badge bg-danger">切換身分</span> 按鈕進行模擬。</div></td></tr>`;
            }
            document.getElementById('list-view').style.display = 'block';
        } else {
            this.initRegularUser();
        }
    }

    bindEvents() {
        document.getElementById('btn-back').addEventListener('click', () => this.showListView());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('user-shift-menu');
            if(menu && !e.target.closest('#user-shift-menu')) menu.style.display = 'none';
        });
        
        const btnPrev = document.getElementById('btn-prev-year');
        const btnNext = document.getElementById('btn-next-year');
        const selectMonth = document.getElementById('month-select');
        const btnLoad = document.getElementById('btn-load');

        if(btnPrev) btnPrev.addEventListener('click', () => { this.year--; document.getElementById('display-year').textContent = this.year; });
        if(btnNext) btnNext.addEventListener('click', () => { this.year++; document.getElementById('display-year').textContent = this.year; });
        if(selectMonth) selectMonth.addEventListener('change', (e) => this.month = parseInt(e.target.value));
        if(btnLoad) btnLoad.addEventListener('click', () => this.tryLoadSchedule());
    }

    async initRegularUser() {
        this.targetUnitId = this.realUser.unitId;
        this.currentUser = this.realUser;
        this.isImpersonating = false;
        if (!this.targetUnitId) { alert("您的帳號尚未綁定單位，無法使用預班功能。"); return; }
        await this.loadContextData(); 
        this.tryLoadSchedule();
    }

    async setupAdminUI() {
        const section = document.getElementById('admin-impersonate-section');
        if (section) section.style.display = 'block';
        
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch (e) { console.error(e); }

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.innerHTML = '<option>載入中...</option>';
            try {
                const staff = await userService.getUnitStaff(unitSelect.value);
                userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name} (${u.staffId || ''})</option>`).join('');
            } catch (e) { userSelect.innerHTML = '<option>載入失敗</option>'; }
        });

        btn.addEventListener('click', () => {
            const uid = userSelect.value;
            const unitId = unitSelect.value;
            if(!uid || !unitId) return alert("請選擇單位與人員");
            this.handleAdminSwitch(unitId, uid);
        });
    }

    async handleAdminSwitch(unitId, userId) {
        try {
            this.targetUnitId = unitId;
            const targetUser = await userService.getUserData(userId);
            if (!targetUser) throw new Error("找不到該使用者資料");
            this.currentUser = targetUser;
            this.isImpersonating = true;

            await this.loadContextData();
            document.getElementById('detail-view').style.display = 'none';
            document.getElementById('list-view').style.display = 'block';
            this.tryLoadSchedule();

        } catch (e) { alert("切換身份失敗: " + e.message); }
    }

    async loadContextData() {
        this.currentUnit = await UnitService.getUnitById(this.targetUnitId);
        const staff = await userService.getUnitStaff(this.targetUnitId);
        this.unitStaffMap = {};
        staff.forEach(s => this.unitStaffMap[s.uid] = s.name);
    }

    async tryLoadSchedule() {
        if(!this.targetUnitId) return;
        const tbody = document.getElementById('schedule-list-tbody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><span class="spinner-border text-primary"></span></td></tr>';

        try {
            const allSchedules = await PreScheduleService.getPreSchedulesList(this.targetUnitId);
            this.preSchedulesList = allSchedules;

            if (allSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted text-center">此單位目前無預班表</td></tr>';
                return;
            }

            const now = new Date().toISOString().split('T')[0];

            tbody.innerHTML = allSchedules.map(p => {
                const showAll = this.isAdminMode && !this.isImpersonating;
                if (!showAll && (!p.staffIds || !p.staffIds.includes(this.currentUser.uid))) return '';

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

                const btnText = isExpired ? '檢視' : '填寫預班';
                const btnClass = isExpired ? 'btn-outline-secondary' : 'btn-primary';

                return `
                    <tr>
                        <td class="fw-bold fs-5 text-primary">${p.year}-${String(p.month).padStart(2,'0')}</td>
                        <td>${this.currentUnit.unitName}</td>
                        <td>${openDate} ~ ${closeDate}</td>
                        <td>${statusHtml}</td>
                        <td>
                            <button class="btn btn-sm ${btnClass}" onclick="window.routerPage.openSchedule('${p.id}', ${isExpired})">
                                ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            if (tbody.innerHTML.trim() === '') {
                tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted text-center">該同仁不在任何預班名單中</td></tr>';
            }
            
            this.showListView();

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">載入失敗: ${e.message}</td></tr>`;
        }
    }

    showListView() {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    openSchedule(id, isExpired) {
        this.currentSchedule = this.preSchedulesList.find(s => s.id === id);
        if (!this.currentSchedule) return;
        
        if (this.isAdminMode && !this.isImpersonating) this.isReadOnly = false; 
        else this.isReadOnly = isExpired;

        document.getElementById('list-view').style.display = 'none';
        document.getElementById('detail-view').style.display = 'block';
        document.getElementById('calendar-header-title').textContent = `${this.currentUnit.unitName} ${this.currentSchedule.year}年${this.currentSchedule.month}月`;

        const mySub = (this.currentSchedule.submissions && this.currentSchedule.submissions[this.currentUser.uid]) || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';

        const settings = this.currentSchedule.settings;
        document.getElementById('limit-total').textContent = settings.maxOffDays;
        document.getElementById('limit-holiday').textContent = settings.maxHoliday || 0;

        const disabled = this.isReadOnly;
        const submitBtn = document.getElementById('btn-submit');
        if (submitBtn) {
            submitBtn.disabled = disabled;
            submitBtn.textContent = disabled ? "已截止 / 唯讀" : "提交預班";
        }
        document.querySelectorAll('#detail-view textarea').forEach(i => i.disabled = disabled);

        const canBatch = this.currentUser.constraints?.canBatch;
        const maxTypes = this.currentUnit.rules?.constraints?.maxShiftTypesWeek || 2;
        const savedPref = mySub.preferences || {};
        
        document.getElementById('preference-container').innerHTML = 
            PreScheduleSubmitTemplate.renderPreferencesForm(canBatch, maxTypes, savedPref);

        // 如果是唯讀狀態，停用所有 input
        if (disabled) {
            document.querySelectorAll('#preference-container input, #preference-container select').forEach(el => el.disabled = true);
        }

        this.calculateAggregate();
        this.renderCalendar();
        this.updateCounters();
    }

    calculateAggregate() { 
        this.unitAggregate = {}; this.unitNames = {}; 
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
        const totalStaff = this.currentSchedule.staffIds.length; 
        const reserved = this.currentSchedule.settings.reservedStaff || 0; 
        const reqMatrix = this.currentUnit.staffRequirements || {D:{}, E:{}, N:{}}; 
        
        for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="calendar-cell disabled" style="background:transparent; border:none; min-height:100px;"></div>`; 
        
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
            if(isFull) classes += ' over-limit'; 
            if(this.isReadOnly) classes += ' disabled'; 
            cell.className = classes; 
            
            let tagHtml = ''; 
            if(cfg) { 
                const style = cfg.border ? `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border};` : `background:${cfg.bg}; color:${cfg.text};`; 
                tagHtml = `<span class="shift-badge" style="${style}">${cfg.label}</span>`; 
            } 
            
            if (this.currentSchedule.settings.showOtherNames && this.unitNames[d]) { 
                cell.title = `已預班：${this.unitNames[d].join('、')}`; 
            } 
            
            const bottomInfo = `<div class="bottom-stats ${isFull ? 'full' : ''}"><i class="fas fa-user"></i> ${count}/${dailyLimit}</div>`; 
            cell.innerHTML = `<div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div> ${tagHtml} ${bottomInfo}`; 
            
            if(!this.isReadOnly) { 
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
        
        if(menu) {
            const unitShifts = this.currentUnit.settings?.shifts || [
                {code:'D', name:'白班'}, {code:'E', name:'小夜'}, {code:'N', name:'大夜'}
            ];

            let menuHtml = `<h6 class="dropdown-header bg-light py-1">設定 ${day} 日</h6>`;
            menuHtml += `<button class="dropdown-item py-1" onclick="window.routerPage.applyShiftFromMenu('OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 預休/休假</button>`;
            menuHtml += `<div class="dropdown-divider my-1"></div>`;
            
            unitShifts.forEach(s => {
                menuHtml += `<button class="dropdown-item py-1" onclick="window.routerPage.applyShiftFromMenu('${s.code}')"><span class="badge bg-info text-white w-25 me-2">${s.code}</span> 指定${s.name}</button>`;
            });
            menuHtml += `<div class="dropdown-divider my-1"></div>`;

            unitShifts.forEach(s => {
                menuHtml += `<button class="dropdown-item py-1 text-danger" onclick="window.routerPage.applyShiftFromMenu('NO_${s.code}')"><i class="fas fa-ban w-25 me-2"></i> 勿排${s.name}</button>`;
            });
            
            menuHtml += `<div class="dropdown-divider my-1"></div>`;
            menuHtml += `<button class="dropdown-item py-1 text-secondary" onclick="window.routerPage.applyShiftFromMenu('')"><i class="fas fa-eraser w-25 me-2"></i> 清除</button>`;

            menu.innerHTML = menuHtml;

            const menuWidth = 180; 
            let left = e.clientX;
            let top = e.clientY;
            
            if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
            if (top + menu.offsetHeight > window.innerHeight) top = window.innerHeight - menu.offsetHeight - 10;

            menu.style.left = `${left}px`; 
            menu.style.top = `${top}px`; 
            menu.style.display = 'block'; 
        }
    }

    applyShiftFromMenu(type) { 
        if(!this.tempTarget) return; 
        const day = this.tempTarget; 
        
        if(type) { 
            if (!this.myWishes[day]) {
                if (type === 'OFF' && !this.checkLimits(day)) return; 
            }
            this.myWishes[day] = type; 
        } else { 
            delete this.myWishes[day]; 
        } 
        
        this.renderCalendar(); 
        this.updateCounters(); 
        const menu = document.getElementById('user-shift-menu');
        if(menu) menu.style.display = 'none'; 
    }

    checkLimits(day) { 
        if (this.isAdminMode && !this.isImpersonating) return true; 
        const settings = this.currentSchedule.settings; 
        const maxOff = parseInt(settings.maxOffDays); 
        const maxHoliday = parseInt(settings.maxHoliday || 0); 
        
        const currentTotal = Object.values(this.myWishes).filter(v => v === 'OFF').length; 
        if (currentTotal >= maxOff) { alert("已達預班總數上限"); return false; } 
        
        const date = new Date(this.currentSchedule.year, this.currentSchedule.month-1, day); 
        const w = date.getDay(); 
        if(w===0 || w===6) { 
            let hCount = 0; 
            Object.entries(this.myWishes).forEach(([d, v]) => { 
                if(v !== 'OFF') return;
                const dt = new Date(this.currentSchedule.year, this.currentSchedule.month-1, d); 
                if(dt.getDay()===0 || dt.getDay()===6) hCount++; 
            }); 
            if(hCount >= maxHoliday) { alert("已達假日預班上限"); return false; } 
        } 
        return true; 
    }

    updateCounters() { 
        const total = Object.values(this.myWishes).filter(v => v === 'OFF').length;
        let holiday = 0; 
        Object.entries(this.myWishes).forEach(([d, v]) => { 
            if(v !== 'OFF') return;
            const date = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d); 
            if(date.getDay() === 0 || date.getDay() === 6) holiday++; 
        }); 
        const totalEl = document.getElementById('count-total');
        const holidayEl = document.getElementById('count-holiday');
        if(totalEl) totalEl.textContent = total; 
        if(holidayEl) holidayEl.textContent = holiday; 
    }
    
    async handleSubmit() {
        const canBatch = this.currentUser.constraints?.canBatch;
        const preferences = {};
        
        if (canBatch) {
            const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
            preferences.batch = batchPref;
        }

        // ✅ 新增：收集 monthlyMix 偏好
        const mixPref = document.querySelector('input[name="monthlyMix"]:checked')?.value || "2";
        preferences.monthlyMix = mixPref;

        const p1 = document.getElementById('pref-1')?.value || "";
        const p2 = document.getElementById('pref-2')?.value || "";
        const p3 = document.getElementById('pref-3')?.value || "";

        if (!p1 && (p2 || p3)) { alert("請從第一優先開始填寫"); return; }
        
        const selected = [p1, p2, p3].filter(x => x);
        const unique = new Set(selected);
        if (selected.length !== unique.size) { alert("偏好順序請勿選擇重複的班別"); return; }

        preferences.priority1 = p1;
        preferences.priority2 = p2;
        preferences.priority3 = p3;

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        try {
            await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId, this.currentSchedule.year, this.currentSchedule.month,
                this.currentUser.uid, this.myWishes,
                document.getElementById('wish-notes').value,
                preferences
            );
            
            let msg = '✅ 提交成功！';
            if (this.isImpersonating) msg += `\n(已為 ${this.currentUser.name} 提交)`;
            
            alert(msg);
            this.showListView();
            this.tryLoadSchedule();
        } catch (e) { alert("提交失敗: " + e.message); } finally { btn.disabled = false; }
    }
}
