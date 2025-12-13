import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
// 若有 SwapService 請引入

export class SwapApplyPage {
    constructor() {
        this.realUser = null;
        this.currentUser = null;
        this.isAdminMode = false;
    }

    async render() {
        // 內嵌管理員區塊 + 原本的換班介面
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3><i class="fas fa-exchange-alt text-primary me-2"></i>申請換班</h3>
                </div>

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

                <div id="swap-content" class="card shadow">
                    <div class="card-body text-center p-5 text-muted">
                        <i class="fas fa-spinner fa-spin"></i> 載入中...
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.realUser = authService.getProfile();
        if (!this.realUser) return;

        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI();
            document.getElementById('swap-content').innerHTML = '<div class="p-5 text-center text-muted">請先選擇上方單位與人員進行模擬</div>';
        } else {
            this.currentUser = this.realUser;
            this.loadSwapInterface();
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
            
            this.loadSwapInterface();
        });
    }

    async loadSwapInterface() {
        // 這裡填入您原本 SwapApplyPage 的主要渲染邏輯
        // 重點：所有關於 "我" 的資料，請使用 this.currentUser.uid
        const container = document.getElementById('swap-content');
        container.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">換班申請表 (${this.currentUser.name})</h5>
                <p class="text-muted">此功能需整合 SwapService，目前顯示為模擬狀態。</p>
                <div class="alert alert-light border">
                    目前使用者 ID: ${this.currentUser.uid}<br>
                    所屬單位 ID: ${this.currentUser.unitId}
                </div>
            </div>
        `;
    }
}
