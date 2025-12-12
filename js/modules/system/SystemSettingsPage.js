import { userService } from "../../services/firebase/UserService.js";
import { SystemSettingsTemplate } from "./templates/SystemSettingsTemplate.js"; // 引入 Template

export class SystemSettingsPage {
    async render() {
        return SystemSettingsTemplate.render();
    }

    async afterRender() {
        document.getElementById('btn-fix-ids').addEventListener('click', () => this.handleFixIds());
    }

    async handleFixIds() {
        if (!confirm("確定要執行批次修正嗎？這可能會影響大量使用者資料。")) return;
        
        const btn = document.getElementById('btn-fix-ids');
        const resultDiv = document.getElementById('fix-result');
        btn.disabled = true;
        resultDiv.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 掃描並更新中...';

        try {
            const allUsers = await userService.getAllUsers();
            let count = 0;
            let updatedCount = 0;

            for (const user of allUsers) {
                // 檢查是否為 6 碼數字
                if (user.staffId && user.staffId.length === 6 && !isNaN(user.staffId)) {
                    const newId = '0' + user.staffId;
                    await userService.updateUser(user.uid, { staffId: newId });
                    updatedCount++;
                }
                count++;
            }

            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>完成！</strong><br>
                    掃描人數: ${count}<br>
                    修正人數: ${updatedCount}
                </div>
            `;
        } catch (error) {
            console.error(error);
            resultDiv.innerHTML = `<div class="alert alert-danger">執行失敗: ${error.message}</div>`;
        } finally {
            btn.disabled = false;
        }
    }
}
