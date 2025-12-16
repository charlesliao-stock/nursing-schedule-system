import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js"; 
import { DashboardTemplate } from "./templates/DashboardTemplate.js"; 

export class UnitManagerDashboard {
    constructor(user) { 
        this.user = user; 
        this.isImpersonating = !!user.isImpersonating; 
    }

    async render() {
        return DashboardTemplate.renderManager(this.isImpersonating);
    }

    async afterRender() {
        // 綁定退出按鈕
        const exitBtn = document.getElementById('btn-exit-impersonate');
        if(exitBtn) {
            exitBtn.addEventListener('click', () => authService.stopImpersonation());
        }

        if(this.user.unitId) {
            try {
                const unit = await UnitService.getUnitById(this.user.unitId);
                document.getElementById('dash-unit-name').textContent = unit ? unit.unitName : this.user.unitId;

                const staff = await userService.getUnitStaff(this.user.unitId);
                document.getElementById('dash-staff-count').textContent = staff.length + " 人";

                // 取得待辦計數
                const counts = await SwapService.getPendingCounts(this.user.uid, this.user.unitId, true);
                document.getElementById('dash-swap-count').textContent = counts.managerPending + " 筆";

            } catch(e) { console.error(e); }
        } else {
            document.getElementById('dash-unit-name').textContent = "無單位";
        }
    }
}
