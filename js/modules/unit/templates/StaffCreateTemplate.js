export const StaffCreateTemplate = {
    renderForm(unitOptions) {
        return `
            <div class="container">
                <h2 class="mb-4"><i class="fas fa-user-plus"></i> 新增人員帳號</h2>
                
                <div class="card shadow-sm">
                    <div class="card-body">
                        <form id="create-staff-form">
                            <h5 class="text-primary mb-3">基本資料</h5>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">姓名 <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="staffName" required placeholder="請輸入真實姓名">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">員工編號 (ID) <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="staffId" required placeholder="例如: N12345">
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">職級 (Title) <span class="text-danger">*</span></label>
                                    <select class="form-select" id="title">
                                        <option value="N0">護理師 (N0)</option>
                                        <option value="N1">N1</option>
                                        <option value="N2">N2</option>
                                        <option value="N3">N3</option>
                                        <option value="N4">N4</option>
                                        <option value="AHN">副護理長 (AHN)</option>
                                        <option value="HN">護理長 (HN)</option>
                                        <option value="NP">專科護理師 (NP)</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">所屬單位 <span class="text-danger">*</span></label>
                                    <select class="form-select" id="unitId" required>
                                        <option value="">請選擇單位...</option>
                                        ${unitOptions}
                                    </select>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">到職日期</label>
                                    <input type="date" class="form-control" id="hireDate">
                                    <div class="form-text small">用於計算年資與排班品質評分</div>
                                </div>
                            </div>

                            <hr class="my-3">

                            <h5 class="text-primary mb-3">排班限制參數</h5>
                            <div class="row bg-light p-3 rounded mb-3 mx-0">
                                <div class="col-md-3 mb-3">
                                    <label class="form-label fw-bold">連上天數上限</label>
                                    <input type="number" class="form-control" id="maxConsecutive" value="6" min="1" max="12">
                                </div>
                                <div class="col-md-3 mb-3">
                                    <label class="form-label fw-bold">連夜天數上限</label>
                                    <input type="number" class="form-control" id="maxConsecutiveNights" value="4" min="1" max="10">
                                    <div class="form-text small">E/N 班連續上限</div>
                                </div>
                                <div class="col-md-3 mb-3 d-flex align-items-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="canBatch">
                                        <label class="form-check-label fw-bold" for="canBatch">是否可以包班</label>
                                    </div>
                                </div>
                                <div class="col-md-3 mb-3 d-flex align-items-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="isPregnant">
                                        <label class="form-check-label fw-bold text-danger" for="isPregnant">懷孕狀態</label>
                                    </div>
                                    <span class="ms-2 badge bg-warning text-dark small">不排夜</span>
                                </div>
                            </div>

                            <hr class="my-3">

                            <h5 class="text-primary mb-3">登入與權限</h5>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">Email (登入帳號) <span class="text-danger">*</span></label>
                                    <input type="email" class="form-control" id="email" required placeholder="例如: name@hospital.com">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">預設密碼 <span class="text-danger">*</span></label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="password" required value="123456">
                                        <button class="btn btn-outline-secondary" type="button" onclick="document.getElementById('password').value = Math.random().toString(36).slice(-8)">
                                            隨機產生
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-3 p-3 border rounded">
                                <label class="form-label fw-bold mb-2">系統角色</label>
                                <div class="d-flex gap-4">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-user" checked disabled>
                                        <label class="form-check-label" for="role-user">一般使用者 (預設)</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-scheduler">
                                        <label class="form-check-label" for="role-scheduler">排班人員</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-manager">
                                        <label class="form-check-label" for="role-manager">單位管理者</label>
                                    </div>
                                </div>
                            </div>

                            <div class="d-flex justify-content-end gap-2 mt-4">
                                <button type="button" class="btn btn-secondary" onclick="history.back()">取消</button>
                                <button type="submit" class="btn btn-primary" id="btn-submit">
                                    <i class="fas fa-check"></i> 確認新增
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }
};
