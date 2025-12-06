import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitCreatePage {
    async render() {
        return `
            <div class="container-fluid">
                <div class="d-flex align-items-center mb-4">
                    <button class="btn btn-link text-decoration-none ps-0 text-secondary" onclick="history.back()">
                        <i class="fas fa-arrow-left"></i> 返回
                    </button>
                    <h2 class="h3 mb-0 text-gray-800 ms-2">建立新單位</h2>
                </div>

                <div class="row justify-content-center">
                    <div class="col-lg-8 col-xl-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3">
                                <h6 class="m-0 font-weight-bold text-primary">單位基本資料</h6>
                            </div>
                            <div class="card-body">
                                <form id="createUnitForm">
                                    <div class="row">
                                        <div class="col-md-4 mb-3">
                                            <label for="unitCode" class="form-label fw-bold">單位代號 <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" id="unitCode" name="unitCode" placeholder="如 9B, ICU" required>
                                            <div class="form-text small">建立後建議不要修改</div>
                                        </div>
                                        
                                        <div class="col-md-8 mb-3">
                                            <label for="unitName" class="form-label fw-bold">單位名稱 <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" id="unitName" name="unitName" placeholder="如 9B 綜合病房" required>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label for="description" class="form-label fw-bold">單位描述</label>
                                        <textarea class="form-control" id="description" name="description" rows="4" placeholder="請輸入單位的相關描述、床位數或特性..."></textarea>
                                    </div>

                                    <hr>
                                    
                                    <div class="d-flex justify-content-end gap-2">
                                        <button type="button" class="btn btn-secondary" onclick="history.back()">取消</button>
                                        <button type="submit" class="btn btn-primary" id="btnSubmit">
                                            <i class="fas fa-check"></i> 確認建立
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
