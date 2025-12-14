import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { StaffCreateTemplate } from "./templates/StaffCreateTemplate.js"; // 引入 Template

export class StaffCreatePage {
    async render() {
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}">${u.unitName} (${u.unitCode})</option>`
        ).join('');

        return StaffCreateTemplate.renderForm(unitOptions);
    }

    afterRender() {
        const form = document.getElementById('create-staff-form');
        const managerCheck = document.getElementById('role-manager');
        const schedulerCheck = document.getElementById('role-scheduler');

        managerCheck.addEventListener('change', (e) => {
            if (e.target.checked) schedulerCheck.checked = true;
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-submit');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 建立中...';
            
            const staffData = {
                name: document.getElementById('staffName').value.trim(),
                staffId: document.getElementById('staffId').value.trim(),
                title: document.getElementById('title').value,
                unitId: document.getElementById('unitId').value,
                email: document.getElementById('email').value.trim(),
                hireDate: document.getElementById('hireDate').value || null,
                isManager: managerCheck.checked,
                isScheduler: schedulerCheck.checked,
                constraints: {
                    maxConsecutive: parseInt(document.getElementById('maxConsecutive').value) || 6,
                    maxConsecutiveNights: parseInt(document.getElementById('maxConsecutiveNights').value) || 4, 
                    canBatch: document.getElementById('canBatch').checked,
                    isPregnant: document.getElementById('isPregnant').checked
                }
            };

            const password = document.getElementById('password').value.trim();

            if (password.length < 6) {
                alert("密碼長度至少需 6 碼");
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }

            try {
                const result = await userService.createStaff(staffData, password);
                if (result.success) {
                    alert(`✅ 人員新增成功！`);
                    window.location.hash = '/unit/staff/list';
                } else {
                    alert('❌ 新增失敗: ' + result.error);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            } catch (error) {
                console.error(error);
                alert('系統錯誤: ' + error.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }
}
