import { userService } from "../../services/firebase/UserService.js";
import { unitService } from "../../services/firebase/UnitService.js"; // 用於選擇單位
import { router } from "../../core/Router.js";

export class StaffCreatePage {
    async render() {
        // 載入單位選項 (供下拉選單使用)
        const units = await unitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-user-plus"></i> 新增護理人員</h1>
                    <button id="back-btn" class="btn-secondary">返回</button>
                </div>

                <div class="card-container" style="max-width: 600px; margin: 2rem auto; background: white; padding: 2rem; border-radius: 8px;">
                    <form id="create-staff-form">
                        <div class="form-group">
                            <label>員工編號 (Staff ID)</label>
                            <input type="text" id="staffId" required placeholder="例如: N12345">
                        </div>
                        
                        <div class="form-group">
                            <label>姓名</label>
                            <input type="text" id="name" required placeholder="例如: 王小美">
                        </div>

                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="email" required placeholder="用於登入系統">
                        </div>

                        <div class="form-row" style="display:flex; gap:1rem;">
                            <div class="form-group" style="flex:1;">
                                <label>所屬單位</label>
                                <select id="unitId" required style="width:100%; padding:0.75rem; border-radius:0.5rem; border:1px solid #d1d5db;">
                                    <option value="">請選擇單位...</option>
                                    ${unitOptions}
                                </select>
                            </div>
                            
                            <div class="form-group" style="flex:1;">
                                <label>職級</label>
                                <select id="level" required style="width:100%; padding:0.75rem; border-radius:0.5rem; border:1px solid #d1d5db;">
                                    <option value="N0">N0</option>
                                    <option value="N1">N1</option>
                                    <option value="N2">N2</option>
                                    <option value="N3">N3</option>
                                    <option value="N4">N4</option>
                                    <option value="HN">護理長 (HN)</option>
                                </select>
                            </div>
                        </div>

                        <div id="form-error" class="error-message"></div>
                        <button type="submit" id="submit-btn" class="btn-primary" style="margin-top:1.5rem;">新增人員</button>
                    </form>
                </div>
            </div>
        `;
    }

    afterRender() {
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));

        const form = document.getElementById('create-staff-form');
        const errorDiv = document.getElementById('form-error');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const staffData = {
                staffId: document.getElementById('staffId').value,
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                unitId: document.getElementById('unitId').value,
                level: document.getElementById('level').value
            };

            // 簡單驗證
            if (!staffData.unitId) {
                alert("請選擇所屬單位");
                return;
            }

            try {
                const result = await userService.createStaff(staffData);
                if (result.success) {
                    alert(`人員 ${staffData.name} 新增成功！`);
                    router.navigate('/dashboard');
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
            }
        });
    }
}
