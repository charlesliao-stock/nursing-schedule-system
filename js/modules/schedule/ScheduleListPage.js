import { UnitService } from "../../services/firebase/UnitService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { router } from "../../core/Router.js";

export class ScheduleListPage {
    constructor() {
        this.targetUnitId = null;
    }

    async render() {
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let unitOptions = '<option value="">請選擇...</option>';
        if (isAdmin) {
             const units = await UnitService.getAllUnits();
             unitOptions += units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
             const units = await UnitService.getUnitsByManager(user.uid);
             if(units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
             }
             unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        }

        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-calendar-alt"></i> 排班作業</h3></div>
                
                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <label class="fw-bold">選擇單位：</label>
                        <select id="schedule-unit-select" class="form-select w-auto">${unitOptions}</select>
                        <span class="text-muted small ms-2"><i class="fas fa-info-circle"></i> 列表資料來源：預班管理系統</span>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-primary">待排班月份清單</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>月份</th><th>預班狀態</th><th>排班狀態</th><th>最後更新</th><th>操作</th></tr></thead>
                                <tbody id="schedule-list-tbody"><tr><td colspan="5" class="text-center py-5 text-muted">請先選擇單位</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const select = document.getElementById('schedule-unit-select');
        select.addEventListener('change', () => this.loadSchedules(select.value));
        if(select.options.length > 1) { // 預設選第一個
             select.selectedIndex = 1; 
             this.loadSchedules(select.value); 
        }
    }

    async loadSchedules(unitId) {
        if(!unitId) return;
        this.targetUnitId = unitId;
        const tbody = document.getElementById('schedule-list-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> 資料同步中...</td></tr>';

        try {
            // ✅ 修改重點：改為讀取「預班列表」作為主清單，確保與預班管理一致
            const preSchedules = await PreScheduleService.getPreSchedulesList(unitId);

            if (preSchedules.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">目前沒有可用的預班表，請先至「預班管理」建立。</td></tr>';
                return;
            }

            // 平行讀取每個月份的「正式排班 (Schedule)」狀態
            const rows = await Promise.all(preSchedules.map(async (pre) => {
                const schedule = await ScheduleService.getSchedule(unitId, pre.year, pre.month);
                
                // 預班狀態顯示
                let preStatusBadge = '';
                if(pre.status === 'open') preStatusBadge = '<span class="badge bg-success">預班開放中</span>';
                else if(pre.status === 'closed') preStatusBadge = '<span class="badge bg-secondary">預班已截止</span>';
                else preStatusBadge = '<span class="badge bg-warning text-dark">準備中</span>';

                // 排班狀態顯示
                let schStatusBadge = '<span class="badge bg-light text-dark border">未排班</span>';
                let lastUpdate = '-';
                let btnText = '開始排班';
                let btnClass = 'btn-outline-primary';

                if (schedule) {
                    if(schedule.status === 'published') {
                        schStatusBadge = '<span class="badge bg-success">已發布</span>';
                        btnText = '檢視/修改';
                        btnClass = 'btn-primary';
                    } else {
                        schStatusBadge = '<span class="badge bg-warning text-dark">草稿中</span>';
                        btnText = '繼續排班';
                        btnClass = 'btn-primary';
                    }
                    if(schedule.updatedAt) {
                        lastUpdate = new Date(schedule.updatedAt.toDate()).toLocaleString();
                    }
                }

                return `
                    <tr>
                        <td class="fw-bold">${pre.year}-${String(pre.month).padStart(2,'0')}</td>
                        <td>${preStatusBadge}</td>
                        <td>${schStatusBadge}</td>
                        <td><small class="text-muted">${lastUpdate}</small></td>
                        <td>
                            <button class="btn btn-sm ${btnClass}" 
                                onclick="window.location.hash='/schedule/edit?unitId=${unitId}&year=${pre.year}&month=${pre.month}'">
                                <i class="fas fa-edit"></i> ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            }));

            tbody.innerHTML = rows.join('');

        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>';
        }
    }
}
