import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class StaffCreatePage {
    async render() {
        const units = await UnitService.getAllUnits();
        
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}">${u.unitName} (${u.unitCode})</option>`
        ).join('');

        return `
            <div class="container">
                <h2 class="mb-4"><i class="fas fa-user-plus"></i> 新增人員帳號</h2>
                
                <div class="card shadow-sm">
                    <div class="card-body">
                        <form id="create-staff-form">
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

                            <hr class="my-3">
                            <h5 class="text-primary mb-3">登入資訊</h5>

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
                                    <div class="form-text">請告知員工此密碼，登入後請自行修改。</div>
                                </div>
                            </div>

                            <div class="mb-3 p-3 bg-light rounded border">
                                <label class="form-label fw-bold mb-2">系統角色與權限</label>
                                <div class="d-flex gap-4">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-user" checked disabled>
                                        <label class="form-check-label" for="role-user">
                                            一般使用者 (預設)
                                        </label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-scheduler">
                                        <label class="form-check-label" for="role-scheduler">
                                            排班人員 (可編輯班表)
                                        </label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="role-manager">
                                        <label class="form-check-label" for="role-manager">
                                            單位管理者 (含排班與人員管理)
                                        </label>
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

    afterRender() {
        const form = document.getElementById('create-staff-form');
        const managerCheck = document.getElementById('role-manager');
        const schedulerCheck = document.getElementById('role-scheduler');

        // 連動邏輯：選了管理者，自動勾選排班者
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
                isManager: managerCheck.checked,
                isScheduler: schedulerCheck.checked
            };
            
            const password = document.getElementById('password').value.trim();

            if (password.length < 6) {
                alert("密碼長度至少需 6 碼");
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }

            try {
                // 呼叫 UserService (已包含 Auth 建立邏輯)
                const result = await userService.createStaff(staffData, password);
                
                if (result.success) {
                    alert(`✅ 人員新增成功！\n請通知員工使用 Email 與密碼登入。`);
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
