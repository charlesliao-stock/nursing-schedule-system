import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { SwapApplyTemplate } from "./templates/SwapApplyTemplate.js"; // 需建立/更新 Template

export class SwapApplyPage {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null;
        this.pendingSwaps = [];
        this.tempSource = null;
    }

    async render() {
        // 使用 Template 渲染 HTML (包含下方的歷史紀錄區)
        return SwapApplyTemplate.renderLayout();
    }

    async afterRender() {
        // 1. 身分驗證與初始化
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.currentUser = authService.getProfile();
        if (!this.currentUser) return;

        this.targetUnitId = this.currentUser.unitId;
        window.routerPage = this;

        // 2. 載入班表選單
        this.loadScheduleList();
        
        // 3. 載入我的申請紀錄 (確認有無留底)
        this.loadMyHistory();

        // 4. 事件綁定
        document.getElementById('btn-load-grid').addEventListener('click', () => this.loadGrid());
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitSwap());
        
        const reasonSelect = document.getElementById('swap-reason-select');
        reasonSelect.addEventListener('change', (e) => {
            document.getElementById('swap-reason-text').style.display = e.target.value === '其他' ? 'block' : 'none';
        });
    }

    // --- 歷史紀錄 (確認用) ---
    async loadMyHistory() {
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">載入中...</td></tr>';
        
        const list = await SwapService.getMyAppliedRequests(this.currentUser.uid);
        tbody.innerHTML = SwapApplyTemplate.renderHistoryRows(list);
    }

    // --- 班表載入與選取邏輯 (維持前版邏輯) ---
    async loadScheduleList() { /* ...同前版... */ }
    async loadGrid() { /* ...同前版... */ }
    renderMatrix(schedule, staffList) { /* ...同前版 (使用 Template 輔助) ... */ }
    
    handleCellClick(cell, clickable) {
        if (!clickable) return;
        const uid = cell.dataset.uid;
        const day = parseInt(cell.dataset.day);
        const shift = cell.dataset.shift;
        const name = cell.dataset.name;
        const dateStr = cell.dataset.date;

        if (uid === this.currentUser.uid) {
            this.tempSource = { uid, day, shift, name, dateStr };
            // UI Highlight
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
            cell.classList.add('bg-primary', 'text-white');
        } else {
            if (!this.tempSource) return alert("請先選您的班");
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
        
        // 使用 Template 渲染購物車
        container.innerHTML = SwapApplyTemplate.renderSwapListItems(this.pendingSwaps);
    }

    // --- 提交 ---
    async submitSwap() {
        const reasonType = document.getElementById('swap-reason-select').value;
        const reasonText = document.getElementById('swap-reason-text').value;
        const finalReason = reasonType === '其他' ? `其他：${reasonText}` : reasonType;

        if (!confirm(`確定送出 ${this.pendingSwaps.length} 筆申請？`)) return;

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
                    targetUserId: item.target.uid, // 關鍵欄位
                    targetUserName: item.target.name,
                    targetDate: item.target.dateStr,
                    targetShift: item.target.shift,
                    reason: finalReason
                });
            });

            await Promise.all(promises);
            alert("申請已送出！請查看下方紀錄。");
            
            // 清空與重整
            this.pendingSwaps = [];
            this.updateSwapListUI();
            this.loadMyHistory(); // 立即刷新下方紀錄，讓使用者安心
            
        } catch (e) { alert("失敗: " + e.message); }
    }
}
