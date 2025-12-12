export const UnitEditTemplate = {
    renderForm(unitData, staffOptions) {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex align-items-center mb-4">
                    <button class="btn btn-link text-secondary" onclick="history.back()"><i class="fas fa-arrow-left"></i> 返回</button>
                    <h2 class="h3 mb-0 text-gray-800">編輯單位: ${unitData.unitName}</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body">
                        <form id="edit-unit-form">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">單位代號</label>
                                    <input type="text" class="form-control bg-light" value="${unitData.unitCode}" disabled>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label fw-bold">單位名稱</label>
                                    <input type="text" class="form-control" id="editUnitName" value="${unitData.unitName}" required>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">描述</label>
                                <textarea class="form-control" id="editDescription" rows="3">${unitData.description || ''}</textarea>
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
};
