import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { SwapApplyTemplate } from "./templates/SwapApplyTemplate.js";

export class SwapApplyPage {
    constructor() {
        this.realUser = null;      // 真正登入者 (管理員)
        this.currentUser = null;   // 當前操作身份 (可能是模擬的)
        this.targetUnitId = null;  // 當前操作單位
        
        this.pendingSwaps = [];    // 換班購物車
        this.tempSource = null;    // 暫存來源
        this.isImpersonating = false; 
    }

    async render() {
        return SwapApplyTemplate.renderLayout();
    }

    async afterRender() {
        // 1. 身分驗證
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.realUser = authService.getProfile();
        
        if (!this.realUser) {
            alert("請先登入");
            return;
        }

        // 預設為本人
        this.currentUser = this.realUser;
        this.targetUnitId = this.realUser.unitId;
        window.routerPage = this;

        // 2. 權限判斷 (參考提交預班的寫法)
        const role = this.realUser.role;
        const originalRole = this.realUser.originalRole;
        const allowedRoles = ['system_admin', 'unit_manager', 'unit_scheduler'];
        const isAdmin = allowedRoles.includes(role) || allowedRoles.includes(originalRole);

        // 若是管理員，初始化模擬器
        if (isAdmin) {
            await this.initAdminSimulator();
        }

        // 3. 初始化頁面資料
        this.initPageData();

        // 4. 事件綁定
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-load-grid').addEventListener('click', () => this.loadGrid());
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitSwap());
        
