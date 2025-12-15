import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { PreScheduleSubmitTemplate } from "./templates/PreScheduleSubmitTemplate.js"; 

export class PreScheduleSubmitPage {
    // ... (constructor & render & bindEvents ... 保持原樣，省略部分程式碼) ...
    constructor() {
        // ... (保持原樣)
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
        // ... (Template 內容與之前相同，略)
        // (請保留原有的 render 方法內容)
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
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-5 text-center text-muted">請先選擇上方「管理員模式」的單位與人員...</td></tr>`;
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
        
        // 年月切換按鈕
        const btnPrev = document.getElementById('btn-prev-year');
        const btnNext = document.getElementById('btn-next-year');
        const selectMonth = document.getElementById('month-select');
        const btnLoad = document.getElementById('btn-load');

        if(btnPrev) btnPrev.addEventListener('click', () => { this.year--; document.getElementById('display-year').textContent = this.year; });
        if(btnNext) btnNext.addEventListener('click', () => { this.year++; document.getElementById('display-year').textContent = this.year; });
        if(selectMonth) selectMonth.addEventListener('change', (e) => this.month = parseInt(e.target.value));
        if(btnLoad) btnLoad.addEventListener('click', () => this.tryLoadSchedule());
    }

    // ... (initRegularUser, setupAdminUI, handleAdminSwitch, loadContextData, tryLoadSchedule, showListView, calculateAggregate, renderCalendar, toggleDay, handleRightClick, applyShiftFromMenu, checkLimits, updateCounters 保持原樣) ...
    // (為了節省篇幅，請保留原有的中間輔助函式)
    
    async initRegularUser() {
        this.targetUnitId = this.realUser.unitId;
        this.currentUser = this.realUser;
        this.isImpersonating = false;
        if (!this.targetUnitId) { alert("您的帳號尚未綁定單位，無法使用預班功能。"); return; }
        await this.loadContextData(); 
        this.tryLoadSchedule();
    }

    async setupAdminUI() {
        document.getElementById('admin-impersonate-section').style.display = 'block';
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) {}

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.innerHTML = '<option>載入中...</option>';
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', async () => {
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><span class="spinner-border text-primary"></span></td></tr>';
        
        const allSchedules = await PreScheduleService.getPreSchedulesList(this.targetUnitId);
        this.preSchedulesList = allSchedules;
        
        if (allSchedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted text-center">此單位目前無預班表</td></tr>';
            return;
        }
        
