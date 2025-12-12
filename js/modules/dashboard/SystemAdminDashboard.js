import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { DashboardTemplate } from "./templates/DashboardTemplate.js"; // 引入 Template

export class SystemAdminDashboard {
    constructor(user) { this.user = user; }

    render() {
        return DashboardTemplate.renderAdmin();
    }

    async afterRender() {
        try {
            const units = await UnitService.getAllUnits();
            document.getElementById('total-units').textContent = units.length;

            const staffCount = await userService.getAllStaffCount();
            document.getElementById('total-staff').textContent = staffCount;
        } catch (error) {
            console.error("更新儀表板數據失敗:", error);
        }
    }
}
