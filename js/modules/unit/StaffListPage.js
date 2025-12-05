import { userService } from "../../services/firebase/UserService.js";
import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];
    }

    async render() {
        // 先載入所有單位，方便顯示單位名稱
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
                        <button id="add-staff-btn" class="btn-primary"><i class="fas fa-plus"></i> 新增人員</button>
                        <button id="back-btn" class="btn-secondary">返回儀表板</button>
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
                                <th style="padding:10px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="staff-tbody"></tbody>
                    </table>
                </div>

                <div id="staff-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5);">
                    <div style="background:white; width:400px; margin:100px auto; padding:2rem; border-radius:8px;">
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
                                </select>
                            </div>
                            <div class="form-group">
                                <label>調動單位</label>
                                <select id="edit-unit" style="width:100%; padding:8px; margin-bottom:10px;">
                                    ${unitOptions}
                                </select>
                            </div>
                            <div style="text-align:right;">
                                <button type="button" id="close-modal" class="btn-secondary">取消</button>
                                <button type="submit" class="btn-primary">儲存</button>
                            </div>
                        </form>
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
        const form = document.getElementById('staff-form');

        // 載入資料函式
        const loadStaff = async (unitId) => {
            tbody.innerHTML = '<tr><td colspan="5">載入中...</td></tr>';
            let staff = [];
            if (unitId) {
                staff = await userService.getUnitStaff(unitId);
            } else {
                // 如果選全部，這裡簡化處理：為了效能，通常不建議一次拉全部，這裡先示範拉第一個單位的
                // 實務上應該要有 getAllStaff API 或分頁
                staff = []; // 暫時留空或提示請選擇單位
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">請選擇單位以查看人員</td></tr>';
                return;
            }
            this.staffList = staff;
            this.renderTable();
        };

        // 監聽篩選
        unitFilter.addEventListener('change', (e) => loadStaff(e.target.value));

        // 渲染表格
        this.renderTable = () => {
            tbody.innerHTML = this.staffList.map(s => `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px;">${s.staffId || '-'}</td>
                    <td style="padding:10px;">${s.name}</td>
                    <td style="padding:10px;">${s.level}</td>
                    <td style="padding:10px;">${this.unitMap[s.unitId] || s.unitId}</td>
                    <td style="padding:10px;">
                        <button class="edit-btn" data-id="${s.id}" style="color:blue; margin-right:5px; cursor:pointer; background:none; border:none;">編輯</button>
                        <button class="delete-btn" data-id="${s.id}" style="color:red; cursor:pointer; background:none; border:none;">刪除</button>
                    </td>
                </tr>
            `).join('');
        };

        // 表格按鈕事件
        tbody.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (e.target.classList.contains('delete-btn')) {
                if (confirm('確定刪除此人員？')) {
                    await userService.deleteStaff(id);
                    // 重新載入目前單位的列表
                    loadStaff(unitFilter.value);
                }
            } else if (e.target.classList.contains('edit-btn')) {
                const staff = this.staffList.find(s => s.id === id);
                document.getElementById('edit-id').value = staff.id;
                document.getElementById('edit-name').value = staff.name;
                document.getElementById('edit-level').value = staff.level;
                document.getElementById('edit-unit').value = staff.unitId;
                modal.style.display = 'block';
            }
        });

        // 模態窗事件
        document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-id').value;
            const updateData = {
                name: document.getElementById('edit-name').value,
                level: document.getElementById('edit-level').value,
                unitId: document.getElementById('edit-unit').value
            };
            
            await userService.updateStaff(id, updateData);
            modal.style.display = 'none';
            alert('更新成功');
            loadStaff(unitFilter.value); // 重新載入
        });

        // 預設載入第一個單位 (如果有)
        if (unitFilter.options.length > 1) {
            unitFilter.selectedIndex = 1;
            loadStaff(unitFilter.value);
        }
    }
}
