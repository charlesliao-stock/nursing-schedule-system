import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js"; // 新增引用
import { MyScheduleTemplate } from "./templates/MyScheduleTemplate.js"; 

export class MySchedulePage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        
        // 身分狀態
        this.realUser = null;       // 實際登入者
        this.currentUser = null;    // 當前顯示對象 (可能是模擬的)
        this.isAdminMode = false;
        this.isImpersonating = false;
    }

    async render() {
        // 先取得基本 Layout
        const layout = MyScheduleTemplate.renderLayout(this.year, this.month);
        
        // 在最上方插入管理員模擬區塊
        const adminSection = `
            <div id="admin-impersonate-section" class="card shadow-sm mb-4 border-left-danger" style="display:none;">
                <div class="card-body py-2">
                    <div class="d-flex align-items-center gap-2">
                        <label class="fw-bold text-danger"><i class="fas fa-user-secret me-1"></i>管理員模式：</label>
                        <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">選擇單位</option></select>
                        <select id="admin-user-select" class="form-select form-select-sm w-auto"><option value="">選擇人員</option></select>
                        <button id="btn-impersonate" class="btn btn-danger btn-sm">切換身分</button>
                    </div>
                    <div id="sim-status-alert" class="alert alert-info mt-2 mb-0 py-2 small" style="display:none;"></div>
                </div>
            </div>`;
            
        // 將 adminSection 插在 container 的開頭 (這裡簡單用字串拼接，或透過 DOM 操作)
        // 假設 Template 返回的是 HTML 字串，我們將其包裹並插入
        return `<div class="container-fluid mt-4">${adminSection} ${layout}</div>`;
    }

    async afterRender() {
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        
        this.realUser = authService.getProfile();
        if (!this.realUser) { return; }

        window.routerPage = this;
        document.getElementById('btn-query').addEventListener('click', () => this.loadSchedule());

        // 權限判斷
        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI();
            // 管理員預設清空內容，等待選擇
            document.getElementById('table-body-shift').innerHTML = '<tr><td colspan="31" class="p-5 text-center text-muted">請先選擇上方單位與人員進行模擬</td></tr>';
        } else {
            this.initRegularUser();
        }
    }

    async initRegularUser() {
        this.currentUser = this.realUser;
        this.isImpersonating = false;
        if(this.currentUser.unitId) {
            this.loadSchedule();
        }
    }

    async setupAdminUI() {
        document.getElementById('admin-impersonate-section').style.display = 'block';
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) { console.error(e); }

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.innerHTML = '<option>載入中...</option>';
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', async () => {
            const uid = userSelect.value;
            if(!uid) return alert("請選擇人員");
            
            try {
                const targetUser = await userService.getUserData(uid);
                this.currentUser = targetUser;
                this.isImpersonating = true;
                
                const alertBox = document.getElementById('sim-status-alert');
                alertBox.innerHTML = `<strong>模擬中：</strong> ${targetUser.name} (${targetUser.unitName})`;
                alertBox.style.display = 'block';
                
                this.loadSchedule();
            } catch(e) { alert("切換失敗: " + e.message); }
        });
    }

    async loadSchedule() {
        // 使用 Template 裡的 Input
        let val = document.getElementById('my-month')?.value;
        if(!val) {
            // 如果 Template 還沒渲染完或找不到，使用預設
            val = `${this.year}-${String(this.month).padStart(2,'0')}`;
        } else {
            const [y, m] = val.split('-');
            this.year = parseInt(y);
            this.month = parseInt(m);
        }

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        
        // 1. 渲染表頭
        document.getElementById('table-head-date').innerHTML = MyScheduleTemplate.renderHeadDate(this.year, this.month, daysInMonth);
        document.getElementById('table-head-week').innerHTML = MyScheduleTemplate.renderHeadWeek(this.year, this.month, daysInMonth);

        // 2. 查詢資料 (使用 currentUser)
        const unitId = this.currentUser?.unitId;
        if(!unitId) {
            document.getElementById('table-body-shift').innerHTML = `<td colspan="${daysInMonth}" class="p-5 text-center text-muted">此帳號未綁定單位</td>`;
            return;
        }

        const schedule = await ScheduleService.getSchedule(unitId, this.year, this.month);
        
        // 3. 渲染內容
        document.getElementById('table-body-shift').innerHTML = 
            MyScheduleTemplate.renderBodyRow(schedule, this.currentUser.uid, daysInMonth);
    }
}
