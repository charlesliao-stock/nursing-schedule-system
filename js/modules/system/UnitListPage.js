import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitListPage {
    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800">
                        <i class="fas fa-hospital-user"></i> 單位管理
                    </h2>
                    <a href="#/system/units/create" class="btn btn-primary btn-sm shadow-sm">
                        <i class="fas fa-plus fa-sm text-white-50"></i> 新增單位
                    </a>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3">
                        <h6 class="m-0 font-weight-bold text-primary">護理站列表</h6>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover" id="unitsTable" width="100%" cellspacing="0">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 15%">代號</th>
                                        <th style="width: 25%">單位名稱</th>
                                        <th>描述</th>
                                        <th style="width: 10%" class="text-center">狀態</th>
                                        <th style="width: 15%" class="text-center">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="unitsTableBody">
                                    <tr><td colspan="5" class="text-center p-3">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        try {
            const units = await UnitService.getAllUnits();
            const tbody = document.getElementById('unitsTableBody');
            
            if (units.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center p-5 text-muted">目前尚未建立任何單位</td></tr>`;
                return;
            }

            tbody.innerHTML = units.map(unit => `
                <tr>
                    <td class="align-middle font-monospace fw-bold text-primary">${unit.unitCode}</td>
                    <td class="align-middle fw-bold">${unit.unitName}</td>
                    <td class="align-middle text-muted small">${unit.description || '-'}</td>
                    <td class="align-middle text-center">
                        <span class="badge ${unit.status === 'inactive' ? 'bg-secondary' : 'bg-success'}">
                            ${unit.status === 'inactive' ? '停用' : '運作中'}
                        </span>
                    </td>
                    <td class="align-middle text-center">
                        <button class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${unit.unitId}" title="編輯">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${unit.unitId}" data-name="${unit.unitName}" title="刪除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            // 綁定編輯按鈕
            document.querySelectorAll('.btn-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    router.navigate(`/system/units/edit/${id}`); // 假設 Router 支援參數，或使用 hash
                    // 如果 Router 不支援參數解析，可改用 window.location.hash
                    window.location.hash = `/system/units/edit/${id}`; 
                });
            });

            // 綁定刪除按鈕
            document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleDelete(e));
            });

        } catch (error) {
            console.error("載入單位失敗:", error);
            document.getElementById('unitsTableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger">載入失敗: ${error.message}</td></tr>`;
        }
    }

    async handleDelete(e) {
        const btn = e.currentTarget;
        const unitId = btn.dataset.id;
        const unitName = btn.dataset.name;

        if (confirm(`確定要刪除「${unitName}」嗎？\n此操作無法復原！`)) {
            try {
                // 按鈕 Loading 狀態
                const originalContent = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                const result = await UnitService.deleteUnit(unitId);
                
                if (result.success) {
                    // 重新載入 (或直接移除該行)
                    this.afterRender();
                } else {
                    alert('刪除失敗: ' + result.error);
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }
            } catch (error) {
                console.error(error);
                alert('發生錯誤');
            }
        }
    }
}
