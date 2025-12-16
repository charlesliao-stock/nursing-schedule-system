import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; 

export class SwapReviewPage {
    constructor() {
        this.currentUser = null;
    }

    async render() {
        // 先渲染框架
        this.currentUser = authService.getProfile();
        const isManager = ['unit_manager', 'unit_scheduler', 'system_admin'].includes(this.currentUser?.role);
        return SwapReviewTemplate.renderLayout(isManager);
    }

    async afterRender() {
        window.routerPage = this;
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.currentUser = authService.getProfile();

        if (!this.currentUser) return;

        // 1. 載入並通知 - 個人待審
        await this.loadTargetReviews();

        // 2. 載入並通知 - 管理者待審
        if (['unit_manager', 'unit_scheduler', 'system_admin'].includes(this.currentUser.role)) {
            await this.loadManagerReviews();
        }
    }

    // --- 個人審核 (我是被換班者) ---
    async loadTargetReviews() {
        try {
            // 使用新版 Service 方法：getIncomingRequests
            const list = await SwapService.getIncomingRequests(this.currentUser.uid);
            
            // 更新紅點通知
            const badge = document.getElementById('badge-target-count');
            if (list.length > 0) {
                badge.textContent = list.length;
                badge.style.display = 'inline-block';
                // 可以加個動畫吸引注意
                badge.classList.add('animate__animated', 'animate__pulse');
            } else {
                badge.style.display = 'none';
            }

            document.getElementById('target-review-tbody').innerHTML = SwapReviewTemplate.renderTargetRows(list);
        } catch (e) { console.error(e); }
    }

    // --- 管理者審核 ---
    async loadManagerReviews() {
        try {
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            
            const badge = document.getElementById('badge-manager-count');
            if (list.length > 0) {
                badge.textContent = list.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }

            document.getElementById('manager-review-tbody').innerHTML = SwapReviewTemplate.renderManagerRows(list);
        } catch (e) { console.error(e); }
    }

    // --- 操作 ---
    async handleTargetReview(id, action) {
        if(!confirm(action === 'agree' ? '同意換班？' : '拒絕此申請？')) return;
        await SwapService.reviewByTarget(id, action);
        this.loadTargetReviews(); // 刷新清單與紅點
    }

    async handleManagerReview(id, action) {
        if(!confirm(action === 'approve' ? '核准並修改班表？' : '駁回申請？')) return;
        
        // 需重新取得該筆資料以執行換班
        const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
        const req = list.find(r => r.id === id);
        
        if(req) {
            await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
            alert("處理完成");
            this.loadManagerReviews(); // 刷新清單與紅點
        } else {
            alert("資料已過期");
            this.loadManagerReviews();
        }
    }
}
