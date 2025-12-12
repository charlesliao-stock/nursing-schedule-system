import { UnitService } from "../../services/firebase/UnitService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ScheduleListPage {
    constructor() { 
        this.targetUnitId = null; 
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>排班作業</h3></div>
                
                <div id="admin-unit-selector" class="card shadow-sm mb-3 border-left-warning" style="display:none;">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold text-dark"><i class="fas fa-user-secret"></i> 管理員操作：請選擇目標單位</label>
                        <select id="schedule-unit-select" class="form-select w-auto">
                            <option value="">(請選擇)</option>
                        </select>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3 bg-white text-primary fw-bold">待排班月份清單</div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>月份</th>
                                        <th>預班狀態</th>
                                        <th>排班狀態</th> 
                                        <th>審核狀態</th> 
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="schedule-list-tbody">
                                    <tr><td colspan="5" class="p-4 text-center text-muted">準備載入...</td></tr>
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
        
        // 判定是否為管理員 (包含正在模擬其他角色的管理員)
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        const tbody = document.getElementById('schedule-list-tbody');

        if (isAdmin) {
            // --- 管理員模式：顯示下拉選單並載入所有單位 ---
            document.getElementById('admin-unit-selector').style.display = 'block';
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-muted">請先從上方選擇單位</td></tr>';
            
            const unitSelect = document.getElementById('schedule-unit-select');
            const units = await UnitService.getAllUnits();
            
            unitSelect.innerHTML = `<option value="">請選擇單位...</option>` + 
                units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

            unitSelect.addEventListener('change', (e) => {
                const uid = e.target.value;
                if(uid) this.loadSchedules(uid);
                else tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-muted">請先選擇單位</td></tr>';
            });

            // 如果該管理員剛好也有綁定單位，預設選取它 (選填)
            if (user.unitId) {
                unitSelect.value = user.unitId;
                this.loadSchedules(user.unitId);
            }

        } else if (user.unitId) {
            // --- 一般主管模式：直接載入綁定單位 ---
            this.loadSchedules(user.unitId);
        } else {
            // --- 異常：無單位的普通帳號 ---
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-danger">您尚未綁定單位，無法檢視。</td></tr>';
        }
    }

    async loadSchedules(unitId) {
        this.targetUnitId = unitId;
        const tbody = document.getElementById('schedule-list-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';

        try {
            const preSchedules = await PreScheduleService.getPreSchedulesList(unitId);

            if (preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">此單位尚無預班表紀錄</td></tr>';
                return;
            }

            const now = new Date().toISOString().split('T')[0];

            const rows = await Promise.all(preSchedules.map(async (pre) => {
                const schedule = await ScheduleService.getSchedule(unitId, pre.year, pre.month);
                
                // 1. 預班狀態
                let preStatus = '';
                if (now >= pre.settings.openDate && now <= pre.settings.closeDate) preStatus = '<span class="badge bg-success">開放中</span>';
                else if (now > pre.settings.closeDate) preStatus = '<span class="badge bg-secondary">已截止</span>';
                else preStatus = '<span class="badge bg-warning text-dark">未開放</span>';

                // 2. 審核狀態
                let approvedStatus = '<span class="text-muted">-</span>';
                if (now > pre.settings.closeDate || pre.status === 'closed') {
                    approvedStatus = '<span class="text-success fw-bold"><i class="fas fa-check-circle"></i> 審核通過</span>';
                }

                // 3. 排班狀態
                let schStatus = '<span class="badge bg-light text-dark border">未開始</span>';
                let btnClass = 'btn-outline-primary';
                let btnText = '開始排班';
                
                if (schedule) {
                    if (schedule.status === 'published') {
                        schStatus = '<span class="badge bg-success">已發布</span>';
                        btnClass = 'btn-primary';
                        btnText = '檢視';
                    } else {
                        schStatus = '<span class="badge bg-warning text-dark">草稿</span>';
                        btnClass = 'btn-primary';
                        btnText = '繼續排班';
                    }
                }

                return `
                    <tr>
                        <td class="fw-bold">${pre.year}-${String(pre.month).padStart(2,'0')}</td>
                        <td>${preStatus}</td>
                        <td>${schStatus}</td>
                        <td>${approvedStatus}</td>
                        <td>
                            <button class="btn btn-sm ${btnClass}" 
                                onclick="window.location.hash='/schedule/edit?unitId=${unitId}&year=${pre.year}&month=${pre.month}'">
                                ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            }));

            tbody.innerHTML = rows.join('');
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-danger">載入失敗</td></tr>';
        }
    }
}
