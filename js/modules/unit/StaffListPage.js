import { userService } from "../../services/firebase/UserService.js";
// 【修正 1】改為匯入 UnitService (大寫 Class)
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
    }

    async render() {
        // 【修正 2】改為呼叫靜態方法 UnitService.getAllUnits()
        const units = await UnitService.getAllUnits();
        
        const unitMap = {};
        units.forEach(u => unitMap[u.unitId] = u.unitName);
        this.unitMap = unitMap;
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-users-cog"></i> 人員管理</h1>
                    <div>
                        <button id="import-btn" class="btn-secondary" style="margin-right:10px;"><i class="fas fa-file-import"></i> 匯入人員</button>
                        <button id="add-staff-btn" class="btn-primary"><i class="fas fa-plus"></i> 新增人員</button>
                        <button id="back-btn" class="btn-secondary" style="margin-left:10px;">返回</button>
                    </div>
                </div>

                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem;">
                    <div class="form-group">
                        <label>篩選單位：</label>
                        <select id="unit-filter" style="padding:0.5rem; width:200px;">
                            <option value="">全部單位</option>
                            ${unitOptions}
                        </select>
                    </div>

                    <div style="overflow-x:auto;">
                        <table class="data-table" style="width:100%; border-collapse:collapse; margin-top:1rem; min-width:800px;">
                            <thead>
                                <tr style="background:#f8fafc; text-align:left;">
                                    <th style="padding:10px;">ID</th>
                                    <th style="padding:10px;">姓名</th>
                                    <th style="padding:10px;">Email</th>
                                    <th style="padding:10px;">職級</th>
                                    <th style="padding:10px;">單位</th>
                                    <th style="padding:10px; text-align:center;">管理者</th>
                                    <th style="padding:10px; text-align:center;">排班者</th>
                                    <th style="padding:10px;">操作</th>
                                </tr>
                            </thead>
                            <tbody id="staff-tbody"></tbody>
                        </table>
                    </div>
                </div>

                <div id="staff-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000;">
                    <div style="background:white; width:450px; margin:50px auto; padding:2rem; border-radius:8px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        <h3 id="modal-title">編輯人員</h3>
                        <form id="staff-form">
                            <input type="hidden" id="edit-id">
                            <div class="form-group">
                                <label>員工編號 (ID)</label>
                                <input type="text" id="edit-staffId" disabled style="width:100%; padding:8px; margin-bottom:10px; background:#f3f4f6;">
                            </div>
                            <div class="form-group">
                                <label>姓名</label>
                                <input type="text" id="edit-name" required style="width:100%; padding:8px; margin-bottom:10px;">
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" id="edit-email" disabled style="width:100%; padding:8px; margin-bottom:10px; background:#f3f4f6;">
                            </div>
                            <div class="form-group">
                                <label>職級</label>
                                <select id="edit-level" style="width:100%; padding:8px; margin-bottom:10px;">
                                    <option value="N0">N0</option>
                                    <option value="N1">N1</option>
                                    <option value="N2">N2</option>
                                    <option value="N3">N3</option>
                                    <option value="N4">N4</option>
                                    <option value="AHN">副護理長</option>
                                    <option value="HN">護理長</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>調動單位</label>
                                <select id="edit-unit" style="width:100%; padding:8px; margin-bottom:10px;">
                                    ${unitOptions}
                                </select>
                            </div>
                            
                            <div style="margin: 15px 0; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
                                <h4 style="margin:0 0 10px 0; font-size:0.9em; color:#64748b;">權限設定</h4>
                                <label style="display:flex; align-items:center; cursor:pointer; margin-bottom:8px;">
                                    <input type="checkbox" id="edit-is-manager" style="margin-right:10px;">
                                    <strong>單位管理者 (Unit Manager)</strong>
                                </label>
                                <label style="display:flex; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="edit-is-scheduler" style="margin-right:10px;">
                                    排班人員 (Scheduler)
                                </label>
                            </div>

                            <div style="text-align:right;">
                                <button type="button" id="close-modal" class="btn-secondary">取消</button>
                                <button type="submit" class="btn-primary">儲存</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="import-staff-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000;">
                    <div style="background:white; width:500px; margin:100px auto; padding:2rem; border-radius:8px;">
                        <h3>匯入人員資料</h3>
                        <p>請上傳 CSV 檔案。格式範例：</p>
                        <pre style="background:#f1f1f1; padding:10px;">staffId,name,email,level,unitCode\nN001,王小美,may@mail.com,N2,9B\nN002,陳大文,chen@mail.com,N3,10A</pre>
                        <div style="margin: 1rem 0;">
                            <button id="dl-staff-template" style="text-decoration:underline; border:none; background:none; color:blue; cursor:pointer;">下載範例檔</button>
                        </div>
                        <input type="file" id="staff-csv-file" accept=".csv" style="margin:1rem 0;">
                        <div id="staff-import-result" style="margin-top:10px; color:red;"></div>
                        <div style="text-align:right;">
                            <button id="close-staff-import" class="btn-secondary">取消</button>
                            <button id="start-staff-import" class="btn-primary">開始匯入</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('add-staff-btn').addEventListener('click', () => router.navigate('/unit/staff/create'));

        const tbody = document.getElementById('staff-tbody');
        const unitFilter = document.getElementById('unit-filter');
        const modal = document.getElementById('staff-modal');
        const importModal = document.getElementById('import-staff-modal');
        const form = document.getElementById('staff-form');

        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="8">載入中...</td></tr>';
            let staff = [];
            // 確保選擇全部時能載入
            if (unitId) {
                staff = await userService.getUnitStaff(unitId);
            } else {
                staff = await userService.getAllStaff();
            }
            this.staffList = staff;
            this.renderTable();
        };

        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        this.renderTable = () => {
            if (this.staffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">無資料</td></tr>';
                return;
            }
            tbody.innerHTML = this.staffList.map(s => {
                const isManager = s.permissions?.canManageUnit || s.role === 'unit_manager';
                const isScheduler = s.permissions?.canEditSchedule || s.role === 'unit_scheduler';
                return `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px;">${s.staffId || '-'}</td>
                    <td style="padding:10px;">${s.name}</td>
                    <td style="padding:10px; font-size:0.9em; color:#666;">${s.email}</td>
                    <td style="padding:10px;">${s.level}</td>
                    <td style="padding:10px;">${this.unitMap[s.unitId] || s.unitId}</td>
                    <td style="padding:10px; text-align:center;">${isManager ? '<i class="fas fa-check-circle" style="color:green;"></i>' : '-'}</td>
                    <td style="padding:10px; text-align:center;">${isScheduler ? '<i class="fas fa-check-circle" style="color:blue;"></i>' : '-'}</td>
                    <td style="padding:10px;">
                        <button class="edit-btn" data-id="${s.id}" style="color:blue; margin-right:5px; cursor:pointer; background:none; border:none;"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-id="${s.id}" style="color:red; cursor:pointer; background:none; border:none;"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `}).join('');
        };

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
                document.getElementById('edit-id').value = staff.id;
                document.getElementById('edit-staffId').value = staff.staffId || '';
                document.getElementById('edit-name').value = staff.name;
                document.getElementById('edit-email').value = staff.email;
                document.getElementById('edit-level').value = staff.level || 'N0';
                document.getElementById('edit-unit').value = staff.unitId;
                
                // 設定 checkbox
                document.getElementById('edit-is-manager').checked = !!(staff.permissions?.canManageUnit);
                document.getElementById('edit-is-scheduler').checked = !!(staff.permissions?.canEditSchedule);
                
                modal.style.display = 'block';
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-id').value;
            const unitId = document.getElementById('edit-unit').value;
            const isManager = document.getElementById('edit-is-manager').checked;
            const isScheduler = document.getElementById('edit-is-scheduler').checked;
            
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: unitId
            };
            
            // 1. 更新基本資料
            await userService.updateStaff(id, updateData);
            // 2. 更新管理者權限
            await userService.toggleUnitManager(id, unitId, isManager);
            // 3. 更新排班者權限
            await userService.toggleUnitScheduler(id, unitId, isScheduler);

            modal.style.display = 'none';
            alert('更新成功');
            loadStaff(unitFilter.value);
        });

        document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');
        
        // 匯入相關邏輯
        document.getElementById('import-btn').addEventListener('click', () => importModal.style.display = 'block');
        document.getElementById('close-staff-import').addEventListener('click', () => importModal.style.display = 'none');
        document.getElementById('dl-staff-template').addEventListener('click', () => {
            const csvContent = "staffId,name,email,level,unitCode\nN001,王小美,may@mail.com,N2,9B\nN002,陳大文,chen@mail.com,N3,10A";
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "staff_import_template.csv";
            link.click();
        });
        document.getElementById('start-staff-import').addEventListener('click', async () => {
             const fileInput = document.getElementById('staff-csv-file');
             const resultDiv = document.getElementById('staff-import-result');
             if (!fileInput.files.length) { alert('請選擇檔案'); return; }
             const file = fileInput.files[0];
             const reader = new FileReader();
             reader.onload = async (e) => {
                 const text = e.target.result;
                 const rows = text.split('\n').map(row => row.trim()).filter(row => row);
                 const headers = rows.shift().split(',');
                 const staffData = rows.map(row => {
                     const cols = row.split(',');
                     return {
                         staffId: cols[0]?.trim(),
                         name: cols[1]?.trim(),
                         email: cols[2]?.trim(),
                         level: cols[3]?.trim(),
                         unitCode: cols[4]?.trim()
                     };
                 });
                 resultDiv.textContent = "匯入中...";
                 const result = await userService.importStaff(staffData);
                 if (result.failed === 0) {
                     alert(`成功匯入 ${result.success} 筆人員！`);
                     importModal.style.display = 'none';
                     loadStaff(unitFilter.value);
                 } else {
                     resultDiv.innerHTML = `成功: ${result.success}, 失敗: ${result.failed}<br>錯誤: ${result.errors.join('<br>')}`;
                 }
             };
             reader.readAsText(file);
        });

        // 預設載入全部
        loadStaff("");
    }
}
