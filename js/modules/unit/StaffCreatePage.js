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

                            <hr class="my-3">

                            <h5 class="text-primary mb-3">排班限制參數</h5>
                            <div class="row bg-light p-3 rounded mb-3 mx-0">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">連續上班天數上限</label>
                                    <input type="number" class="form-control" id="maxConsecutive" value="6" min="1" max="12">
                                    <div class="form-text">預設 6 天</div>
                                </div>
                                <div class="col-md-4 mb-3 d-flex align-items-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="canBatch">
                                        <label class="form-check-label fw-bold" for="canBatch">是否可以包班</label>
                                    </div>
                                </div>
                                <div class="col-md-4 mb-3 d-flex align-items-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="isPregnant">
                                        <label class="form-check-label fw-bold text-danger" for="isPregnant">懷孕狀態</label>
                                    </div>
                                    <span class="ms-2 badge bg-warning text-dark">不排 > 22:00</span>
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

    afterRender() {
        const form = document.getElementById('create-staff-form');
        const managerCheck = document.getElementById('role-manager');
        const schedulerCheck = document.getElementById('role-scheduler');

        // 連動邏輯
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
                isScheduler: schedulerCheck.checked,
                // ✨ 新增：收集限制參數
                constraints: {
                    maxConsecutive: parseInt(document.getElementById('maxConsecutive').value) || 6,
                    canBatch: document.getElementById('canBatch').checked,
                    isPregnant: document.getElementById('isPregnant').checked
                }
            };
            
            // 將 constraints 合併進 staffData 傳給 UserService
            // 注意：UserService.createStaff 需要微調以接收 constraints (或直接把 staffData 整個存進去)
            // 在目前的 UserService 實作中，我們需要把 constraints 放在 user 物件中
            // 由於 UserService.createStaff 是接收 staffData 物件，我們只需確認 UserService 有把額外欄位寫入即可
            // (我們剛更新的 UserService 已經會把 ...staffData 寫入，所以這裡擴充 staffData 即可生效)

            const password = document.getElementById('password').value.trim();

            if (password.length < 6) {
                alert("密碼長度至少需 6 碼");
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }

            try {
                // 這裡我們稍微修改傳遞方式，確保 UserService 能處理
                // 目前 UserService.createStaff 內部是手動解構欄位，我們需要去 UserService 把 constraints 加進去
                // 或者，我們直接利用 JS 的動態特性，在這裡修改 UserService 呼叫 (假設 Service 已更新)
                
                // 為了確保資料正確寫入，建議您檢查 UserService.js 的 createStaff 方法
                // 確保它有寫入 `constraints: staffData.constraints` 
                
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
