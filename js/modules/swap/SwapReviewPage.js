import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; 

export class SwapReviewPage {
    constructor() {
        this.currentUser = null;
    }

    async render() {
        // 先顯示基本框架
        this.currentUser = authService.getProfile();
        // 判斷權限以決定是否顯示管理者頁籤
        const role = this.currentUser?.role;
        const isManager = (role === 'unit_manager' || role === 'unit_scheduler' || role === 'system_admin');
        
        return SwapReviewTemplate.renderLayout(isManager);
    }

    async afterRender() {
        window.routerPage = this;

        // 確保使用者已登入
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { 
            await new Promise(r => setTimeout(r, 200)); 
            retries++; 
        }
        this.currentUser = authService.getProfile();

        if (!this.currentUser) {
            document.querySelector('.container-fluid').innerHTML = '<div class="alert alert-danger m-4">請先登入</div>';
            return;
        }

        // 載入資料
        await this.loadTargetRequests();

        // 若是管理者，載入管理者待審清單
        const role = this.currentUser.role;
        if (role === 'unit_manager' || role === 'unit_scheduler' || role === 'system_admin') {
            await this.loadManagerRequests();
        }
    }

    // --- 載入邏輯 ---

    async loadTargetRequests() {
        try {
            // 抓取所有與我相關的 (我是 Target)
            const allRequests = await SwapService.getUserRequests(this.currentUser.uid);
            // 過濾：狀態必須是 pending_target
            const list = allRequests.filter(r => r.status === 'pending_target');
            
            // 更新計數
            const badge = document.getElementById('badge-target-count');
            if(badge) {
                badge.textContent = list.length;
                badge.style.display = list.length ? 'inline-block' : 'none';
            }
            
            // 渲染
            document.getElementById('target-review-tbody').innerHTML = SwapReviewTemplate.renderTargetRows(list);
        } catch(e) {
            console.error(e);
            document.getElementById('target-review-tbody').innerHTML = '<tr><td colspan="6" class="text-danger text-center">載入失敗</td></tr>';
        }
    }

    async loadManagerRequests() {
        try {
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            
            const badge = document.getElementById('badge-manager-count');
            if(badge) {
                badge.textContent = list.length;
                badge.style.display = list.length ? 'inline-block' : 'none';
            }

            document.getElementById('manager-review-tbody').innerHTML = SwapReviewTemplate.renderManagerRows(list);
        } catch(e) { console.error(e); }
    }

    // --- 操作邏輯 ---

    async handleTargetReview(id, action) {
        const actionText = action === 'agree' ? '同意' : '拒絕';
        if(!confirm(`確定要 ${actionText} 嗎？`)) return;

        try {
            await SwapService.reviewByTarget(id, action);
            // 成功後重新整理該區塊
            this.loadTargetRequests();
        } catch (e) { alert("操作失敗: " + e.message); }
    }

    async handleManagerReview(id, action) {
        const actionText = action === 'approve' ? '核准' : '駁回';
        const msg = action === 'approve' ? '確定核准？\n系統將自動修改當月班表，且無法復原。' : '確定駁回？';
        
        if(!confirm(msg)) return;

        try {
            // 為了確保資料完整，我們重新抓取該筆 Request (內含 year, month 等資訊)
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            const req = list.find(r => r.id === id);
            
            if (!req) {
                alert("找不到該申請單，可能已被其他管理員處理。");
                this.loadManagerRequests();
                return;
            }

            await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
            
            alert(`已${actionText}！`);
            this.loadManagerRequests();
        } catch (e) {
            console.error(e);
            alert("操作失敗: " + e.message);
        }
    }
}
