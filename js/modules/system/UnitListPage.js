import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitListPage {
    constructor() {
        this.units = [];
        this.displayList = [];
        this.modal = null;
        // 預設排序：依代碼 (unitCode) 升冪
        this.sortConfig = { key: 'unitCode', direction: 'asc' };
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-hospital"></i> 單位管理</h3>
                    <p class="text-muted small mb-0">檢視與管理系統內的所有護理單位。</p>
                </div>

                <div class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex justify-content-end">
                        <div class="me-auto">
                            <input type="text" id="unit-search" class="form-control form-control-sm" placeholder="搜尋單位名稱/代碼...">
                        </div>
                        
                        <button id="btn-add-unit" class="btn btn-primary w-auto text-nowrap">
                            <i class="fas fa-plus"></i> 新增單位
                        </button>
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
                                        <th>管理者數</th>
                                        <th>排班者數</th>
                                        <th class="text-end pe-3">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="tbody">
                                    <tr><td colspan="5" class="text-center py-5">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="unit-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title fw-bold" id="modal-title">新增單位</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="unit-form">
                                    <input type="hidden" id="edit-id">
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">單位代碼 (Code)</label>
                                        <input type="text" id="unit-code" class="form-control" placeholder="例如: 9B" required>
                                        <div class="form-text small">代碼設定後不可修改</div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">單位名稱</label>
                                        <input type="text" id="unit-name" class="form-control" placeholder="例如: 9B病房" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label fw-bold">描述</label>
                                        <textarea id="unit-desc" class="form-control" rows="3"></textarea>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary w-auto" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save" class="btn btn-primary w-auto">儲存</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSortableHeader(label, key) {
        const isActive = this.sortConfig.key === key;
        const icon = isActive 
            ? (this.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>')
            : '<i class="fas fa-sort text-muted opacity-25"></i>';
        
        return `
            <th class="sortable-th" style="cursor:pointer; user-select:none;" onclick="window.routerPage.handleSort('${key}')">
                <div class="d-flex align-items-center gap-1">
                    ${label} ${icon}
                </div>
            </th>
        `;
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('unit-modal'));
        
        // 綁定全域事件 (給 onclick 使用)
        window.routerPage = this;

        // 綁定按鈕
        document.getElementById('btn-add-unit').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save').addEventListener('click', () => this.saveUnit());
        
        // 綁定搜尋
        document.getElementById('unit-search').addEventListener('input', (e) => this.filterData(e.target.value));

        await this.loadUnits();
    }

    async loadUnits() {
        try {
            this.units = await UnitService.getAllUnits();
            this.applySortAndFilter();
        } catch (e) {
            console.error(e);
            document.getElementById('tbody').innerHTML = `<tr><td colspan="5" class="text-center text-danger">載入失敗</td></tr>`;
        }
    }

    // 排序處理
    handleSort(key) {
        if (this.sortConfig.key === key) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.key = key;
            this.sortConfig.direction = 'asc';
        }
        // 重新渲染整個表格 (包含表頭 icon)
        // 這裡重新呼叫 render 不太好效能，我們只重繪 table body 和 更新 header icon
        // 簡單做法：重新 renderTable，並手動更新 Header Icon Class (略微複雜)
        // 為了簡單，我們直接重新執行 applySortAndFilter，並在 renderTable 時更新 HTML
        // 但因為 renderSortableHeader 是在 render() 執行的，所以需要重新整理頁面或動態更新 header
        // 這裡採用動態更新 Header 的方式：
        this.updateHeaderIcons();
        this.applySortAndFilter();
    }

    updateHeaderIcons() {
        document.querySelectorAll('.sortable-th').forEach(th => {
            // 透過 onclick 字串反推 key (簡單暴力)
            const keyMatch = th.getAttribute('onclick').match(/'([^']+)'/);
            if (!keyMatch) return;
            const key = keyMatch[1];
            
            const iconContainer = th.querySelector('i');
            if (iconContainer) iconContainer.className = 'fas fa-sort text-muted opacity-25'; // 重置

            if (this.sortConfig.key === key) {
                if (iconContainer) {
                    iconContainer.className = this.sortConfig.direction === 'asc' 
                        ? 'fas fa-sort-up' 
                        : 'fas fa-sort-down';
                    iconContainer.classList.remove('text-muted', 'opacity-25');
                }
            }
        });
    }

    applySortAndFilter() {
        const keyword = document.getElementById('unit-search').value.toLowerCase();
        
        // 1. 搜尋
        let filtered = this.units;
        if (keyword) {
            filtered = this.units.filter(u => 
                (u.unitName && u.unitName.toLowerCase().includes(keyword)) ||
                (u.unitCode && u.unitCode.toLowerCase().includes(keyword))
            );
        }

        // 2. 排序
        const key = this.sortConfig.key;
        const dir = this.sortConfig.direction === 'asc' ? 1 : -1;

        filtered.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            // 數字與字串混合處理
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            
            if (!isNaN(numA) && !isNaN(numB) && String(numA) === String(valA)) {
                return (numA - numB) * dir;
            }
            
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        this.displayList = filtered;
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('tbody');
        if (this.displayList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">無符合資料</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.displayList.map(u => `
            <tr>
                <td class="fw-bold">${u.unitCode}</td>
                <td>${u.unitName}</td>
                <td><span class="badge bg-primary rounded-pill">${(u.managers||[]).length}</span></td>
                <td><span class="badge bg-info rounded-pill text-dark">${(u.schedulers||[]).length}</span></td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.location.hash='/system/units/edit/${u.id}'"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deleteUnit('${u.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    openModal() {
        document.getElementById('unit-form').reset();
        document.getElementById('edit-id').value = ""; // 新增模式
        document.getElementById('modal-title').textContent = "新增單位";
        document.getElementById('unit-code').disabled = false;
        this.modal.show();
    }

    async saveUnit() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const data = {
            unitCode: document.getElementById('unit-code').value.trim(),
            unitName: document.getElementById('unit-name').value.trim(),
            description: document.getElementById('unit-desc').value.trim()
        };

        if (!data.unitCode || !data.unitName) {
            alert("代碼與名稱為必填");
            btn.disabled = false; 
            btn.innerHTML = '儲存';
            return;
        }

        try {
            // 目前只有新增功能使用 Modal，編輯仍維持跳轉頁面 (為了保留複雜的權限設定 UI)
            // 若要編輯也改 Modal，需將 UnitEditPage 邏輯搬過來
            const res = await UnitService.createUnit(data);
            
            if (res.success) {
                alert("✅ 單位建立成功");
                this.modal.hide();
                this.loadUnits(); // 重整列表
            } else {
                alert("建立失敗: " + res.error);
            }
        } catch (e) {
            console.error(e);
            alert("系統錯誤");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '儲存';
        }
    }

    async deleteUnit(id) {
        if (confirm('確定刪除此單位？(請確認無人員綁定)')) {
            await UnitService.deleteUnit(id);
            this.loadUnits();
        }
    }
    
    // 讓搜尋框使用
    filterData(keyword) {
        this.applySortAndFilter();
    }
}
