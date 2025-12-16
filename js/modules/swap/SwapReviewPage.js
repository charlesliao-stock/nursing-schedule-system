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
        const role = this.currentUser?.role;
        const isManager = ['unit_manager', 'unit_scheduler', 'system_admin'].includes(role);
        
        return SwapReviewTemplate.renderLayout(isManager);
    }

    async afterRender() {
        window.routerPage = this;

        // 1. 等待身分載入
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { 
            await new Promise(r => setTimeout(r, 200)); 
            retries++; 
        }
        this.currentUser = authService.getProfile();

        if (!this.currentUser) {
            document.querySelector('.container-fluid').innerHTML = '<div class="alert alert-danger m-4">請先登入系統</div>';
            return;
        }

        console.log("【SwapReview】目前使用者:", this.currentUser.uid, this.currentUser.name);

        // 2. 綁定重新整理按鈕 (新增功能)
        const refreshBtn = document.getElementById('btn-refresh-reviews');
        if(refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTargetReviews();
                if(['unit_manager', 'unit_scheduler', 'system_admin'].includes(this.currentUser.role)) {
                    this.loadManagerReviews();
                }
                alert("已重新載入資料");
            });
        }

        // 3. 載入資料
        await this.loadTargetReviews();

        // 4. 載入管理者資料
        const role = this.currentUser.role;
        if (['unit_manager', 'unit_scheduler', 'system_admin'].includes(role)) {
            const mgrSection = document.getElementById('manager-section');
            if(mgrSection) mgrSection.style.display = 'block';
            await this.loadManagerReviews();
        }
    }

    // --- A. 個人審核 (我是被換班者) ---
    async loadTargetReviews() {
        const tbody = document.getElementById('target-review-tbody');
        if(!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';

        try {
            console.log("【SwapReview】正在載入個人待審資料 (Target)...");
            
            // 使用 getUserRequests 抓取所有相關資料
            const allRequests = await SwapService.getUserRequests(this.currentUser.uid);
            
            // 過濾：我是 Target 且 狀態是 pending_target
            // 注意：這裡同時檢查 targetUserId 與 targetId 以防舊資料問題
            const list = allRequests.filter(r => {
                const isTarget = (r.targetUserId === this.currentUser.uid) || (r.targetId === this.currentUser.uid);
                return isTarget && r.status === 'pending_target';
            });
            
            console.log("【SwapReview】個人待審筆數:", list.length);

            // 更新紅點通知
            this.updateBadge('badge-target-count', list.length);

            // 渲染列表
            tbody.innerHTML = SwapReviewTemplate.renderTargetRows(list);

        } catch (e) { 
            console.error("【SwapReview】載入失敗:", e);
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">載入失敗: ${e.message}</td></tr>`;
        }
    }

    // --- B. 管理者審核 ---
    async loadManagerReviews() {
        const tbody = document.getElementById('manager-review-tbody');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';

        try {
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            this.updateBadge('badge-manager-count', list.length);
            tbody.innerHTML = SwapReviewTemplate.renderManagerRows(list);
        } catch (e) { 
            console.error(e); 
            tbody.innerHTML = '<tr><td colspan="6" class="text-danger text-center">載入失敗</td></tr>';
        }
    }

    updateBadge(id, count) {
        const badge = document.getElementById(id);
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
                badge.classList.add('animate__animated', 'animate__pulse', 'animate__infinite');
            } else {
                badge.style.display = 'none';
                badge.classList.remove('animate__animated');
            }
        }
    }

    // --- C. 操作動作 ---
    async handleTargetReview(id, action) {
        const actionText = action === 'agree' ? '同意' : '拒絕';
        if(!confirm(`確定要 ${actionText} 此換班申請嗎？`)) return;

        try {
            await SwapService.reviewByTarget(id, action);
            alert(`已${actionText}`);
            this.loadTargetReviews(); // 重刷列表
        } catch (e) { alert("操作失敗: " + e.message); }
    }

    async handleManagerReview(id, action) {
        const msg = action === 'approve' ? '確定核准？\n系統將自動修改當月班表。' : '確定駁回？';
        if(!confirm(msg)) return;

        try {
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            const req = list.find(r => r.id === id);
            
            if (!req) {
                alert("資料過期，請重新整理");
                this.loadManagerReviews();
                return;
            }

            await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
            alert("處理完成");
            this.loadManagerReviews();
        } catch (e) { alert("操作失敗: " + e.message); }
    }
}
