import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitListPage {
    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-hospital"></i> 單位管理</h3>
                    <p class="text-muted small mb-0">檢視與管理系統內的所有護理單位。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center justify-content-end">
                        <button class="btn btn-primary text-nowrap" onclick="window.location.hash='/system/units/create'">
                            <i class="fas fa-plus"></i> 新增單位
                        </button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr><th>代碼</th><th>名稱</th><th>管理者數</th><th>排班者數</th><th class="text-end pe-3">操作</th></tr>
                                </thead>
                                <tbody id="tbody"><tr><td colspan="5" class="text-center py-5">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const units = await UnitService.getAllUnits();
        const tbody = document.getElementById('tbody');
        if(units.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">無單位</td></tr>'; return; }
        
        tbody.innerHTML = units.map(u => `
            <tr>
                <td class="fw-bold">${u.unitCode}</td>
                <td>${u.unitName}</td>
                <td><span class="badge bg-primary rounded-pill">${(u.managers||[]).length}</span></td>
                <td><span class="badge bg-info rounded-pill">${(u.schedulers||[]).length}</span></td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.location.hash='/system/units/edit/${u.id}'"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteUnit('${u.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        
        window.deleteUnit = async (id) => {
            if(confirm('刪除此單位？')) {
                await UnitService.deleteUnit(id);
                this.afterRender(); // Reload
            }
        };
    }
}
