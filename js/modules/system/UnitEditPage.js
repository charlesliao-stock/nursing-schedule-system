import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitEditPage {
    constructor() {
        this.unitId = null;
        this.unitData = null;
    }

    async render() {
        // 從 URL Hash 解析 ID (簡單實作)
        // 假設 hash 格式為 #/system/units/edit/{id}
        const hashParts = window.location.hash.split('/');
        this.unitId = hashParts[hashParts.length - 1];

        if (!this.unitId) {
            return `<div class="container p-5 text-center text-danger">錯誤：無效的單位 ID</div>`;
        }

        // 1. 讀取單位資料
        this.unitData = await UnitService.getUnitById(this.unitId);

        if (!this.unitData) {
            return `<div class="container p-5 text-center text-danger">找不到此單位 (ID: ${this.unitId})</div>`;
        }

        // 2. 渲染編輯表單
        return `
            <div class="container-fluid">
                <div class="d-flex align-items-center mb-4">
                    <button class="btn btn-link text-decoration-none ps-0 text-secondary" onclick="history.back()">
                        <i class="fas fa-arrow-left"></i> 返回
                    </button>
                    <h2 class="h3 mb-0 text-gray-800 ms-2">編輯單位</h2>
                </div>

                <div class="row justify-content-center">
                    <div class="col-lg-8 col-xl-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3 d-flex justify-content-between align-items-center">
                                <h6 class="m-0 font-weight-bold text-primary">單位資料</h6>
                                <span class="badge bg-secondary">${this.unitData.unitCode}</span>
                            </div>
                            <div class="card-body">
                                <form id="edit-unit-form">
                                    <div class="row">
                                        <div class="col-md-4 mb-3">
                                            <label class="form-label fw-bold">單位代號</label>
                                            <input type="text" class="form-control bg-light" value="${this.unitData.unitCode}" disabled 
                                                   title="代號建立後不可修改">
                                        </div>

                                        <div class="col-md-8 mb-3">
                                            <label for="editUnitName" class="form-label fw-bold">單位名稱 <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" id="editUnitName" value="${this.unitData.unitName}" required>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label for="editDescription" class="form-label fw-bold">描述</label>
                                        <textarea class="form-control" id="editDescription" rows="4">${this.unitData.description || ''}</textarea>
                                    </div>

                                    <hr>

                                    <div class="d-flex justify-content-end gap-2">
                                        <button type="button" class="btn btn-secondary" onclick="history.back()">
                                            取消
                                        </button>
                                        <button type="submit" class="btn btn-primary" id="btn-save-unit">
                                            <i class="fas fa-save"></i> 儲存變更
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
        if (!this.unitData) return;

        const form = document.getElementById('edit-unit-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-save-unit');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 儲存中...';

            const updateData = {
                unitName: document.getElementById('editUnitName').value.trim(),
                description: document.getElementById('editDescription').value.trim()
            };

            try {
                const result = await UnitService.updateUnit(this.unitId, updateData);

                if (result.success) {
                    alert('✅ 單位資料更新成功！');
                    router.navigate('/system/units/list');
                } else {
                    alert('❌ 更新失敗: ' + result.error);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            } catch (error) {
                console.error(error);
                alert('系統錯誤');
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }
}
