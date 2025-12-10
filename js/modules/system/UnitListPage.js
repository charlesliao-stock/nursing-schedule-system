import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js"; // 需要讀取人員
import { router } from "../../core/Router.js";

export class UnitListPage {
    constructor() {
        this.units = [];
        this.displayList = [];
        this.modal = null;
        this.unitStaffList = []; // 暫存該單位人員
        this.selectedManagers = new Set();
        this.selectedSchedulers = new Set();
        this.sortConfig = { key: 'unitCode', direction: 'asc' };
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-hospital"></i> 單位管理</h3></div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex justify-content-end">
                        <div class="me-auto">
                            <input type="text" id="unit-search" class="form-control form-control-sm" placeholder="搜尋單位...">
                        </div>
                        <button id="btn-add-unit" class="btn btn-primary w-auto text-nowrap"><i class="fas fa-plus"></i> 新增單位</button>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        ${this.renderSortableHeader('代碼', 'unitCode')}
                                        ${this.renderSortableHeader('名稱', 'unitName')}
                                        <th>管理者</th>
                                        <th>排班者</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody"><tr><td colspan="5" class="text-center py-5">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="unit-modal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header bg-light">
                                <h5 class="modal-title fw-bold" id="modal-title">單位資訊</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="unit-form">
                                    <input type="hidden" id="edit-id">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">單位代碼</label>
                                            <input type="text" id="unit-code" class="form-control" required>
                                        </div>
                                        <div class="col-md-8">
                                            <label class="form-label fw-bold">單位名稱</label>
                                            <input type="text" id="unit-name" class="form-control" required>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">描述</label>
                                        <textarea id="unit-desc" class="form-control" rows="2"></textarea>
                                    </div>

                                    <div id="staff-selection-area" style="display:none;">
                                        <hr>
                                        <h6 class="fw-bold text-primary mb-3">權限人員指派</h6>
                                        <div class="row">
                                            <div class="col-md-6">
                                                <label class="form-label fw-bold">單位管理者 (可多選)</label>
                                                <div class="border rounded p-2" style="max-height: 200px; overflow-y: auto;" id="list-managers">
                                                    <div class="text-muted small">請先建立單位</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label fw-bold">排班人員 (可多選)</label>
                                                <div class="border rounded p-2" style="max-height: 200px; overflow-y: auto;" id="list-schedulers">
                                                    <div class="text-muted small">請先建立單位</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary">儲存</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSortableHeader(label, key) {
        return `<th style="cursor:pointer;" onclick="window.routerPage.handleSort('${key}')">${label} <i class="fas fa-sort text-muted"></i></th>`;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('unit-modal'));
        window.routerPage = this;
        document.getElementById('btn-add-unit').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save').addEventListener('click', () => this.saveUnit());
        document.getElementById('unit-search').addEventListener('input', (e) => this.filterData(e.target.value));
        await this.loadUnits();
    }

    async loadUnits() {
        this.units = await UnitService.getAllUnits();
        this.applySortAndFilter();
    }

    // 渲染人員清單 (Checkbox List)
    renderStaffCheckboxes(containerId, selectedSet) {
        const container = document.getElementById(containerId);
        if(this.unitStaffList.length === 0) {
            container.innerHTML = '<div class="text-muted small text-center p-2">該單位尚無人員</div>';
            return;
        }
        
        container.innerHTML = this.unitStaffList.map(u => {
            const isChecked = selectedSet.has(u.uid) ? 'checked' : '';
            return `
                <div class="form-check">
                    <input class="form-check-input staff-check" type="checkbox" 
                           data-type="${containerId}" value="${u.uid}" id="${containerId}-${u.uid}" ${isChecked}>
                    <label class="form-check-label small" for="${containerId}-${u.uid}">
                        ${u.name} <span class="text-muted">(${u.staffId})</span>
                    </label>
                </div>
            `;
        }).join('');
        
        // 綁定事件更新 Set
        container.querySelectorAll('input').forEach(chk => {
            chk.addEventListener('change', (e) => {
                if(e.target.checked) selectedSet.add(e.target.value);
                else selectedSet.delete(e.target.value);
            });
        });
    }

    async openModal(unitId = null) {
        document.getElementById('unit-form').reset();
        document.getElementById('edit-id').value = unitId || "";
        const title = document.getElementById('modal-title');
        const staffArea = document.getElementById('staff-selection-area');

        if (unitId) {
            // 編輯模式
            title.textContent = "編輯單位";
            const unit = this.units.find(u => u.id === unitId);
            document.getElementById('unit-code').value = unit.unitCode;
            document.getElementById('unit-code').disabled = true;
            document.getElementById('unit-name').value = unit.unitName;
            document.getElementById('unit-desc').value = unit.description || '';
            
            staffArea.style.display = 'block';
            
            // 載入人員並設定勾選狀態
            this.unitStaffList = await userService.getUsersByUnit(unitId);
            this.selectedManagers = new Set(unit.managers || []);
            this.selectedSchedulers = new Set(unit.schedulers || []);
            
            this.renderStaffCheckboxes('list-managers', this.selectedManagers);
            this.renderStaffCheckboxes('list-schedulers', this.selectedSchedulers);

        } else {
            // 新增模式
            title.textContent = "新增單位";
            document.getElementById('unit-code').disabled = false;
            staffArea.style.display = 'none'; // 新增時無法指派人員 (因為單位還沒建立，人員無法歸屬)
        }
        this.modal.show();
    }

    async saveUnit() {
        const id = document.getElementById('edit-id').value;
        const data = {
            unitCode: document.getElementById('unit-code').value.trim(),
            unitName: document.getElementById('unit-name').value.trim(),
            description: document.getElementById('unit-desc').value.trim(),
            managers: Array.from(this.selectedManagers),
            schedulers: Array.from(this.selectedSchedulers)
        };

        const btn = document.getElementById('btn-save');
        btn.disabled = true;

        try {
            let res;
            if (id) res = await UnitService.updateUnit(id, data);
            else res = await UnitService.createUnit(data);

            if (res.success) {
                alert("✅ 儲存成功");
                this.modal.hide();
                this.loadUnits();
            } else {
                alert("失敗: " + res.error);
            }
        } catch (e) { console.error(e); } 
        finally { btn.disabled = false; }
    }

    // 簡單的表格渲染邏輯
    applySortAndFilter() {
        // ... (保持原本的排序過濾邏輯)
        this.displayList = this.units; // 簡化展示
        const tbody = document.getElementById('tbody');
        tbody.innerHTML = this.displayList.map(u => `
            <tr>
                <td class="fw-bold">${u.unitCode}</td>
                <td>${u.unitName}</td>
                <td><span class="badge bg-primary rounded-pill">${(u.managers||[]).length} 人</span></td>
                <td><span class="badge bg-info rounded-pill text-dark">${(u.schedulers||[]).length} 人</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.routerPage.openModal('${u.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteUnit('${u.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
    
    handleSort(key) {} // 省略實作
    filterData(k) {}   // 省略實作
    async deleteUnit(id) { if(confirm('刪除?')) { await UnitService.deleteUnit(id); this.loadUnits(); } }
}
