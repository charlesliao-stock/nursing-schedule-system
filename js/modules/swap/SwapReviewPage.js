import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; 

export class SwapReviewPage {
    constructor() {
        this.currentUser = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        return SwapReviewTemplate.renderLayout(false); // 預設 Layout
    }

    async afterRender() {
        window.routerPage = this;

        // 1. 等待登入資訊
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

        console.log("目前登入者:", this.currentUser.name, "UID:", this.currentUser.uid);

        // 2. 判斷是否為管理者
        const role = this.currentUser.role;
        const isManager = (role === 'unit_manager' || role === 'unit_scheduler' || role === 'system_admin');
        
        // 更新 Layout 顯示管理者區塊
        if(isManager) {
            document.querySelector('.container-fluid').innerHTML = SwapReviewTemplate.renderLayout(true);
        }

        // 3. 載入資料
        await this.loadTargetRequests();

        if (isManager) {
            await this.loadManagerRequests();
        }
    }

    async loadTargetRequests() {
        const tbody = document.getElementById('target-review-tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> 載入中...</td></tr>';

        try {
            // 抓取所有我是 Target 的
            const allMyRequests = await SwapService.getUserRequests(this.currentUser.uid);
            
            console.log("從資料庫抓到的原始資料 (MyRequests):", allMyRequests);

            // 過濾：狀態必須是 pending_target
            const list = allMyRequests.filter(r => r.status === 'pending_target');
            
            console.log("過濾後待審核清單:", list);

            const badge = document.getElementById('badge-target-count');
            if(badge) {
                badge.textContent = list.length;
                badge.style.display = list.length ? 'inline-block' : 'none';
            }
            
            // 渲染
            tbody.innerHTML = SwapReviewTemplate.renderTargetRows(list);

        } catch(e) { 
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-danger text-center">載入失敗: ' + e.message + '</td></tr>';
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

    // --- 操作 ---

    async handleTargetReview(id, action) {
        if(!confirm(action === 'agree' ? '同意換班？' : '拒絕此申請？')) return;
        try {
            await SwapService.reviewByTarget(id, action);
            this.loadTargetRequests(); 
        } catch (e) { alert("操作失敗: " + e.message); }
    }

    async handleManagerReview(id, action) {
        if(!confirm(action === 'approve' ? '確定核准並修改班表？' : '確定駁回？')) return;

        try {
            // 重抓一次確保資料最新
            const list = await SwapService.getManagerPendingRequests(this.currentUser.unitId);
            const req = list.find(r => r.id === id);
            
            if (!req) {
                alert("找不到該申請單，可能已被處理。");
                this.loadManagerRequests();
                return;
            }

            await SwapService.reviewByManager(id, action, this.currentUser.uid, req);
            alert("已完成");
            this.loadManagerRequests();
        } catch (e) { 
            console.error(e);
            alert("操作失敗: " + e.message); 
        }
    }
}
