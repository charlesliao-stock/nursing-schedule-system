export const DashboardTemplate = {
    // 1. 系統管理員視圖
    renderAdmin() {
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
    },

    // 2. 單位主管視圖
    renderManager() {
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
    },

    // 3. 一般使用者視圖
    renderUser(unitId) {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 text-gray-800">個人儀表板</h2>
                    <span class="badge bg-info">${unitId || '無單位'}</span>
                </div>

                <div class="row">
                    <div class="col-xl-3 col-md-6 mb-4">
                        <div class="card border-left-primary shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">下次上班</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800" id="next-shift">載入中...</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-calendar fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/pre-schedule/submit'" style="cursor:pointer;">
                        <div class="card border-left-success shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-success text-uppercase mb-1">本月預班</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800">前往提交</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-edit fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-xl-3 col-md-6 mb-4" onclick="location.hash='/swaps/apply'" style="cursor:pointer;">
                        <div class="card border-left-warning shadow h-100 py-2">
                            <div class="card-body">
                                <div class="row no-gutters align-items-center">
                                    <div class="col mr-2">
                                        <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">換班申請</div>
                                        <div class="h5 mb-0 font-weight-bold text-gray-800">發起/查詢</div>
                                    </div>
                                    <div class="col-auto"><i class="fas fa-exchange-alt fa-2x text-gray-300"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3">
                        <h6 class="m-0 font-weight-bold text-primary">公告事項</h6>
                    </div>
                    <div class="card-body">
                        <p>歡迎使用新版排班系統。請確認您的個人資料與班別需求。</p>
                    </div>
                </div>
            </div>
        `;
    }
};