        const reasonSelect = document.getElementById('swap-reason-select');
        reasonSelect.addEventListener('change', (e) => {
            const textInput = document.getElementById('swap-reason-text');
            if(textInput) textInput.style.display = e.target.value === '其他' ? 'block' : 'none';
        });
    }

    // --- 管理員模擬功能 (參考 PreScheduleSubmitPage) ---
    async initAdminSimulator() {
        const adminSection = document.getElementById('admin-impersonate-section');
        if (!adminSection) return;

        // 顯示管理區塊
        adminSection.style.display = 'block';

        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btnImpersonate = document.getElementById('btn-impersonate');

        // A. 載入單位
        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">選擇單位</option>` + 
                units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) { console.error(e); }

        // B. 單位切換 -> 載入人員
        unitSelect.addEventListener('change', async () => {
            const uid = unitSelect.value;
            userSelect.innerHTML = '<option>載入中...</option>';
            userSelect.disabled = true;
            btnImpersonate.disabled = true;

            if(!uid) {
                userSelect.innerHTML = '<option value="">選擇人員</option>';
                return;
            }

            try {
                const staff = await userService.getUnitStaff(uid);
                userSelect.innerHTML = `<option value="">選擇人員</option>` + 
                    staff.map(s => `<option value="${s.uid}">${s.name} (${s.id||''})</option>`).join('');
                userSelect.disabled = false;
            } catch(e) { console.error(e); }
        });

        // C. 啟用按鈕
        userSelect.addEventListener('change', () => {
            btnImpersonate.disabled = !userSelect.value;
        });

        // D. 執行切換
        btnImpersonate.addEventListener('click', () => this.handleImpersonate());

        // E. 綁定退出 (動態元素)
        document.addEventListener('click', (e) => {
            if(e.target && e.target.id === 'btn-exit-impersonate') {
                this.exitImpersonation();
            }
        });
    }

    handleImpersonate() {
        const userSelect = document.getElementById('admin-user-select');
        const unitSelect = document.getElementById('admin-unit-select');
        
        const targetUid = userSelect.value;
        const targetUnitId = unitSelect.value;
        const targetName = userSelect.options[userSelect.selectedIndex].text.split(' ')[0]; // 簡單取名

        if(!targetUid) return;

        // 切換身分
        this.isImpersonating = true;
        this.targetUnitId = targetUnitId;
        this.currentUser = {
            uid: targetUid,
            name: targetName,
            unitId: targetUnitId,
            role: 'nurse' // 模擬為一般人員
        };

        this.updateImpersonationUI();
        this.initPageData(); // 重載資料
        alert(`已切換身分，正在模擬：${this.currentUser.name}`);
    }

    exitImpersonation() {
        this.isImpersonating = false;
        this.currentUser = this.realUser;
        this.targetUnitId = this.realUser.unitId;
        
        this.updateImpersonationUI();
        this.initPageData();
        alert("已退出模擬，恢復管理者身分");
    }

    updateImpersonationUI() {
        const statusSpan = document.getElementById('impersonation-status');
        const nameSpan = document.getElementById('current-impersonating-name');
        
        if (this.isImpersonating) {
            statusSpan.style.display = 'inline-flex';
            nameSpan.textContent = this.currentUser.name;
        } else {
            statusSpan.style.display = 'none';
            // 重置選單
            document.getElementById('admin-unit-select').value = '';
            document.getElementById('admin-user-select').innerHTML = '<option value="">選擇人員</option>';
            document.getElementById('admin-user-select').disabled = true;
            document.getElementById('btn-impersonate').disabled = true;
        }
    }

    // --- 資料初始化與重置 ---
    initPageData() {
        // 重置 UI
        document.getElementById('swap-workspace').style.display = 'none';
        this.pendingSwaps = [];
        this.tempSource = null;
        this.updateSwapListUI();

        // 載入該身分的資料
        this.loadScheduleList();
        this.loadMyHistory();
    }

    // --- 載入歷史紀錄 ---
    async loadMyHistory() {
        const tbody = document.getElementById('history-tbody');
        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> 載入紀錄中...</td></tr>';
        
        // 關鍵：使用 this.currentUser.uid (會隨模擬而變)
        const list = await SwapService.getMyAppliedRequests(this.currentUser.uid);
        if(tbody) tbody.innerHTML = SwapApplyTemplate.renderHistoryRows(list);
    }

    // --- 載入班表選單 ---
    async loadScheduleList() {
        const select = document.getElementById('schedule-select');
        select.innerHTML = '<option>載入中...</option>';
        try {
            const year = new Date().getFullYear();
            const month = new Date().getMonth() + 1;
            const schedules = [];
            
            // 抓取本月與下月
            const s1 = await ScheduleService.getSchedule(this.targetUnitId, year, month);
            if(s1 && s1.status === 'published') schedules.push(s1);
            
            let nextY = year, nextM = month + 1;
            if(nextM > 12) { nextM = 1; nextY++; }
            const s2 = await ScheduleService.getSchedule(this.targetUnitId, nextY, nextM);
            if(s2 && s2.status === 'published') schedules.push(s2);

            if(schedules.length === 0) {
                select.innerHTML = '<option value="">該單位無可用的已發布班表</option>';
                return;
            }
            select.innerHTML = schedules.map(s => `<option value="${s.year}-${s.month}">${s.year}年 ${s.month}月</option>`).join('');
        } catch(e) { console.error(e); select.innerHTML = '<option>載入失敗</option>'; }
    }

    // --- 載入班表矩陣 ---
    async loadGrid() {
        const val = document.getElementById('schedule-select').value;
        if(!val) return alert("請先選擇班表");
        
        const [y, m] = val.split('-');
        this.currentYear = parseInt(y);
        this.currentMonth = parseInt(m);

        document.getElementById('swap-workspace').style.display = 'block';
        
        this.pendingSwaps = [];
        this.tempSource = null;
        this.updateSwapListUI();

        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '<div class="text-center p-5"><span class="spinner-border text-primary"></span> 載入班表中...</div>';

        try {
            const [schedule, staff] = await Promise.all([
                ScheduleService.getSchedule(this.targetUnitId, this.currentYear, this.currentMonth),
                userService.getUnitStaff(this.targetUnitId)
            ]);
            
            // 傳入 currentUser 以便標示 "我"
            const html = SwapApplyTemplate.renderMatrix(schedule, staff, this.currentUser, this.currentYear, this.currentMonth);
            container.innerHTML = html;

        } catch (e) {
            container.innerHTML = `<div class="alert alert-danger">載入失敗: ${e.message}</div>`;
        }
    }

    // --- 點擊互動邏輯 ---
    handleCellClick(cell, clickable) {
        if (!clickable) return;
        const uid = cell.dataset.uid;
        const day = parseInt(cell.dataset.day);
        const shift = cell.dataset.shift;
        const name = cell.dataset.name;
        const dateStr = cell.dataset.date;

        if (uid === this.currentUser.uid) {
            this.tempSource = { uid, day, shift, name, dateStr };
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
            cell.classList.add('bg-primary', 'text-white');
        } else {
            if (!this.tempSource) return alert(`請先點選 ${this.currentUser.name} (模擬中) 的班別`);
            if (this.tempSource.day !== day) return alert("限同日換班");
            
            this.addSwapToList({
                source: this.tempSource,
                target: { uid, day, shift, name, dateStr }
            });
            this.tempSource = null;
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
        }
    }

    addSwapToList(pair) {
        this.pendingSwaps.push({ ...pair.source, target: pair.target });
        this.updateSwapListUI();
    }

    removeSwapFromList(idx) {
        this.pendingSwaps.splice(idx, 1);
        this.updateSwapListUI();
    }

    updateSwapListUI() {
        const container = document.getElementById('swap-list-container');
        const countBadge = document.getElementById('swap-count-badge');
        const btn = document.getElementById('btn-submit-swap');

        countBadge.textContent = `${this.pendingSwaps.length} 筆`;
        btn.disabled = this.pendingSwaps.length === 0;
        
        container.innerHTML = SwapApplyTemplate.renderSwapListItems(this.pendingSwaps);
    }

    // --- 送出申請 ---
    async submitSwap() {
        const reasonType = document.getElementById('swap-reason-select').value;
        const reasonText = document.getElementById('swap-reason-text').value;
        const finalReason = reasonType === '其他' ? `其他：${reasonText}` : reasonType;

        const roleMsg = this.isImpersonating ? `(管理者代為申請：${this.currentUser.name})` : '';
        if (!confirm(`確定送出 ${this.pendingSwaps.length} 筆申請？\n${roleMsg}`)) return;

        const btn = document.getElementById('btn-submit-swap');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 處理中...';

        try {
            const promises = this.pendingSwaps.map(item => {
                return SwapService.createSwapRequest({
                    unitId: this.targetUnitId,
                    year: this.currentYear,
                    month: this.currentMonth,
                    requesterId: this.currentUser.uid,
                    requesterName: this.currentUser.name,
                    requesterDate: item.dateStr,
                    requesterShift: item.shift,
                    targetUserId: item.target.uid, 
                    targetUserName: item.target.name,
                    targetDate: item.target.dateStr,
                    targetShift: item.target.shift,
                    reason: finalReason,
                    // 紀錄是否為代操作
                    createdByAdmin: this.isImpersonating ? this.realUser.uid : null
                });
            });

            await Promise.all(promises);
            alert("✅ 申請已送出！");
            
            this.initPageData(); // 重置與重載
            
        } catch (e) { alert("失敗: " + e.message); }
        finally {
            btn.disabled = this.pendingSwaps.length === 0;
            btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> 提交申請';
        }
    }
}
