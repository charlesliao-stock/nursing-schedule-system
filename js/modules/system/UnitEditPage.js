import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { router } from "../../core/Router.js";
import { UnitEditTemplate } from "./templates/UnitEditTemplate.js"; // 引入 Template

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

        return UnitEditTemplate.renderForm(this.unitData, staffOptions);
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
