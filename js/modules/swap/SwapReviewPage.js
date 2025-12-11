import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SwapReviewPage {
    constructor() {
        this.currentUser = null;
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3 class="text-gray-800 fw-bold"><i class="fas fa-check-double"></i> 換班審核中心</h3></div>

                <div class="card shadow mb-4 border-left-info">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-info"><i class="fas fa-user-check"></i> 待我同意的換班 (同事申請)</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>日期</th><th>申請人</th><th>原班 &rarr; 我的班</th><th>原因</th><th>操作</th></tr></thead>
                                <tbody id="target-review-tbody"><tr><td colspan="5" class="text-center py-3">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card shadow border-left-primary" id="manager-section" style="display:none;">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-primary"><i class="fas fa-tasks"></i> 待單位核准的換班 (雙方已合意)</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light"><tr><th>日期</th><th>申請人</th><th>對象</th><th>內容</th><th>原因</th><th>操作</th></tr></thead>
                                <tbody id="manager-review-tbody"><tr><td colspan="6" class="text-center py-3">載入中...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        this.currentUser = authService.getProfile();
        if(!this.currentUser) return;

        // 1. 載入 "待我同意"
        await this.loadTargetRequests();

        // 2. 如果是管理者，載入 "待核准"
        if (this.currentUser.role === 'unit_manager' || this.currentUser.role === 'unit_scheduler') {
            document.getElementById('manager-section').style.display = 'block';
            await this.loadManagerRequests();
        }
    }

    async loadTargetRequests() {
        const allMyRequests = await SwapService.getUserRequests(this.currentUser.uid);
        // 過濾出：我是 target 且 狀態是 pending_target
        const list = allMyRequests.filter(r => r.targetId === this.currentUser.uid && r.status === 'pending_target');
        
        const tbody = document.getElementById('target-review-tbody');
        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">無待審核項目</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.requestorName}</td>
                <td><span class="badge bg-secondary">${req.requestorShift}</span> &rarr; <span class="badge bg-primary">${req.targetShift}</span></td>
                <td>${req.reason}</td>
                <td>
                    <button class="btn btn-sm btn-success me-1" onclick="window.routerPage.handleTargetReview('${req.id}', 'agree')">同意</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleTargetReview('${req.id}', 'reject')">拒絕</button>
                </td>
            </tr>
        `).join('');
        
        window.routerPage = this;
    }

    async loadManagerRequests() {
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        const tbody = document.getElementById('manager-review-tbody');
        
        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">無待核准項目</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(req => `
            <tr>
                <td>${req.date}</td>
                <td>${req.requestorName}</td>
                <td>${req.targetName}</td>
                <td>${req.requestorShift} <i class="fas fa-exchange-alt text-muted"></i> ${req.targetShift}</td>
                <td>${req.reason}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-1" onclick="window.routerPage.handleManagerReview('${req.id}', 'approve')">核准</button>
                    <button class="btn btn-sm btn-danger" onclick="window.routerPage.handleManagerReview('${req.id}', 'reject')">駁回</button>
                </td>
            </tr>
        `).join('');
    }

    async handleTargetReview(id, action) {
        if(!confirm(action === 'agree' ? '同意換班？(尚需管理者核准)' : '拒絕此申請？')) return;
        await SwapService.reviewByTarget(id, action);
        this.afterRender(); // Reload
    }

    async handleManagerReview(id, action) {
        if(!confirm(action === 'approve' ? '確定核准？將直接修改班表。' : '確定駁回？')) return;
        // 需要完整的 requestData 才能寫入班表，這裡重新 fetch 或從 DOM 傳遞
        // 簡單起見，我們重抓一次列表來找資料
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        const req = list.find(r => r.id === id);
        
        await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
        this.afterRender();
    }
}
