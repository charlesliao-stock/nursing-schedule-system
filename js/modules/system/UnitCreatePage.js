import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitCreatePage {
    render() {
        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-plus-circle"></i> 建立新護理單位</h1>
                    <button id="back-btn" class="btn-secondary">返回儀表板</button>
                </div>

                <div class="card-container" style="max-width: 600px; margin: 2rem auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <form id="create-unit-form">
                        <div class="form-group">
                            <label>單位代號 (Code)</label>
                            <input type="text" id="unitCode" required placeholder="例如: 9B, 10A, ER">
                            <small style="color: gray;">用於系統內部識別，需唯一</small>
                        </div>
                        
                        <div class="form-group">
                            <label>單位名稱</label>
                            <input type="text" id="unitName" required placeholder="例如: 9B 內科病房">
                        </div>

                        <div class="form-group">
                            <label>描述/備註 (選填)</label>
                            <textarea id="description" rows="3" style="width:100%; padding:0.5rem; border:1px solid #ccc; border-radius:4px;"></textarea>
                        </div>

                        <div id="form-error" class="error-message"></div>

                        <div class="form-actions" style="margin-top: 2rem; display: flex; gap: 1rem;">
                            <button type="submit" id="submit-btn" class="btn-primary">建立單位</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    afterRender() {
        // 返回按鈕
        document.getElementById('back-btn').addEventListener('click', () => {
            router.navigate('/dashboard');
        });

        // 表單提交
        const form = document.getElementById('create-unit-form');
        const errorDiv = document.getElementById('form-error');
        const submitBtn = document.getElementById('submit-btn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const unitCode = document.getElementById('unitCode').value.trim();
            const unitName = document.getElementById('unitName').value.trim();
            const description = document.getElementById('description').value.trim();

            if (!unitCode || !unitName) {
                alert("請填寫必填欄位");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "處理中...";

            // 呼叫 Service
            const result = await unitService.createUnit({
                unitCode,
                unitName,
                description
            });

            if (result.success) {
                alert(`單位 ${unitName} 建立成功！`);
                router.navigate('/dashboard');
            } else {
                errorDiv.textContent = "建立失敗: " + result.error;
                errorDiv.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = "建立單位";
            }
        });
    }
}
