import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { router } from "../../core/Router.js";

export class SystemAdminDashboard {
    
    constructor(user) {
        this.user = user;
    }

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
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="z-1">
                                <h6 class="text-uppercase text-muted fw-bold mb-2" style="font-size: 0.8rem;">單位總數</h6>
                                <h2 id="unit-count-display" class="mb-0 fw-bold text-dark">...</h2>
                            </div>
                            <div class="stat-icon bg-light text-primary p-3 rounded-circle d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                                <i class="fas fa-building fa-lg"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card bg-white p-4 rounded shadow-sm border-0" 
                         onclick="location.hash='/unit/staff/list'" 
                         style="cursor:pointer; border-left: 4px solid #10b981 !important; transition: transform 0.2s;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="text-uppercase text-muted fw-bold mb-2" style="font-size: 0.8rem;">人員總數</h6>
                                <h2 id="staff-count-display" class="mb-0 fw-bold text-dark">...</h2>
                            </div>
                            <div class="stat-icon bg-light text-success p-3 rounded-circle d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                                <i class="fas fa-user-nurse fa-lg"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stat-card bg-white p-4 rounded shadow-sm border-0" 
                         onclick="location.hash='/schedule/manual'" 
                         style="cursor:pointer; border-left: 4px solid #f59e0b !important; transition: transform 0.2s;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="text-uppercase text-muted fw-bold mb-2" style="font-size: 0.8rem;">排班狀態</h6>
                                <h4 id="schedule-status-display" class="mb-0 fw-bold text-dark" style="font-size: 1.2rem;">...</h4>
                            </div>
                            <div class="stat-icon bg-light text-warning p-3 rounded-circle d-flex align-items-center justify-content-center" style="width: 60px; height: 60px;">
                                <i class="fas fa-calendar-check fa-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row g-4">
                    <div class="col-lg-8">
                        <div class="card shadow-sm border-0 h-100">
                            <div class="card-header bg-white py-3 border-bottom">
                                <h5 class="m-0 font-weight-bold text-primary"><i class="fas fa-bullhorn me-2"></i>系統公告</h5>
                            </div>
                            <div class="card-body">
                                <div class="alert alert-info border-0 bg-info-subtle text-info-emphasis">
                                    <i class="fas fa-info-circle me-2"></i>歡迎使用新版 AI 排班系統。左側選單可快速切換功能。
                                </div>
                                <div class="list-group list-group-flush">
                                    <div class="list-group-item border-0 px-0">
                                        <div class="d-flex w-100 justify-content-between">
                                            <h6 class="mb-1 fw-bold">系統初始化完成</h6>
                                            <small class="text-muted">剛剛</small>
                                        </div>
                                        <p class="mb-1 small text-muted">目前系統運作正常，Firestore 連線成功。</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-4">
                        <div class="card shadow-sm border-0 h-100">
                            <div class="card-header bg-white py-3 border-bottom">
                                <h5 class="m-0 font-weight-bold text-warning"><i class="fas fa-bolt me-2"></i>快速操作</h5>
                            </div>
                            <div class="list-group list-group-flush">
                                <a href="#/system/units/create" class="list-group-item list-group-item-action py-3 d-flex align-items-center">
                                    <div class="bg-primary text-white rounded-circle me-3 d-flex align-items-center justify-content-center" style="width: 35px; height: 35px;">
                                        <i class="fas fa-plus"></i>
                                    </div>
                                    <div>
                                        <h6 class="mb-0 fw-bold">建立新單位</h6>
                                        <small class="text-muted">新增病房或部門</small>
                                    </div>
                                </a>
                                <a href="#/unit/staff/create" class="list-group-item list-group-item-action py-3 d-flex align-items-center">
                                    <div class="bg-success text-white rounded-circle me-3 d-flex align-items-center justify-content-center" style="width: 35px; height: 35px;">
                                        <i class="fas fa-user-plus"></i>
                                    </div>
                                    <div>
                                        <h6 class="mb-0 fw-bold">新增人員帳號</h6>
                                        <small class="text-muted">建立員工登入資料</small>
                                    </div>
                                </a>
                                <a href="#/system/settings" class="list-group-item list-group-item-action py-3 d-flex align-items-center">
                                    <div class="bg-secondary text-white rounded-circle me-3 d-flex align-items-center justify-content-center" style="width: 35px; height: 35px;">
                                        <i class="fas fa-cog"></i>
                                    </div>
                                    <div>
                                        <h6 class="mb-0 fw-bold">系統全域設定</h6>
                                        <small class="text-muted">調整系統參數</small>
                                    </div>
                                </a>
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
            // 1. 更新單位數
            const units = await UnitService.getAllUnits();
            const elUnit = document.getElementById('unit-count-display');
            if(elUnit) elUnit.textContent = units.length;
            
            // 2. 更新人員數
            const staffCount = await userService.getAllStaffCount();
            const elStaff = document.getElementById('staff-count-display');
            if(elStaff) elStaff.textContent = staffCount;

            // 3. 更新排班狀態 (依據角色)
            await this.updateScheduleStatus();

        } catch (e) {
            console.error("更新儀表板數據失敗:", e);
            document.getElementById('unit-count-display').textContent = "-";
            document.getElementById('staff-count-display').textContent = "-";
        }
    }

    async updateScheduleStatus() {
        const statusEl = document.getElementById('schedule-status-display');
        if (!statusEl) return;

        try {
            // 取得當前使用者的完整資料 (包含 role)
            const firebaseUser = authService.getCurrentUser();
            if (!firebaseUser) return;
            const user = await userService.getUserData(firebaseUser.uid);

            // 【邏輯修正】如果是系統管理員，不顯示個別單位狀態
            if (user.role === 'system_admin') {
                statusEl.textContent = "管理模式";
                statusEl.className = "mb-0 fw-bold text-primary"; // 覆蓋顏色
                return;
            }

            // 如果是一般使用者/單位管理者，且有綁定單位
            if (user.unitId) {
                const now = new Date();
                const schedule = await ScheduleService.getSchedule(
                    user.unitId, 
                    now.getFullYear(), 
                    now.getMonth() + 1
                );
                
                if (!schedule) {
                    statusEl.textContent = "未建立";
                    statusEl.className = "mb-0 fw-bold text-muted";
                } else if (schedule.status === 'published') {
                    statusEl.textContent = "已發布";
                    statusEl.className = "mb-0 fw-bold text-success";
                } else {
                    statusEl.textContent = "草稿中";
                    statusEl.className = "mb-0 fw-bold text-warning";
                }
            } else {
                statusEl.textContent = "無單位";
                statusEl.className = "mb-0 fw-bold text-secondary";
            }
        } catch (error) {
            console.error(error);
            statusEl.textContent = "讀取錯誤";
        }
    }
}
