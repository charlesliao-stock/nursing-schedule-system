import { userService } from "../../services/firebase/UserService.js";
import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.unitMap = {};
    }

    async render() {
        const units = await unitService.getAllUnits();
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

                    <table class="data-table" style="width:100%; border-collapse:collapse; margin-top:1rem;">
                        <thead>
                            <tr style="background:#f8fafc; text-align:left;">
                                <th style="padding:10px;">ID</th>
                                <th style="padding:10px;">姓名</th>
                                <th style="padding:10px;">職級</th>
                                <th style="padding:10px;">單位</th>
                                <th style="padding:10px;">管理者</th>
                                <th style="padding:10px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="staff-tbody"></tbody>
                    </table>
                </div>

                <div id="staff-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5);">
                    <div style="background:white; width:400px; margin:50px auto; padding:2rem; border-radius:8px;">
                        <h3 id="modal-title">編輯人員</h3>
                        <form id="staff-form">
                            <input type="hidden" id="edit-id">
                            <div class="form-group">
                                <label>姓名</label>
                                <input type="text" id="edit-name" required style="width:100%; padding:8px; margin-bottom:10px;">
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
                            <div class="form-group" style="margin: 15px 0; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px;">
                                <label style="display:flex; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="edit-is-manager" style="margin-right:10px;">
                                    設定為該單位管理者
                                </label>
                                <small style="color:gray;">勾選後，該員將擁有該單位的排班與管理權限 (可多選)。</small>
                            </div>

                            <div style="text-align:right;">
                                <button type="button" id="close-modal" class="btn-secondary">取消</button>
                                <button type="submit" class="btn-primary">儲存</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="import-staff-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5);">
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

        // 載入資料函式
        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="6">載入中...</td></tr>';
            let staff = [];
            // 【修正】解決空字串無法載入全部的問題
            if (unitId) {
                staff = await userService.getUnitStaff(unitId);
            } else {
                staff = await userService.getAllStaff();
            }
            this.staffList = staff;
            this.renderTable();
        };

        // 監聽篩選
        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        // 渲染表格
        this.renderTable = () => {
            if (this.staffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">無資料</td></tr>';
                return;
            }
            tbody.innerHTML = this.staffList.map(s => {
                const isManager = s.role === 'unit_manager' || s.role === 'unit_scheduler';
                return `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px;">${s.staffId || '-'}</td>
                    <td style="padding:10px;">
                        ${s.name}
                        ${isManager ? '<span style="background:orange; color:white; font-size:0.8em; padding:2px 4px; border-radius:4px; margin-left:5px;">主管</span>' : ''}
                    </td>
                    <td style="padding:10px;">${s.level}</td>
                    <td style="padding:10px;">${this.unitMap[s.unitId] || s.unitId}</td>
                    <td style="padding:10px;">${isManager ? '是' : '-'}</td>
                    <td style="padding:10px;">
                        <button class="edit-btn" data-id="${s.id}" style="color:blue; margin-right:5px; cursor:pointer; background:none; border:none;">編輯</button>
                        <button class="delete-btn" data-id="${s.id}" style="color:red; cursor:pointer; background:none; border:none;">刪除</button>
                    </td>
                </tr>
            `}).join('');
        };

        // 表格按鈕事件 (編輯/刪除)
        tbody.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (e.target.classList.contains('delete-btn')) {
                if (confirm('確定刪除此人員？')) {
                    await userService.deleteStaff(id);
                    loadStaff(unitFilter.value);
                }
            } else if (e.target.classList.contains('edit-btn')) {
                const staff = this.staffList.find(s => s.id === id);
                document.getElementById('edit-id').value = staff.id;
                document.getElementById('edit-name').value = staff.name;
                document.getElementById('edit-level').value = staff.level || 'N0';
                document.getElementById('edit-unit').value = staff.unitId;
                // 設定管理者 checkbox 狀態
                document.getElementById('edit-is-manager').checked = (staff.role === 'unit_manager');
                modal.style.display = 'block';
            }
        });

        // 編輯表單提交
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-id').value;
            const unitId = document.getElementById('edit-unit').value;
            const isManager = document.getElementById('edit-is-manager').checked;
            
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: unitId
            };
            
            // 先更新基本資料
            await userService.updateStaff(id, updateData);
            
            // 【新增】更新管理者狀態
            await userService.toggleUnitManager(id, unitId, isManager);

            modal.style.display = 'none';
            alert('更新成功');
            loadStaff(unitFilter.value);
        });

        document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');

        // --- 匯入相關 ---
        document.getElementById('import-btn').addEventListener('click', () => importModal.style.display = 'block');
        document.getElementById('close-staff-import').addEventListener('click', () => importModal.style.display = 'none');
        
        document.getElementById('dl-staff-template').addEventListener('click', () => {
            const csvContent = "staffId,name,email,level,unitCode\nN001,王大明,wang@mail.com,N2,9B\nN002,李小華,lee@mail.com,HN,9B";
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
