import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    constructor(user) { this.user = user; }

    render() {
        return `
            <div class="dashboard-content container-fluid p-0">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 text-gray-800"><i class="fas fa-tachometer-alt text-primary me-2"></i>系統概覽</h2>
                    <span class="badge bg-secondary">系統管理員模式</span>
                </div>

                <div class="stats-grid mb-4" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                    
                    <div class="stat-card bg-white p-4 rounded shadow-sm border-0 position-relative overflow-hidden" 
                         onclick="location.hash='/system/units/list'" 
                         style="cursor:pointer; border-left: 4px solid #3b82f6 !important; transition: transform 0.2s;">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <p class="text-uppercase text-muted small fw-bold mb-1">總單位數</p>
                                <h3 class="fw-bold text-dark mb-0" id="total-units">--</h3>
                            </div>
                            <div class="icon-circle bg-blue-100 text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                <i class="fas fa-hospital fa-lg"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card bg-white p-4 rounded shadow-sm border-0 position-relative overflow-hidden" 
                         onclick="location.hash='/unit/staff/list'"
                         style="cursor:pointer; border-left: 4px solid #10b981 !important; transition: transform 0.2s;">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <p class="text-uppercase text-muted small fw-bold mb-1">總人員數</p>
                                <h3 class="fw-bold text-dark mb-0" id="total-staff">--</h3>
                            </div>
                            <div class="icon-circle bg-green-100 text-success rounded-circle d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                <i class="fas fa-user-nurse fa-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.updateStats();
    }

    async updateStats() {
        try {
            // 1. 取得單位數
            const units = await UnitService.getAllUnits();
            document.getElementById('total-units').textContent = units.length;

            // 2. 取得人員數 (Fix: 使用修復後的方法)
            const staffCount = await userService.getAllStaffCount();
            document.getElementById('total-staff').textContent = staffCount;

        } catch (error) {
            console.error("更新儀表板數據失敗:", error);
        }
    }
}
