import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SystemSettingsPage {
    async render() {
        return `
            <div class="container-fluid mt-4">
                <h2 class="h3 mb-4 text-gray-800"><i class="fas fa-cogs"></i> 系統設定</h2>

                <div class="row">
                    <div class="col-lg-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3">
                                <h6 class="m-0 font-weight-bold text-danger">資料庫維護工具</h6>
                            </div>
                            <div class="card-body">
                                <h5 class="card-title">員工編號格式校正</h5>
                                <p class="card-text">
                                    此功能會掃描所有使用者資料，將員工編號為 <strong>6 碼</strong> 的資料，
                                    自動在前方補 <strong>0</strong> 變更為 7 碼。
                                </p>
                                <div class="alert alert-warning small">
                                    <i class="fas fa-exclamation-triangle"></i> 此操作將直接修改資料庫，執行前請確認。
                                </div>
                                <button id="btn-fix-ids" class="btn btn-danger">
                                    <i class="fas fa-magic"></i> 執行 ID 補 0 (6碼 -> 7碼)
                                </button>
                                <div id="fix-result" class="mt-3"></div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3">
                                <h6 class="m-0 font-weight-bold text-primary">全域參數</h6>
                            </div>
                            <div class="card-body">
                                <p class="text-muted">目前暫無全域設定項目。</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
