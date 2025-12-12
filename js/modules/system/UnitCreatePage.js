import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { UnitCreateTemplate } from "./templates/UnitCreateTemplate.js"; // 引入 Template

export class UnitCreatePage {
    async render() {
        return UnitCreateTemplate.renderForm();
    }

    async afterRender() {
        const form = document.getElementById('createUnitForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('btnSubmit');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 處理中...';

            const formData = {
                unitCode: document.getElementById('unitCode').value.trim(),
                unitName: document.getElementById('unitName').value.trim(),
                description: document.getElementById('description').value.trim()
            };

            try {
                const result = await UnitService.createUnit(formData);
                if (result.success) {
                    alert('✅ 單位建立成功！');
                    router.navigate('/system/units/list');
                } else {
                    alert('❌ 建立失敗：' + result.error);
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            } catch (error) {
                console.error(error);
                alert('系統錯誤，請稍後再試');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }
}
