import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; 

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

        // 1. 載入 "待我同意" (個人待辦) - 這是給被換班者看的
        await this.loadTargetRequests();

        // 2. 如果是管理者，載入 "待核准" (單位待辦)
        if (this.currentUser.role === 'unit_manager' || this.currentUser.role === 'unit_scheduler') {
            await this.loadManagerRequests();
        }
    }

    // 載入 "待我同意"
    async loadTargetRequests() {
        const allMyRequests = await SwapService.getUserRequests(this.currentUser.uid);
        
        // 過濾條件：我是 target 且 狀態是 pending_target
        // 即使申請人一次送出 5 筆，這裡會看到 5 列獨立的資料，可以逐一同意或拒絕
        const list = allMyRequests.filter(r => r.targetId === this.currentUser.uid && r.status === 'pending_target');
        
        // 這裡確保 Template 有顯示 reason 欄位
        document.getElementById('target-review-tbody').innerHTML = SwapReviewTemplate.renderTargetRows(list);
    }

    // 載入 "待管理者核准"
    async loadManagerRequests() {
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        
        // 這裡列出所有 pending_manager 的請求，管理者可逐筆審核
        document.getElementById('manager-review-tbody').innerHTML = SwapReviewTemplate.renderManagerRows(list);
    }

    // 被換班者操作
    async handleTargetReview(id, action) {
        if(!confirm(action === 'agree' ? '同意換班？(同意後尚需管理者核准)' : '拒絕此申請？')) return;
        
        await SwapService.reviewByTarget(id, action);
        this.loadTargetRequests(); // 重刷列表
    }

    // 管理者操作
    async handleManagerReview(id, action) {
        if(!confirm(action === 'approve' ? '確定核准？將直接修改班表。' : '確定駁回？')) return;
        
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        const req = list.find(r => r.id === id);
        
        if (!req) return alert("資料已變更，請重新整理");

        // 核准後 SwapService 會去更新 ScheduleService
        await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
        this.loadManagerRequests(); // 重刷列表
    }
}
