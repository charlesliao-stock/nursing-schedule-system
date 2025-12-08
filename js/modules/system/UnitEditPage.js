import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js"; // 引入
import { router } from "../../core/Router.js";

export class UnitEditPage {
    constructor() { this.unitId = null; this.unitData = null; }

    async render() {
        const hashParts = window.location.hash.split('/');
        this.unitId = hashParts[hashParts.length - 1];
        if (!this.unitId) return `<div class="p-5 text-danger">無效 ID</div>`;

        this.unitData = await UnitService.getUnitById(this.unitId);
        if (!this.unitData) return `<div class="p-5 text-danger">找不到單位</div>`;

        // 讀取該單位人員 (用於下拉選單)
        const staffList = await userService.getUsersByUnit(this.unitId);
        const staffOptions = `<option value="">(未指定)</option>` + 
            staffList.map(u => `<option value="${u.uid}">${u.name} (${u.staffId || '-'})</option>`).join('');

        // 找出目前的管理者與排班者 (支援多選或單選，這裡示範取第一個顯示)
        const currentManager = (this.unitData.managers && this.unitData.managers.length > 0) ? this.unitData.managers[0] : '';
        const currentScheduler = (this.unitData.schedulers && this.unitData.schedulers.length > 0) ? this.unitData.schedulers[0] : '';

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex align-items-center mb-4">
                    <button class="btn btn-link text-secondary" onclick="history.back()"><i class="fas fa-arrow-left"></i> 返回</button>
                    <h2 class="h3 mb-0 text-gray-800">編輯單位: ${this.unitData.unitName}</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body">
                        <form id="edit-unit-form">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">單位代號</label>
                                    <input type="text" class="form-control bg-light" value="${this.unitData.unitCode}" disabled>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label fw-bold">單位名稱</label>
                                    <input type="text" class="form-control" id="editUnitName" value="${this.unitData.unitName}" required>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">描述</label>
                                <textarea class="form-control" id="editDescription" rows="3">${this.unitData.description || ''}</textarea>
                            </div>
                            
                            <hr>
                            <h6 class="text-primary font-weight-bold">人員指派</h6>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">主要管理者 (Manager)</label>
                                    <select class="form-select" id="managerSelect">
                                        ${staffOptions}
                                    </select>
                                    <div class="form-text small">被選中者將擁有管理單位權限</div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">主要排班者 (Scheduler)</label>
                                    <select class="form-select" id="schedulerSelect">
                                        ${staffOptions}
                                    </select>
                                    <div class="form-text small">被選中者將擁有編輯排班表權限</div>
                                </div>
                            </div>

                            <div class="text-end">
                                <button type="submit" class="btn btn-primary" id="btn-save"><i class="fas fa-save"></i> 儲存變更</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        if (!this.unitData) return;
        
        // 設定下拉選單預設值
        const managerSelect = document.getElementById('managerSelect');
        const schedulerSelect = document.getElementById('schedulerSelect');
        
        if (this.unitData.managers && this.unitData.managers.length > 0) managerSelect.value = this.unitData.managers[0];
        if (this.unitData.schedulers && this.unitData.schedulers.length > 0) schedulerSelect.value = this.unitData.schedulers[0];

        document.getElementById('edit-unit-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save');
            btn.disabled = true;
            btn.innerHTML = '儲存中...';

            const updateData = {
                unitName: document.getElementById('editUnitName').value.trim(),
                description: document.getElementById('editDescription').value.trim(),
                // 將選擇轉換為陣列
                managers: managerSelect.value ? [managerSelect.value] : [],
                schedulers: schedulerSelect.value ? [schedulerSelect.value] : []
            };

            const res = await UnitService.updateUnit(this.unitId, updateData);
            if (res.success) {
                alert('✅ 更新成功');
                router.navigate('/system/units/list');
            } else {
                alert('失敗: ' + res.error);
                btn.disabled = false;
                btn.innerHTML = '儲存變更';
            }
        });
    }
}
