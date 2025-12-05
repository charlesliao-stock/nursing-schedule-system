// 【修正】引入 UserService (維持原樣) 和 UnitService (大寫)
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class StaffCreatePage {
    async render() {
        // 【修正】使用靜態方法 UnitService.getAllUnits()
        const units = await UnitService.getAllUnits();
        
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}">${u.unitName} (${u.unitCode})</option>`
        ).join('');

        return `
            <div class="container">
                <h2>新增人員</h2>
                <form id="create-staff-form">
                    <div class="form-group">
                        <label>姓名</label>
                        <input type="text" id="staffName" required>
                    </div>
                    <div class="form-group">
                        <label>員工編號 (ID)</label>
                        <input type="text" id="staffId" required placeholder="例如: N12345">
                    </div>
                    <div class="form-group">
                        <label>職級 (Title)</label>
                        <select id="title">
                            <option value="N">護理師 (N)</option>
                            <option value="N1">N1</option>
                            <option value="N2">N2</option>
                            <option value="N3">N3</option>
                            <option value="N4">N4</option>
                            <option value="HN">護理長 (HN)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>所屬單位</label>
                        <select id="unitId" required>
                            <option value="">請選擇單位...</option>
                            ${unitOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Email (登入用)</label>
                        <input type="email" id="email">
                    </div>
                    <button type="submit" class="btn-primary">新增人員</button>
                    <button type="button" onclick="history.back()">取消</button>
                </form>
            </div>
        `;
    }

    afterRender() {
        const form = document.getElementById('create-staff-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const staffData = {
                name: document.getElementById('staffName').value,
                staffId: document.getElementById('staffId').value, // 這裡通常做為 Document ID 或欄位
                title: document.getElementById('title').value,
                unitId: document.getElementById('unitId').value,
                email: document.getElementById('email').value,
                role: 'user' // 預設權限
            };

            try {
                // 假設 UserService 尚未重構，仍使用實例 userService
                const result = await userService.createUser(staffData);
                
                if (result.success) {
                    alert('人員新增成功！');
                    window.location.hash = '/unit/staff/list';
                } else {
                    alert('新增失敗: ' + result.error);
                }
            } catch (error) {
                console.error(error);
                alert('系統錯誤: ' + error.message);
            }
        });
    }
}
