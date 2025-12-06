import { UnitService } from "../../services/firebase/UnitService.js";

export class UnitEditPage {
    constructor(unitId) {
        this.unitId = unitId;
        this.unitData = null;
    }

    async render() {
        // 1. 讀取單位資料
        this.unitData = await UnitService.getUnitById(this.unitId);

        if (!this.unitData) {
            return `<div class="container"><div class="alert alert-danger">找不到此單位 (ID: ${this.unitId})</div></div>`;
        }

        // 2. 渲染編輯表單
        return `
            <div class="container">
                <h2 class="mb-4"><i class="fas fa-edit"></i> 編輯單位</h2>
                <div class="card shadow-sm">
                    <div class="card-body">
                        <form id="edit-unit-form">
                            <div class="mb-3">
                                <label class="form-label fw-bold">單位代號 (Unit Code)</label>
                                <input type="text" class="form-control" value="${this.unitData.unitCode}" disabled 
                                       style="background-color: #f3f4f6; cursor: not-allowed;" title="代號不可修改">
                                <div class="form-text">單位代號建立後無法修改</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label fw-bold">單位名稱 (Unit Name)</label>
                                <input type="text" class="form-control" id="editUnitName" value="${this.unitData.unitName}" required>
                            </div>

                            <div class="mb-3">
                                <label class="form-label fw-bold">描述</label>
                                <textarea class="form-control" id="editDescription" rows="3">${this.unitData.description || ''}</textarea>
                            </div>

                            <div class="d-flex justify-content-end gap-2 pt-3 border-top">
                                <button type="button" class="btn btn-secondary" onclick="window.location.hash='/system/units/list'">
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
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

            const updateData = {
                unitName: document.getElementById('editUnitName').value,
                description: document.getElementById('editDescription').value
            };

            try {
                const result = await UnitService.updateUnit(this.unitId, updateData);

                if (result.success) {
                    alert('✅ 單位資料更新成功！');
                    window.location.hash = '/system/units/list';
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
