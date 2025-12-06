import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
    }

    async render() {
        // 取得所有單位，用於篩選與對照名稱
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
                        <h6 class="m-0 font-weight-bold text-primary">人員列表</h6>
                        
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
                                    <tr><td colspan="8" class="text-center">載入中...</td></tr>
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
                                <p class="text-muted">請上傳 CSV 檔案。<strong>請確保包含密碼欄位以便建立帳號。</strong></p>
                                
                                <div class="alert alert-info small">
                                    <strong>CSV 格式說明：</strong><br>
                                    第一列必須為標題：<code>staffId,name,email,password,level,unitCode,isManager,isScheduler</code>
                                </div>

                                <div class="bg-light p-2 mb-3 border rounded overflow-auto" style="max-height: 100px;">
                                    <pre class="mb-0 small">staffId,name,email,password,level,unitCode,isManager,isScheduler
N001,王小美,may@test.com,123456,N2,9B,0,0
N002,陳護理長,hn@test.com,123456,HN,9B,1,1
N003,李排班,lee@test.com,123456,N3,9B,0,1</pre>
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

        // 載入人員列表函式
        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-3">載入中...</td></tr>';
            let staff = [];
            
            try {
                if (unitId) {
                    staff = await userService.getUnitStaff(unitId);
                } else {
                    staff = await userService.getAllStaff();
                }
                this.staffList = staff;
                this.renderTable();
            } catch (error) {
                console.error(error);
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">載入失敗</td></tr>';
            }
        };

        // 篩選變更事件
        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        // 渲染表格函式
        this.renderTable = () => {
            const tbody = document.getElementById('staff-tbody');
            if (this.staffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center p-3 text-muted">無資料</td></tr>';
                return;
            }
            tbody.innerHTML = this.staffList.map(s => {
                const isManager = s.permissions?.canManageUnit || s.role === 'unit_manager';
                const isScheduler = s.permissions?.canEditSchedule || s.role === 'unit_scheduler';
                return `
                <tr>
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

        // 表格點擊事件 (編輯/刪除)
        tbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            
            if (btn.classList.contains('delete-btn')) {
                if (confirm('確定刪除此人員？\n注意：這不會刪除 Authentication 帳號，但會移除資料庫記錄。')) {
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
                
                // 設定 checkbox
                document.getElementById('edit-is-manager').checked = !!(staff.permissions?.canManageUnit);
                document.getElementById('edit-is-scheduler').checked = !!(staff.permissions?.canEditSchedule);
                
                editModal.show();
            }
        });

        // 儲存編輯
        document.getElementById('btn-save-edit').addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-edit');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '儲存中...';

            const id = document.getElementById('edit-id').value;
            const unitId = document.getElementById('edit-unit').value;
            const isManager = document.getElementById('edit-is-manager').checked;
            const isScheduler = document.getElementById('edit-is-scheduler').checked;
            
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: unitId
            };
            
            try {
                // 1. 更新基本資料
                await userService.updateStaff(id, updateData);
                // 2. 更新管理者權限
                await userService.toggleUnitManager(id, unitId, isManager);
                // 3. 更新排班者權限
                await userService.toggleUnitScheduler(id, unitId, isScheduler);

                editModal.hide();
                alert('資料更新成功');
                loadStaff(unitFilter.value);

            } catch (error) {
                console.error(error);
                alert('更新失敗');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
        
        // --- 匯入相關邏輯 ---

        // 下載範例檔
        document.getElementById('dl-staff-template').addEventListener('click', () => {
            const csvContent = "staffId,name,email,password,level,unitCode,isManager,isScheduler\nN001,王小美,may@test.com,123456,N2,9B,0,0\nN002,陳護理長,hn@test.com,123456,HN,9B,1,1";
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "staff_import_template.csv";
            link.click();
        });

        // 開始匯入
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
                     
                     // 移除標題列
                     const headers = rows.shift(); 
                     
                     const staffData = rows.map(row => {
                         // 簡單 CSV 解析
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

                     // 呼叫 UserService 進行批次匯入
                     const result = await userService.importStaff(staffData);
                     
                     if (result.failed === 0) {
                         resultDiv.innerHTML = `<div class="text-success fw-bold"><i class="fas fa-check-circle"></i> 成功匯入 ${result.success} 筆人員！</div>`;
                         alert(`成功匯入 ${result.success} 筆人員！`);
                         
                         setTimeout(() => {
                            importModal.hide();
                            // 觸發重新載入
                            const currentUnit = unitFilter.value;
                            loadStaff(currentUnit);
                         }, 1500);
                     } else {
                         let errorHtml = `<div class="mb-2"><strong>匯入結果：</strong> <span class="text-success">成功 ${result.success}</span> / <span class="text-danger">失敗 ${result.failed}</span></div>`;
                         errorHtml += `<ul class="list-group list-group-flush small">`;
                         result.errors.forEach(err => errorHtml += `<li class="list-group-item list-group-item-danger py-1">${err}</li>`);
                         errorHtml += `</ul>`;
                         resultDiv.innerHTML = errorHtml;
                     }
                 } catch (error) {
                     console.error(error);
                     resultDiv.innerHTML = `<div class="text-danger">處理失敗: ${error.message}</div>`;
                 } finally {
                     btn.disabled = false;
                     btn.innerHTML = '開始匯入';
                 }
             };
             reader.readAsText(file);
        });

        // 初始載入
        loadStaff("");
    }
}
