import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { DashboardTemplate } from "./templates/DashboardTemplate.js"; // 引入 Template

export class UnitManagerDashboard {
    constructor(user) { this.user = user; }

    async render() {
        return DashboardTemplate.renderManager();
    }

    async afterRender() {
        if(this.user.unitId) {
            try {
                const unit = await UnitService.getUnitById(this.user.unitId);
                document.getElementById('dash-unit-name').textContent = unit ? unit.unitName : this.user.unitId;

                const staff = await userService.getUnitStaff(this.user.unitId);
                document.getElementById('dash-staff-count').textContent = staff.length + " 人";

                const swaps = await SwapService.getPendingRequests(this.user.unitId);
                document.getElementById('dash-swap-count').textContent = swaps.length + " 筆";
            } catch(e) { console.error(e); }
        } else {
            document.getElementById('dash-unit-name').textContent = "無單位";
        }
    }
}
