import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { SwapService } from "../../services/firebase/SwapService.js";

export class UnitManagerDashboard {
    constructor(user) {
        this.user = user;
    }

    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 text-gray-800">單位管理儀表板</h2>
                    <span class="badge bg-primary fs-6" id="dash-unit-name"><i class="fas fa-spinner fa-spin"></i></span>
                </div>
                <div class="row">
                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/unit/staff/list'" style="cursor:pointer;">
                        <div class="card border-left-info shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2"><div class="text-xs font-weight-bold text-info text-uppercase mb-1">單位人數</div><div class="h5 mb-0 font-weight-bold text-gray-800" id="dash-staff-count">...</div></div>
                                    <div class="col-auto"><i class="fas fa-users fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/swaps/review'" style="cursor:pointer;">
                        <div class="card border-left-warning shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2"><div class="text-xs font-weight-bold text-warning text-uppercase mb-1">待審核換班</div><div class="h5 mb-0 font-weight-bold text-gray-800" id="dash-swap-count">...</div></div>
                                    <div class="col-auto"><i class="fas fa-check-double fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/schedule/list'" style="cursor:pointer;">
                        <div class="card border-left-primary shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2"><div class="text-xs font-weight-bold text-primary text-uppercase mb-1">排班作業</div><div class="h5 mb-0 font-weight-bold text-gray-800">進入管理</div></div>
                                    <div class="col-auto"><i class="fas fa-calendar-alt fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if(this.user.unitId) {
            try {
                const unit = await UnitService.getUnitById(this.user.unitId);
                document.getElementById('dash-unit-name').textContent = unit ? unit.unitName : this.user.unitId;

                const staff = await userService.getUnitStaff(this.user.unitId);
                document.getElementById('dash-staff-count').textContent = staff.length + " 人";

                // ✅ 這裡現在能正確呼叫了
                const swaps = await SwapService.getPendingRequests(this.user.unitId);
                document.getElementById('dash-swap-count').textContent = swaps.length + " 筆";
            } catch(e) { console.error(e); }
        } else {
            document.getElementById('dash-unit-name').textContent = "無單位";
        }
    }
}
