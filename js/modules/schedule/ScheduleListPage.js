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
        // (省略重複的單位讀取邏輯，與其他頁面相同)
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
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-primary">可管理的班表 (近 6 個月)</h6>
                    </div>
                    <div class="card-body p-0">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light"><tr><th>月份</th><th>狀態</th><th>最後更新</th><th>操作</th></tr></thead>
                            <tbody id="schedule-list-tbody"><tr><td colspan="4" class="text-center py-5 text-muted">請先選擇單位</td></tr></tbody>
                        </table>
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr>';

        // 產生近 6 個月的清單 (包含未來 2 個月，過去 3 個月)
        const list = [];
        const today = new Date();
        for(let i = -3; i <= 2; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
        }
        list.reverse(); // 未來在上面

        // 平行讀取這 6 個月的 Schedule Status
        const rows = await Promise.all(list.map(async (item) => {
            const schedule = await ScheduleService.getSchedule(unitId, item.year, item.month);
            // 也讀取 PreSchedule 狀態作為參考
            const pre = await PreScheduleService.getPreSchedule(unitId, item.year, item.month);
            
            const status = schedule ? (schedule.status === 'published' ? '<span class="badge bg-success">已發布</span>' : '<span class="badge bg-warning text-dark">草稿</span>') 
                                    : '<span class="badge bg-secondary">未建立</span>';
            
            const lastUpdate = schedule ? new Date(schedule.updatedAt.toDate()).toLocaleString() : '-';
            const btnClass = schedule ? 'btn-primary' : 'btn-outline-primary';
            const btnText = schedule ? '進入排班' : '開始排班';

            return `
                <tr>
                    <td class="fw-bold">${item.year}-${String(item.month).padStart(2,'0')}</td>
                    <td>${status}</td>
                    <td><small class="text-muted">${lastUpdate}</small></td>
                    <td>
                        <button class="btn btn-sm ${btnClass}" 
                            onclick="window.location.hash='/schedule/edit?unitId=${unitId}&year=${item.year}&month=${item.month}'">
                            ${btnText}
                        </button>
                    </td>
                </tr>
            `;
        }));

        tbody.innerHTML = rows.join('');
    }
}
