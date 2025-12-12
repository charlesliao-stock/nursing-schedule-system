import { UnitService } from "../../services/firebase/UnitService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ScheduleListPage {
    constructor() { this.targetUnitId = null; }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>排班作業</h3></div>
                
                <div class="card shadow-sm mb-3 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold text-nowrap">選擇單位：</label>
                        <select id="schedule-unit-select" class="form-select w-auto">
                            <option value="">載入中...</option>
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
                                        <th>月份</th><th>預班狀態</th><th>排班狀態</th><th>審核狀態</th><th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="schedule-list-tbody">
                                    <tr><td colspan="5" class="p-4 text-center text-muted">請先選擇單位</td></tr>
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
        const unitSelect = document.getElementById('schedule-unit-select');
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

        unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        // 3. 邏輯控制：只有一個單位時 Disable
        if (units.length === 1) {
            unitSelect.disabled = true;
            this.loadSchedules(units[0].unitId);
        } else {
            unitSelect.disabled = false;
            // 若有之前選過的或預設第一個
            this.loadSchedules(units[0].unitId);
        }

        // 4. 綁定事件
        unitSelect.addEventListener('change', (e) => {
            if (e.target.value) this.loadSchedules(e.target.value);
        });
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
                
                let preStatus = (now >= pre.settings.openDate && now <= pre.settings.closeDate) ? '<span class="badge bg-success">開放中</span>' :
                                (now > pre.settings.closeDate ? '<span class="badge bg-secondary">已截止</span>' : '<span class="badge bg-warning text-dark">未開放</span>');

                let approvedStatus = (now > pre.settings.closeDate || pre.status === 'closed') ? 
                                     '<span class="text-success fw-bold"><i class="fas fa-check-circle"></i> 審核通過</span>' : '<span class="text-muted">-</span>';

                let schStatus = '<span class="badge bg-light text-dark border">未開始</span>';
                let btnClass = 'btn-outline-primary', btnText = '開始排班';
                
                if (schedule) {
                    if (schedule.status === 'published') {
                        schStatus = '<span class="badge bg-success">已發布</span>';
                        btnClass = 'btn-primary'; btnText = '檢視';
                    } else {
                        schStatus = '<span class="badge bg-warning text-dark">草稿</span>';
                        btnText = '繼續排班';
                    }
                }

                return `
                    <tr>
                        <td class="fw-bold">${pre.year}-${String(pre.month).padStart(2,'0')}</td>
                        <td>${preStatus}</td><td>${schStatus}</td><td>${approvedStatus}</td>
                        <td><button class="btn btn-sm ${btnClass}" onclick="window.location.hash='/schedule/edit?unitId=${unitId}&year=${pre.year}&month=${pre.month}'">${btnText}</button></td>
                    </tr>`;
            }));
            tbody.innerHTML = rows.join('');
        } catch (error) { tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-danger">載入失敗</td></tr>'; }
    }
}
