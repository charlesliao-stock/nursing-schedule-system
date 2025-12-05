import { unitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { router } from "../../core/Router.js";

export class UnitListPage {
    async render() {
        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-building"></i> 單位管理</h1>
                    <div>
                        <button id="import-btn" class="btn-secondary" style="margin-right:10px;"><i class="fas fa-file-import"></i> 匯入單位</button>
                        <button id="create-btn" class="btn-primary"><i class="fas fa-plus"></i> 新增單位</button>
                        <button id="back-btn" class="btn-secondary" style="margin-left:10px;">返回</button>
                    </div>
                </div>

                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem;">
                    <table class="data-table" style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f8fafc; text-align:left;">
                                <th style="padding:10px;">代號</th>
                                <th style="padding:10px;">名稱</th>
                                <th style="padding:10px;">描述</th>
                                <th style="padding:10px;">管理者數</th>
                                <th style="padding:10px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="unit-tbody"></tbody>
                    </table>
                </div>

                <div id="edit-unit-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000;">
                    <div style="background:white; width:600px; margin:50px auto; padding:2rem; border-radius:8px; max-height:80vh; overflow-y:auto;">
                        <h3>編輯單位</h3>
                        <form id="edit-unit-form">
                            <input type="hidden" id="edit-unit-id">
                            <div class="form-group">
                                <label>代號</label>
                                <input type="text" id="edit-unit-code" disabled style="width:100%; padding:8px; background:#eee; margin-bottom:10px;">
                            </div>
                            <div class="form-group">
                                <label>名稱</label>
                                <input type="text" id="edit-unit-name" required style="width:100%; padding:8px; margin-bottom:10px;">
                            </div>
                            <div class="form-group">
                                <label>描述</label>
                                <input type="text" id="edit-unit-desc" style="width:100%; padding:8px; margin-bottom:10px;">
                            </div>

                            <div class="form-group" style="margin-top:20px; border:1px solid #ddd; padding:15px; border-radius:4px;">
                                <h4>單位人員權限設定</h4>
                                <p style="font-size:0.85em; color:gray;">請勾選此單位的人員來擔任職務：</p>
                                <div id="unit-staff-list" style="max-height:200px; overflow-y:auto; border:1px solid #eee; padding:5px;">
                                    載入中...
                                </div>
                            </div>

                            <div style="text-align:right; margin-top:20px;">
                                <button type="button" id="close-edit-modal" class="btn-secondary">取消</button>
                                <button type="submit" class="btn-primary">儲存變更</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="import-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000;">
                    <div style="background:white; width:500px; margin:100px auto; padding:2rem; border-radius:8px;">
                        <h3>匯入單位資料</h3>
                        <p>請上傳 CSV 檔案。</p>
                        <input type="file" id="csv-file" accept=".csv" style="margin:1rem 0;">
                        <div id="import-result" style="margin-top:10px; color:red;"></div>
                        <div style="text-align:right;">
                            <button id="close-import" class="btn-secondary">取消</button>
                            <button id="start-import" class="btn-primary">開始匯入</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('create-btn').addEventListener('click', () => router.navigate('/system/units/create'));
        
        // 匯入相關
        const importModal = document.getElementById('import-modal');
        document.getElementById('import-btn').addEventListener('click', () => importModal.style.display = 'block');
        document.getElementById('close-import').addEventListener('click', () => importModal.style.display = 'none');
        document.getElementById('start-import').addEventListener('click', async () => {
            // ...維持原樣...
            const fileInput = document.getElementById('csv-file');
            const resultDiv = document.getElementById('import-result');
            if (!fileInput.files.length) { alert('請選擇檔案'); return; }
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result;
                const rows = text.split('\n').map(row => row.trim()).filter(row => row);
                const headers = rows.shift().split(',');
                const unitsData = rows.map(row => {
                    const cols = row.split(',');
                    return { unitCode: cols[0]?.trim(), unitName: cols[1]?.trim(), description: cols[2]?.trim() || '' };
                });
                resultDiv.textContent = "匯入中...";
                const result = await unitService.importUnits(unitsData);
                if (result.failed === 0) {
                    alert(`成功匯入 ${result.success} 筆單位！`);
                    importModal.style.display = 'none';
                    this.loadUnits();
                } else {
                    resultDiv.innerHTML = `成功: ${result.success}, 失敗: ${result.failed}<br>錯誤: ${result.errors.join('<br>')}`;
                }
            };
            reader.readAsText(file);
        });

        // 編輯相關
        const editModal = document.getElementById('edit-unit-modal');
        const editForm = document.getElementById('edit-unit-form');
        document.getElementById('close-edit-modal').addEventListener('click', () => editModal.style.display = 'none');

        // 提交編輯
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const unitId = document.getElementById('edit-unit-id').value;
            const updateData = {
                unitName: document.getElementById('edit-unit-name').value,
                description: document.getElementById('edit-unit-desc').value
            };

            // 1. 更新單位基本資料
            await unitService.updateUnit(unitId, updateData);

            // 2. 更新人員權限 (批次)
            // 蒐集勾選的 managers 與 schedulers
            const managerIds = [];
            const schedulerIds = [];
            document.querySelectorAll('.staff-role-check').forEach(chk => {
                const staffId = chk.dataset.id;
                const type = chk.dataset.type; // 'manager' or 'scheduler'
                if (chk.checked) {
                    if (type === 'manager') managerIds.push(staffId);
                    if (type === 'scheduler') schedulerIds.push(staffId);
                }
            });

            await userService.batchUpdateRoles(unitId, managerIds, schedulerIds);

            alert('單位資料與人員權限已更新！');
            editModal.style.display = 'none';
            this.loadUnits();
        });

        this.loadUnits();
    }

    async loadUnits() {
        const tbody = document.getElementById('unit-tbody');
        tbody.innerHTML = '<tr><td colspan="5">載入中...</td></tr>';
        
        const units = await unitService.getAllUnits();
        
        if (units.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">尚無單位資料</td></tr>';
            return;
        }

        tbody.innerHTML = units.map(u => `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px;">${u.unitCode}</td>
                <td style="padding:10px;">${u.unitName}</td>
                <td style="padding:10px;">${u.description || '-'}</td>
                <td style="padding:10px;">${u.managers ? u.managers.length : 0} 人</td>
                <td style="padding:10px;">
                    <button class="btn-icon edit-btn" data-id="${u.unitId}" style="color:blue; cursor:pointer; border:none; background:none; margin-right:5px;"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-btn" data-id="${u.unitId}" style="color:red; cursor:pointer; border:none; background:none;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        // 綁定事件
        tbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;

            if (btn.classList.contains('delete-btn')) {
                if(confirm('確定刪除此單位？這可能會影響關聯的人員。')) {
                    await unitService.deleteUnit(id);
                    this.loadUnits();
                }
            } else if (btn.classList.contains('edit-btn')) {
                await this.openEditModal(id);
            }
        });
    }

    async openEditModal(unitId) {
        const modal = document.getElementById('edit-unit-modal');
        const unit = await unitService.getUnitById(unitId);
        
        document.getElementById('edit-unit-id').value = unit.unitId;
        document.getElementById('edit-unit-code').value = unit.unitCode;
        document.getElementById('edit-unit-name').value = unit.unitName;
        document.getElementById('edit-unit-desc').value = unit.description || '';

        // 載入該單位人員並產生勾選清單
        const staffListDiv = document.getElementById('unit-staff-list');
        staffListDiv.innerHTML = '載入人員中...';
        
        const staff = await userService.getUnitStaff(unitId);
        if (staff.length === 0) {
            staffListDiv.innerHTML = '<span style="color:gray;">此單位尚無人員，請先至人員管理新增。</span>';
        } else {
            staffListDiv.innerHTML = `
                <table style="width:100%; font-size:0.9em;">
                    <tr style="background:#f8f9fa;">
                        <th style="text-align:left; padding:5px;">姓名</th>
                        <th style="padding:5px;">管理者</th>
                        <th style="padding:5px;">排班者</th>
                    </tr>
                    ${staff.map(s => {
                        const isMgr = (unit.managers || []).includes(s.id);
                        const isSch = (unit.schedulers || []).includes(s.id);
                        return `
                        <tr>
                            <td style="padding:5px;">${s.name} (${s.level || '-'})</td>
                            <td style="text-align:center;">
                                <input type="checkbox" class="staff-role-check" data-id="${s.id}" data-type="manager" ${isMgr ? 'checked' : ''}>
                            </td>
                            <td style="text-align:center;">
                                <input type="checkbox" class="staff-role-check" data-id="${s.id}" data-type="scheduler" ${isSch ? 'checked' : ''}>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </table>
            `;
        }
        
        modal.style.display = 'block';
    }
}
