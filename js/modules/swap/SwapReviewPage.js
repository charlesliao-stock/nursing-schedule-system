import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; // 引入 Template

export class SwapReviewPage {
    constructor() {
        this.currentUser = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        // 判斷是否為管理者
        const isManager = (this.currentUser?.role === 'unit_manager' || this.currentUser?.role === 'unit_scheduler');
        return SwapReviewTemplate.renderLayout(isManager);
    }

    async afterRender() {
        if(!this.currentUser) return;
        window.routerPage = this;

        // 1. 載入 "待我同意" (個人待辦)
        await this.loadTargetRequests();

        // 2. 如果是管理者，載入 "待核准" (單位待辦)
        if (this.currentUser.role === 'unit_manager' || this.currentUser.role === 'unit_scheduler') {
            await this.loadManagerRequests();
        }
    }

    async loadTargetRequests() {
        const allMyRequests = await SwapService.getUserRequests(this.currentUser.uid);
        // 過濾條件：我是 target 且 狀態是 pending_target
        const list = allMyRequests.filter(r => r.targetId === this.currentUser.uid && r.status === 'pending_target');
        
        // 使用 Template 渲染
        document.getElementById('target-review-tbody').innerHTML = SwapReviewTemplate.renderTargetRows(list);
    }

    async loadManagerRequests() {
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        // 使用 Template 渲染
        document.getElementById('manager-review-tbody').innerHTML = SwapReviewTemplate.renderManagerRows(list);
    }

    async handleTargetReview(id, action) {
        if(!confirm(action === 'agree' ? '同意換班？(同意後尚需管理者核准)' : '拒絕此申請？')) return;
        await SwapService.reviewByTarget(id, action);
        this.loadTargetRequests(); // 只重刷列表，不重整頁面
    }

    async handleManagerReview(id, action) {
        if(!confirm(action === 'approve' ? '確定核准？將直接修改班表。' : '確定駁回？')) return;
        
        // 需要重新取得 Request Data 以便寫入班表
        // 這裡為了確保資料最新，從 Server 或記憶體中查找
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        const req = list.find(r => r.id === id);
        
        if (!req) return alert("資料已變更，請重新整理");

        await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
        this.loadManagerRequests(); // 重刷列表
    }
}