        const now = new Date().toISOString().split('T')[0];
        tbody.innerHTML = allSchedules.map(p => {
            let status = '開放中';
            if (now < p.settings.openDate) status = '未開放';
            else if (now > p.settings.closeDate) status = '已截止';
            
            return `<tr>
                <td class="fw-bold fs-5 text-primary">${p.year}-${String(p.month).padStart(2,'0')}</td>
                <td>${this.currentUnit.unitName}</td>
                <td>${p.settings.openDate} ~ ${p.settings.closeDate}</td>
                <td>${status}</td>
                <td><button class="btn btn-sm btn-primary" onclick="window.routerPage.openSchedule('${p.id}', ${status==='已截止'})">填寫預班</button></td>
            </tr>`;
        }).join('');
        this.showListView();
    }

    showListView() {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    openSchedule(id, isExpired) {
        this.currentSchedule = this.preSchedulesList.find(s => s.id === id);
        if (!this.currentSchedule) return;
        
        this.isReadOnly = (this.isAdminMode && !this.isImpersonating) ? false : isExpired;

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
        const maxTypes = settings.shiftTypesLimit || 2; 
        const unitShifts = this.currentUnit.settings?.shifts || [{code:'D', name:'白'}, {code:'E', name:'小'}, {code:'N', name:'大'}];
        const savedPref = mySub.preferences || {};

        document.getElementById('preference-container').innerHTML = 
            PreScheduleSubmitTemplate.renderPreferencesForm(canBatch, maxTypes, savedPref, unitShifts, settings);

        // ✅ 新增：綁定 Radio Change 事件，控制第 3 順位顯示
        const radios = document.getElementsByName('monthlyMix');
        if (radios.length > 0) {
            radios.forEach(r => {
                r.addEventListener('change', (e) => this.updatePriorityVisibility(e.target.value));
            });
            // 初始化狀態
            const currentMix = document.querySelector('input[name="monthlyMix"]:checked')?.value || '2';
            this.updatePriorityVisibility(currentMix);
        }

        if(disabled) {
            document.querySelectorAll('#preference-container input, #preference-container select').forEach(el => el.disabled = true);
        }

        this.calculateAggregate();
        this.renderCalendar();
        this.updateCounters();
    }

    // ✅ 新增: 控制 Priority 3 顯示
    updatePriorityVisibility(mixValue) {
        const p3Container = document.getElementById('container-pref-3');
        if (p3Container) {
            if (mixValue === '3') {
                p3Container.style.display = 'flex';
            } else {
                p3Container.style.display = 'none';
                // 選擇 2 種時，清空第 3 順位的值 (可選)
                const p3Select = document.getElementById('pref-3');
                if(p3Select) p3Select.value = "";
            }
        }
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
            
            const cell = document.createElement('div'); 
            let classes = 'calendar-cell'; 
            if(isWeekend) classes += ' weekend'; 
            if(myType) classes += ' selected'; 
            if(isFull) classes += ' over-limit'; 
            if(this.isReadOnly) classes += ' disabled'; 
            cell.className = classes; 
            
            let tagHtml = ''; 
            if(myType) { 
                const cfg = this.shiftTypes[myType] || { bg:'#6c757d', color:'white' };
                const style = `background:${cfg.bg}; color:${cfg.text};`; 
                tagHtml = `<span class="shift-badge" style="${style}">${myType}</span>`; 
            } 
            
            if (this.currentSchedule.settings.showOtherNames && this.unitNames[d]) { 
                cell.title = `已預班：${this.unitNames[d].join('、')}`; 
            } 
            
            const bottomInfo = `<div class="bottom-stats ${isFull ? 'full' : ''}"><i class="fas fa-user"></i> ${count}/${dailyLimit}</div>`; 
            cell.innerHTML = `<div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div> ${tagHtml} ${bottomInfo}`; 
            
            if(!this.isReadOnly) { 
                cell.onclick = () => this.toggleDay(d); 
                cell.oncontextmenu = (e) => { e.preventDefault(); /* 右鍵邏輯可選 */ }; 
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
        document.getElementById('count-total').textContent = total; 
        document.getElementById('count-holiday').textContent = holiday; 
    }
    
    async handleSubmit() {
        const canBatch = this.currentUser.constraints?.canBatch;
        const preferences = {};
        
        const settings = this.currentSchedule.settings;
        const allow3 = settings.allowThreeTypesVoluntary !== false; 
        
        if (canBatch) {
            const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
            preferences.batch = batchPref;
        }

        if (allow3) {
            const mixPref = document.querySelector('input[name="monthlyMix"]:checked')?.value || "2";
            preferences.monthlyMix = mixPref;
        } else {
            preferences.monthlyMix = "2"; 
        }

        const p1 = document.getElementById('pref-1')?.value || "";
        const p2 = document.getElementById('pref-2')?.value || "";
        const p3 = document.getElementById('pref-3')?.value || ""; 

        if (!p1 && (p2 || p3)) { alert("請從第一優先開始填寫"); return; }
        
        const selected = [p1, p2, p3].filter(x => x);
        const unique = new Set(selected);
        if (selected.length !== unique.size) { alert("偏好順序請勿選擇重複的班別"); return; }

        preferences.priority1 = p1;
        preferences.priority2 = p2;
        if (allow3) preferences.priority3 = p3; 

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
