import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js"; // 引入 AuthService
import { DashboardTemplate } from "./templates/DashboardTemplate.js";

export class SystemAdminDashboard {
    constructor(user) { 
        this.user = user; 
        this.staffCache = []; // 暫存該單位所有人員，避免重複查詢
    }

    render() {
        return DashboardTemplate.renderAdmin();
    }

    async afterRender() {
        // 1. 初始化統計數據
        this.loadStats();

        // 2. 初始化切換控制台
        this.initImpersonationConsole();
    }

    async loadStats() {
        try {
            const units = await UnitService.getAllUnits();
            document.getElementById('total-units').textContent = units.length;
            const staffCount = await userService.getAllStaffCount();
            document.getElementById('total-staff').textContent = staffCount;
        } catch (error) { console.error("Stats Error:", error); }
    }

    async initImpersonationConsole() {
        const unitSelect = document.getElementById('admin-unit-select');
        const roleFilter = document.getElementById('admin-role-filter');
        const targetSelect = document.getElementById('admin-target-user');
        const btnSwitch = document.getElementById('btn-start-impersonate');

        // A. 載入所有單位
        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">請選擇單位</option>` + 
                units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) { console.error(e); }

        // B. 單位改變 -> 載入該單位所有人員，並重置篩選
        unitSelect.addEventListener('change', async () => {
            const unitId = unitSelect.value;
            // 重置狀態
            roleFilter.disabled = true; roleFilter.value = "";
            targetSelect.disabled = true; targetSelect.innerHTML = '<option>請先篩選角色</option>';
            btnSwitch.disabled = true;

            if(!unitId) return;

            try {
                // 讀取人員
                targetSelect.innerHTML = '<option>載入中...</option>';
                this.staffCache = await userService.getUnitStaff(unitId);
                
                // 啟用角色篩選
                targetSelect.innerHTML = '<option value="">請先篩選角色</option>';
                roleFilter.disabled = false;
            } catch(e) { console.error(e); }
        });

        // C. 角色篩選改變 -> 過濾人員列表
        roleFilter.addEventListener('change', () => {
            const role = roleFilter.value;
            this.renderTargetUsers(role);
        });

        // D. 目標選擇改變 -> 啟用按鈕
        targetSelect.addEventListener('change', () => {
            btnSwitch.disabled = !targetSelect.value;
        });

        // E. 執行切換
        btnSwitch.addEventListener('click', async () => {
            const targetUid = targetSelect.value;
            if(!targetUid) return;

            const targetUser = this.staffCache.find(s => s.uid === targetUid);
            if(targetUser) {
                if(confirm(`確定要切換身分為：${targetUser.name} (${this.getRoleName(targetUser.role)}) 嗎？`)) {
                    authService.impersonate(targetUser);
                }
            }
        });
    }

    renderTargetUsers(roleFilter) {
        const targetSelect = document.getElementById('admin-target-user');
        const btnSwitch = document.getElementById('btn-start-impersonate');
        
        let filteredStaff = [];
        
        if (roleFilter && roleFilter !== 'all') {
            filteredStaff = this.staffCache.filter(s => s.role === roleFilter);
        } else {
            // 若沒選角色或選 all (預留)，暫時不顯示，強迫使用者選擇具體角色
            filteredStaff = [];
        }

        if (filteredStaff.length === 0) {
            targetSelect.innerHTML = `<option value="">無符合條件的人員</option>`;
            targetSelect.disabled = true;
        } else {
            targetSelect.innerHTML = `<option value="">請選擇人員 (${filteredStaff.length}人)</option>` + 
                filteredStaff.map(s => `<option value="${s.uid}">${s.name} (${s.id||'無職編'})</option>`).join('');
            targetSelect.disabled = false;
        }
        
        btnSwitch.disabled = true;
    }

    getRoleName(role) {
        const map = {
            'unit_manager': '主管',
            'unit_scheduler': '排班者',
            'nurse': '護理師',
            'system_admin': '管理員'
        };
        return map[role] || '人員';
    }
}
