import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PersonalStatsPage {
    constructor() {
        this.realUser = null;
        this.currentUser = null;
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3><i class="fas fa-chart-pie text-primary me-2"></i>個人統計</h3></div>

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
                </div>

                <div id="stats-content" class="card shadow">
                    <div class="card-body p-5 text-center text-muted">
                        資料載入中...
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.realUser = authService.getProfile();
        if (!this.realUser) return;

        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.setupAdminUI();
            document.getElementById('stats-content').innerHTML = '<div class="card-body p-5 text-center text-muted">請先選擇上方單位與人員進行模擬</div>';
        } else {
            this.currentUser = this.realUser;
            this.loadStats();
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
        } catch(e) {}

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.innerHTML = '<option>載入中...</option>';
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', async () => {
            const uid = userSelect.value;
            if(!uid) return alert("請選擇人員");
            
            const targetUser = await userService.getUserData(uid);
            this.currentUser = targetUser;
            
            document.getElementById('sim-status-alert').innerHTML = `<strong>模擬中：</strong> ${targetUser.name}`;
            document.getElementById('sim-status-alert').style.display = 'block';
            
            this.loadStats();
        });
    }

    async loadStats() {
        // 這裡放置您的統計圖表渲染邏輯
        // 範例：
        const container = document.getElementById('stats-content');
        container.innerHTML = `
            <div class="card-body">
                <h5 class="card-title text-center mb-4">${this.currentUser.name} 的年度統計</h5>
                <div class="row text-center">
                    <div class="col-md-3 mb-3">
                        <div class="p-3 border rounded bg-light">
                            <div class="h3 text-primary">--</div>
                            <div class="small text-muted">累積積假</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="p-3 border rounded bg-light">
                            <div class="h3 text-success">--</div>
                            <div class="small text-muted">本月夜班數</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="p-3 border rounded bg-light">
                            <div class="h3 text-danger">--</div>
                            <div class="small text-muted">本月OFF數</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="p-3 border rounded bg-light">
                            <div class="h3 text-info">--</div>
                            <div class="small text-muted">特殊時數</div>
                        </div>
                    </div>
                </div>
                <div class="alert alert-info text-center">
                    圖表功能整合中... (資料來源：User ID ${this.currentUser.uid})
                </div>
            </div>
        `;
    }
}
