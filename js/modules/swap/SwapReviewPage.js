import { SwapService } from "../../services/firebase/SwapService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { SwapReviewTemplate } from "./templates/SwapReviewTemplate.js"; 

export class SwapReviewPage {
    constructor() {
        this.realUser = null;
        this.currentUser = null;
        this.isImpersonating = false;
    }

    async render() {
        this.realUser = authService.getProfile();
        const role = this.realUser?.role;
        const isManager = ['unit_manager', 'unit_scheduler', 'system_admin'].includes(role);
        return SwapReviewTemplate.renderLayout(isManager);
    }

    async afterRender() {
        window.routerPage = this;
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.realUser = authService.getProfile();
        if (!this.realUser) return;

        this.currentUser = this.realUser;

        const role = this.realUser.role;
        const isManager = ['unit_manager', 'unit_scheduler', 'system_admin'].includes(role);

        // 1. 若是管理者，初始化模擬器
        if (isManager) {
            await this.initAdminSimulator();
            document.getElementById('manager-section').style.display = 'block';
            this.loadManagerReviews();
        }

        // 2. 載入個人待審 (此時 currentUser = realUser)
        this.loadTargetReviews();

        document.getElementById('btn-refresh').addEventListener('click', () => {
            this.loadTargetReviews();
            if(isManager) this.loadManagerReviews();
        });
    }

    // --- 模擬器邏輯 (複製自 ApplyPage) ---
    async initAdminSimulator() {
        const section = document.getElementById('admin-impersonate-section');
        if(section) section.style.display = 'block';

        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) {}

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.disabled = true; userSelect.innerHTML = '<option>載入中...</option>';
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">人員</option>` + staff.map(s => `<option value="${s.uid}">${s.name}</option>`).join('');
            userSelect.disabled = false;
        });

        userSelect.addEventListener('change', () => btn.disabled = !userSelect.value);

        btn.addEventListener('click', () => {
            const uid = userSelect.value;
            const name = userSelect.options[userSelect.selectedIndex].text;
            this.currentUser = { uid, name, unitId: unitSelect.value }; // 切換身分
            this.isImpersonating = true;
            
            document.getElementById('impersonation-status').style.display = 'inline-block';
            document.getElementById('current-impersonating-name').textContent = name;
            
            this.loadTargetReviews(); // 重載資料 (關鍵！)
            alert(`已切換視角：${name}`);
        });

        document.getElementById('btn-exit-impersonate').addEventListener('click', () => {
            this.isImpersonating = false;
            this.currentUser = this.realUser;
            document.getElementById('impersonation-status').style.display = 'none';
            this.loadTargetReviews();
            alert("已恢復管理者視角");
        });
    }

    // --- 資料載入 ---
    async loadTargetReviews() {
        const tbody = document.getElementById('target-review-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center"><span class="spinner-border spinner-border-sm"></span></td></tr>';
        
        // 關鍵：這裡使用的是 this.currentUser.uid (會隨模擬改變)
        const list = await SwapService.getIncomingRequests(this.currentUser.uid);
        
        const badge = document.getElementById('badge-target-count');
        if(list.length > 0) {
            badge.textContent = list.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
        
        tbody.innerHTML = SwapReviewTemplate.renderTargetRows(list);
    }

    async loadManagerReviews() {
        const list = await SwapService.getManagerPendingRequests(this.realUser.unitId);
        const badge = document.getElementById('badge-manager-count');
        if(list.length > 0) {
            badge.textContent = list.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
        document.getElementById('manager-review-tbody').innerHTML = SwapReviewTemplate.renderManagerRows(list);
    }

    // --- 操作 ---
    async handleTargetReview(id, action) {
        if(!confirm(action==='agree'?'同意換班？':'拒絕？')) return;
        await SwapService.reviewByTarget(id, action);
        this.loadTargetReviews();
    }

    async handleManagerReview(id, action) {
        if(!confirm(action==='approve'?'核准並修改班表？':'駁回？')) return;
        
        // 重新抓取資料以確保正確
        const list = await SwapService.getManagerPendingRequests(this.realUser.unitId);
        const req = list.find(r => r.id === id);
        if(req) {
            await SwapService.reviewByManager(id, action, this.realUser.uid, req);
            this.loadManagerReviews();
        } else {
            alert("資料已過期");
            this.loadManagerReviews();
        }
    }
}
