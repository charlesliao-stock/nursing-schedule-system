import { UnitService } from "../../services/firebase/UnitService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() { 
        this.targetUnitId = null; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3><i class="fas fa-calendar-check text-primary me-2"></i>預班管理與審核</h3>
                </div>
                
                <div class="card shadow-sm mb-3 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold text-nowrap"><i class="fas fa-hospital-user me-1"></i>管理單位：</label>
                        <select id="pre-unit-select" class="form-select w-auto fw-bold text-primary">
                            <option value="">載入中...</option>
                        </select>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3 bg-white text-primary fw-bold">預班表月份清單</div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>月份</th>
                                        <th>開放填寫區間</th>
                                        <th>狀態</th>
                                        <th>提交進度</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="pre-list-tbody">
                                    <tr><td colspan="5" class="p-4 text-center text-muted">請先選擇上方單位以載入資料</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('pre-unit-select');
        // 判斷權限 (包含 system_admin 或 admin)
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        // 1. 取得可用單位列表
        let units = [];
        if (isAdmin) {
            units = await UnitService.getAllUnits();
        } else {
            units = await UnitService.getUnitsByManager(user.uid);
            // Fallback: 若非管理職但有綁定單位，加入該單位
            if (units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if (u) units.push(u);
            }
        }

        // 2. 渲染選單
        if (units.length === 0) {
            unitSelect.innerHTML = '<option value="">無權限</option>';
            unitSelect.disabled = true;
            return;
        }

        // 3. 根據角色設定預設選取行為
        if (isAdmin) {
            // 系統管理員：強制顯示 "請選擇"，不自動載入，避免誤操作
            unitSelect.innerHTML = '<option value="" disabled selected>請選擇管理單位...</option>' + 
                                   units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            unitSelect.disabled = false;
        } else {
            // 一般單位管理者
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            // 若只有一個單位，自動載入；若有多個，預設選第一個並載入
            if (units.length > 0) {
                this.loadSchedules(units[0].unitId);
            }
        }

        // 4. 綁定事件
        unitSelect.addEventListener('change', (e) => {
            if (e.target.value) this.loadSchedules(e.target.value);
        });
    }

    async loadSchedules(unitId) {
        this.targetUnitId = unitId;
        const tbody = document.getElementById('pre-list-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';

        try {
            const preSchedules = await PreScheduleService.getPreSchedulesList(unitId);

            if (preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">此單位尚無任何預班表紀錄</td></tr>';
                return;
            }

            const now = new Date().toISOString().split('T')[0];

            const rows = preSchedules.map(pre => {
                let statusBadge = '';
                let btnText = '管理 / 審核';
                let btnClass = 'btn-primary';

                if (now < pre.settings.openDate) {
                    statusBadge = '<span class="badge bg-secondary">未開放</span>';
                } else if (now >= pre.settings.openDate && now <= pre.settings.closeDate) {
                    statusBadge = '<span class="badge bg-success">開放中</span>';
                } else {
                    statusBadge = '<span class="badge bg-dark">已截止</span>';
                    btnText = '檢視'; 
                    btnClass = 'btn-outline-primary';
                }

                if (pre.status === 'closed') {
                    statusBadge = '<span class="badge bg-info text-dark">已封存</span>';
                }

                const total = pre.staffIds ? pre.staffIds.length : 0;
                const submitted = pre.submissions ? Object.values(pre.submissions).filter(s => s.isSubmitted).length : 0;
                const percent = total > 0 ? Math.round((submitted / total) * 100) : 0;

                return `
                    <tr>
                        <td class="fw-bold fs-5">${pre.year}年 ${pre.month}月</td>
                        <td>${pre.settings.openDate} ~ ${pre.settings.closeDate}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <div class="d-flex align-items-center" style="width: 150px;">
                                <div class="progress flex-grow-1 me-2" style="height: 6px;">
                                    <div class="progress-bar bg-info" style="width: ${percent}%"></div>
                                </div>
                                <span class="small text-muted">${submitted}/${total}</span>
                            </div>
                        </td>
                        <td>
                            <button class="btn btn-sm ${btnClass}" 
                                onclick="window.location.hash='/pre-schedule/edit?unitId=${unitId}&year=${pre.year}&month=${pre.month}'">
                                <i class="fas fa-edit"></i> ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows.join('');
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-danger">載入失敗: ' + error.message + '</td></tr>';
        }
    }
}
