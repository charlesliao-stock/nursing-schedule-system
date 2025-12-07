import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class SwapReviewPage {
    async render() {
        return `
            <div class="container-fluid">
                <h2 class="mb-4"><i class="fas fa-check-double"></i> 換班審核</h2>
                <div class="card shadow">
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th>日期</th>
                                        <th>申請人</th>
                                        <th>內容 (原班 &rarr; 對方)</th>
                                        <th>對象</th>
                                        <th>原因</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="review-tbody">
                                    <tr><td colspan="6" class="text-center">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        if (!user.unitId) return;

        const requests = await SwapService.getPendingRequests(user.unitId);
        const tbody = document.getElementById('review-tbody');
        
        if (requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">目前沒有待審核的申請</td></tr>';
            return;
        }

        tbody.innerHTML = requests.map(req => `
            <tr>
                <td>${req.date}</td>
                <td class="fw-bold">${req.requestorName}</td>
                <td>
                    <span class="badge bg-secondary">${req.requestorShift}</span> 
                    <i class="fas fa-exchange-alt mx-1 text-muted"></i> 
                    <span class="badge bg-secondary">${req.targetShift}</span>
                </td>
                <td>${req.targetName}</td>
                <td class="small text-muted">${req.reason}</td>
                <td>
                    <button class="btn btn-sm btn-success btn-approve" data-id="${req.id}"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger btn-reject" data-id="${req.id}"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `).join('');

        // 綁定事件
        tbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const id = btn.dataset.id;
            const req = requests.find(r => r.id === id);
            
            if (btn.classList.contains('btn-approve')) {
                if(confirm('確定核准？這將直接修改班表。')) {
                    await SwapService.reviewRequest(id, 'approved', user.uid, req);
                    this.afterRender(); // Reload
                }
            } else if (btn.classList.contains('btn-reject')) {
                if(confirm('確定駁回？')) {
                    await SwapService.reviewRequest(id, 'rejected', user.uid, req);
                    this.afterRender();
                }
            }
        });
    }
}
