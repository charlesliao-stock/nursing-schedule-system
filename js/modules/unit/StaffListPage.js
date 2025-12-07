import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
        this.selectedIds = new Set(); // 儲存被勾選的 ID
    }

    async render() {
        const units = await UnitService.getAllUnits();
        
        const unitMap = {};
        units.forEach(u => unitMap[u.unitId] = u.unitName);
        this.unitMap = unitMap;
        
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="main-content container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-users-cog"></i> 人員管理</h2>
                    <div>
                        <button id="import-btn" class="btn btn-secondary btn-sm me-2">
                            <i class="fas fa-file-import"></i> 匯入人員
                        </button>
                        <button id="add-staff-btn" class="btn btn-primary btn-sm">
                            <i class="fas fa-plus"></i> 新增人員
                        </button>
                        <button id="back-btn" class="btn btn-outline-secondary btn-sm ms-2">返回</button>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                            <h6 class="m-0 font-weight-bold text-primary">人員列表</h6>
                            
                            <div id="batch-actions" class="d-none align-items-center gap-2 bg-light p-1 rounded border">
                                <span class="small fw-bold ms-2">已選 <span id="selected-count">0</span> 人:</span>
                                
                                <select id="batch-unit-select" class="form-select form-select-sm d-inline-block w-auto">
                                    <option value="">選擇調動單位...</option>
                                    ${unitOptions}
                                </select>
                                <button id="btn-batch-move" class="btn btn-sm btn-info text-white">調動</button>
                                <div class="vr"></div>
                                <button id="btn-batch-delete" class="btn btn-sm btn-danger">刪除</button>
                            </div>
                        </div>
                        
                        <div class="d-flex align-items-center">
                            <label class="me-2 mb-0 small fw-bold">篩選單位：</label>
                            <select id="unit-filter" class="form-select form-select-sm" style="width:auto;">
                                <option value="">全部單位</option>
                                ${unitOptions}
                            </select>
                        </div>
                    </div>

                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover" id="staffTable" width="100%" cellspacing="0">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 40px;" class="text-center">
                                            <input type="checkbox" id="select-all" class="form-check-input">
                                        </th>
                                        <th style="width:10%">ID</th>
                                        <th style="width:15%">姓名</th>
                                        <th style="width:20%">Email</th>
                                        <th style="width:10%">職級</th>
                                        <th style="width:15%">單位</th>
                                        <th style="width:10%" class="text-center">管理者</th>
                                        <th style="width:10%" class="text-center">排班者</th>
                                        <th style="width:10%">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="staff-tbody">
                                    <tr><td colspan="9" class="text-center">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div id="staff-modal" class="modal fade" tabindex="-1" role="dialog">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">編輯人員</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <form id="staff-form">
                                    <input type="hidden" id="edit-id">
                                    
                                    <div class="mb-3">
                                        <label class="form-label">員工編號 (ID)</label>
                                        <input type="text" class="form-control" id="edit-staffId" disabled>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">姓名</label>
                                        <input type="text" class="form-control" id="edit-name" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Email</label>
                                        <input type="email" class="form-control" id="edit-email" disabled>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">職級</label>
                                        <select class="form-select" id="edit-level">
                                            <option value="N0">N0</option>
                                            <option value="N1">N1</option>
                                            <option value="N2">N2</option>
                                            <option value="N3">N3</option>
                                            <option value="N4">N4</option>
                                            <option value="AHN">副護理長</option>
                                            <option value="HN">護理長</option>
                                            <option value="NP">專科護理師</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">調動單位</label>
                                        <select class="form-select" id="edit-unit">
                                            ${unitOptions}
                                        </select>
                                    </div>
                                    
                                    <div class="card bg-light border-0 mb-3">
                                        <div class="card-body py-2">
                                            <h6 class="card-title small text-muted mb-2">權限設定</h6>
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" id="edit-is-manager">
                                                <label class="form-check-label fw-bold" for="edit-is-manager">
                                                    單位管理者 (Unit Manager)
                                                </label>
                                            </div>
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" id="edit-is-scheduler">
                                                <label class="form-check-label" for="edit-is-scheduler">
                                                    排班人員 (Scheduler)
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                                <button type="button" id="btn-save-edit" class="btn btn-primary">儲存變更</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="import-staff-modal" class="modal fade" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-lg" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title"><i class="fas fa-file-import"></i> 匯入人員資料</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p class="text-muted">請上傳 CSV 檔案。<strong>若單位代號不存在，系統將自動建立該單位。若員工編號重複則會略過。</strong></p>
                                
                                <div class="alert alert-info small">
                                    <strong>CSV 格式說明：</strong><br>
                                    第一列必須為標題：<code>staffId,name,email,password,level,unitCode,isManager,isScheduler</code>
                                </div>

                                <div class="bg-light p-2 mb-3 border rounded overflow-auto" style="max-height: 100px;">
                                    <pre class="mb-0 small">staffId,name,email,password,level,unitCode,isManager,isScheduler
N001,王小美,may@test.com,123456,N2,9B,0,0
N002,陳護理長,hn@test.com,123456,HN,9B,1,1
N003,李排班,lee@test.com,123456,N3,ICU,0,1</pre>
                                </div>
                                
                                <div class="mb-3">
                                    <button id="dl-staff-template" class="btn btn-sm btn-outline-primary">
                                        <i class="fas fa-download"></i> 下載 CSV 範例檔
                                    </button>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">選擇檔案</label>
                                    <input type="file" id="staff-csv-file" accept=".csv" class="form-control">
                                </div>
                                
                                <div id="staff-import-result" class="mt-3 border rounded p-2 bg-white" style="display:none; max-height:150px; overflow-y:auto; font-size:0.9em;"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                                <button type="button" id="start-staff-import" class="btn btn-primary">開始匯入</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const modalEl = document.getElementById('staff-modal');
        const editModal = new bootstrap.Modal(modalEl);
        
        const importModalEl = document.getElementById('import-staff-modal');
        const importModal = new bootstrap.Modal(importModalEl);

        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('add-staff-btn').addEventListener('click', () => router.navigate('/unit/staff/create'));
        document.getElementById('import-btn').addEventListener('click', () => importModal.show());

        const tbody = document.getElementById('staff-tbody');
        const unitFilter = document.getElementById('unit-filter');
        
        // 批次操作 UI
        const batchToolbar = document.getElementById('batch-actions');
        const selectAllCheckbox = document.getElementById('select-all');
        const countSpan = document.getElementById('selected-count');

        // 更新批次工具列狀態
        const updateBatchUI = () => {
            const count = this.selectedIds.size;
            countSpan.textContent = count;
            if (count > 0) {
                batchToolbar.classList.remove('d-none');
                batchToolbar.classList.add('d-flex');
            } else {
                batchToolbar.classList.add('d-none');
                batchToolbar.classList.remove('d-flex');
            }
        };

        // 載入人員列表
        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3">載入中...</td></tr>';
            this.selectedIds.clear(); // 清空選取
            updateBatchUI();
            selectAllCheckbox.checked = false;

            try {
                let staff = [];
                if (unitId) {
                    staff = await userService.getUnitStaff(unitId);
                } else {
                    staff = await userService.getAllStaff();
                }
                this.staffList = staff;
                this.renderTable();
            } catch (error) {
                console.error(error);
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">載入失敗</td></tr>';
            }
        };

        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        this.renderTable = () => {
            if (this.staffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3 text-muted">無資料</td></tr>';
                return;
            }
            tbody.innerHTML = this.staffList.map(s => {
                const isManager = s.permissions?.canManageUnit || s.role === 'unit_manager';
                const isScheduler = s.permissions?.canEditSchedule || s.role === 'unit_scheduler';
                return `
                <tr>
                    <td class="text-center align-middle">
                        <input type="checkbox" class="form-check-input row-select" value="${s.id}">
                    </td>
                    <td class="align-middle font-monospace">${s.staffId || '-'}</td>
                    <td class="align-middle fw-bold">${s.name}</td>
                    <td class="align-middle small text-muted">${s.email}</td>
                    <td class="align-middle">${s.level || 'N0'}</td>
                    <td class="align-middle"><span class="badge bg-light text-dark border">${this.unitMap[s.unitId] || s.unitId}</span></td>
                    <td class="align-middle text-center">${isManager ? '<i class="fas fa-check-circle text-success"></i>' : '-'}</td>
                    <td class="align-middle text-center">${isScheduler ? '<i class="fas fa-check-circle text-primary"></i>' : '-'}</td>
                    <td class="align-middle">
                        <button class="btn btn-sm btn-outline-primary edit-btn me-1" data-id="${s.id}" title="編輯">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${s.id}" title="刪除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `}).join('');
        };

        // --- 事件綁定 ---

        // 1. 全選/取消全選
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) this.selectedIds.add(cb.value);
                else this.selectedIds.delete(cb.value);
            });
            updateBatchUI();
        });

        // 2. 單選 Checkbox
        tbody.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-select')) {
                const id = e.target.value;
                if (e.target.checked) this.selectedIds.add(id);
                else this.selectedIds.delete(id);
                updateBatchUI();
            }
        });

        // 3. 批次刪除
        document.getElementById('btn-batch-delete').addEventListener('click', async () => {
            if (this.selectedIds.size === 0) return;
            if (confirm(`確定要刪除選取的 ${this.selectedIds.size} 位人員嗎？\n注意：這不會刪除 Auth 帳號，僅刪除資料庫記錄。`)) {
                const ids = Array.from(this.selectedIds);
                const res = await userService.batchDeleteStaff(ids);
                if (res.success) {
                    alert('刪除成功');
                    loadStaff(unitFilter.value);
                } else {
                    alert('刪除失敗: ' + res.error);
                }
            }
        });

        // 4. 批次調動
        document.getElementById('btn-batch-move').addEventListener('click', async () => {
            const targetUnitId = document.getElementById('batch-unit-select').value;
            if (!targetUnitId) return alert('請先選擇要調動到的單位');
            if (this.selectedIds.size === 0) return;

            if (confirm(`確定要將選取的 ${this.selectedIds.size} 位人員調動至該單位嗎？`)) {
                const ids = Array.from(this.selectedIds);
                const res = await userService.batchUpdateUnit(ids, targetUnitId);
                if (res.success) {
                    alert('調動成功');
                    loadStaff(unitFilter.value);
                } else {
                    alert('調動失敗: ' + res.error);
                }
            }
        });

        // 5. 單筆操作 (編輯/刪除)
        tbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            
            if (btn.classList.contains('delete-btn')) {
                if (confirm('確定刪除此人員？')) {
                    const result = await userService.deleteStaff(id);
                    if (result.success) loadStaff(unitFilter.value);
                    else alert('刪除失敗：' + result.error);
                }
            } else if (btn.classList.contains('edit-btn')) {
                const staff = this.staffList.find(s => s.id === id);
                if (!staff) return;

                document.getElementById('edit-id').value = staff.id;
                document.getElementById('edit-staffId').value = staff.staffId || '';
                document.getElementById('edit-name').value = staff.name;
                document.getElementById('edit-email').value = staff.email;
                document.getElementById('edit-level').value = staff.level || 'N0';
                document.getElementById('edit-unit').value = staff.unitId;
                
                document.getElementById('edit-is-manager').checked = !!(staff.permissions?.canManageUnit);
                document.getElementById('edit-is-scheduler').checked = !!(staff.permissions?.canEditSchedule);
                
                editModal.show();
            }
        });

        // 6. 儲存編輯
        document.getElementById('btn-save-edit').addEventListener('click', async () => {
            // ... (保持原樣) ...
            const id = document.getElementById('edit-id').value;
            const unitId = document.getElementById('edit-unit').value;
            const isManager = document.getElementById('edit-is-manager').checked;
            const isScheduler = document.getElementById('edit-is-scheduler').checked;
            
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: unitId
            };
            
            await userService.updateStaff(id, updateData);
            await userService.toggleUnitManager(id, unitId, isManager);
            await userService.toggleUnitScheduler(id, unitId, isScheduler);

            editModal.hide();
            alert('更新成功');
            loadStaff(unitFilter.value);
        });
        
        // 7. 匯入相關邏輯
        document.getElementById('dl-staff-template').addEventListener('click', () => {
            const csvContent = "staffId,name,email,password,level,unitCode,isManager,isScheduler\nN001,王小美,may@test.com,123456,N2,9B,0,0\nN002,陳護理長,hn@test.com,123456,HN,9B,1,1";
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "staff_import_template.csv";
            link.click();
        });

        document.getElementById('start-staff-import').addEventListener('click', async () => {
             const fileInput = document.getElementById('staff-csv-file');
             const resultDiv = document.getElementById('staff-import-result');
             const btn = document.getElementById('start-staff-import');

             if (!fileInput.files.length) { alert('請選擇檔案'); return; }
             
             btn.disabled = true;
             btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 匯入中...';
             resultDiv.style.display = 'block';
             resultDiv.innerHTML = '<div class="text-primary"><i class="fas fa-circle-notch fa-spin"></i> 正在讀取並建立帳號，請稍候... (建立 Auth 需要時間)</div>';

             const file = fileInput.files[0];
             const reader = new FileReader();
             
             reader.onload = async (e) => {
                 try {
                     const text = e.target.result;
                     const rows = text.split('\n').map(row => row.trim()).filter(row => row);
                     rows.shift(); // 移除標題
                     
                     const staffData = rows.map(row => {
                         const cols = row.split(',');
                         return {
                             staffId: cols[0]?.trim(),
                             name: cols[1]?.trim(),
                             email: cols[2]?.trim(),
                             password: cols[3]?.trim(),
                             level: cols[4]?.trim(),
                             unitCode: cols[5]?.trim(),
                             isManager: cols[6]?.trim() === '1' || cols[6]?.trim().toLowerCase() === 'true',
                             isScheduler: cols[7]?.trim() === '1' || cols[7]?.trim().toLowerCase() === 'true'
                         };
                     });

                     const result = await userService.importStaff(staffData);
                     
                     if (result.failed === 0) {
                         resultDiv.innerHTML = `<div class="text-success fw-bold"><i class="fas fa-check-circle"></i> 成功匯入 ${result.success} 筆人員！</div>`;
                         alert(`成功匯入 ${result.success} 筆人員！`);
                         setTimeout(() => { importModal.hide(); loadStaff(unitFilter.value); }, 1500);
                     } else {
                         let errorHtml = `<div class="mb-2"><strong>匯入結果：</strong> <span class="text-success">成功 ${result.success}</span> / <span class="text-danger">失敗 ${result.failed}</span></div>`;
                         errorHtml += `<ul class="list-group list-group-flush small">`;
                         result.errors.forEach(err => errorHtml += `<li class="list-group-item list-group-item-danger py-1">${err}</li>`);
                         errorHtml += `</ul>`;
                         resultDiv.innerHTML = errorHtml;
                     }
                 } catch (error) {
                     resultDiv.innerHTML = `<div class="text-danger">處理失敗: ${error.message}</div>`;
                 } finally {
                     btn.disabled = false;
                     btn.innerHTML = '開始匯入';
                 }
             };
             reader.readAsText(file);
        });

        loadStaff("");
    }
}
