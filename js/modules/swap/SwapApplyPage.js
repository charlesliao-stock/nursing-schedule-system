import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { SwapApplyTemplate } from "./templates/SwapApplyTemplate.js";

export class SwapApplyPage {
    constructor() {
        this.realUser = null;      // 真正登入的管理者
        this.currentUser = null;   // 目前模擬的身分 (預設等於 realUser)
        this.targetUnitId = null;  // 目前操作的單位 ID
        
        this.pendingSwaps = [];    // 換班購物車
        this.tempSource = null;    // 暫存點擊來源
        this.isImpersonating = false; // 是否正在模擬中
    }

    async render() {
        return SwapApplyTemplate.renderLayout();
    }

    async afterRender() {
        // 1. 身分驗證與初始化
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.realUser = authService.getProfile();
        
        if (!this.realUser) {
            alert("請先登入");
            return;
        }

        // 預設身分與單位
        this.currentUser = this.realUser;
        this.targetUnitId = this.realUser.unitId;
        window.routerPage = this;

        // 2. 判斷是否為管理者，若是則載入模擬器
        const role = this.realUser.role;
        const isAdmin = ['system_admin', 'unit_manager', 'unit_scheduler'].includes(role);
        
        if (isAdmin) {
            await this.initAdminSimulator();
        }

        // 3. 載入頁面資料 (依據當前的 currentUser)
        this.initPageData();

        // 4. 事件綁定
        document.getElementById('btn-load-grid').addEventListener('click', () => this.loadGrid());
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitSwap());
        
        const reasonSelect = document.getElementById('swap-reason-select');
        reasonSelect.addEventListener('change', (e) => {
            const textInput = document.getElementById('swap-reason-text');
            if(textInput) textInput.style.display = e.target.value === '其他' ? 'block' : 'none';
        });
    }

    // --- 管理者模擬功能 ---
    async initAdminSimulator() {
        const adminSection = document.getElementById('admin-impersonate-section');
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btnImpersonate = document.getElementById('btn-impersonate');
        
        // 顯示管理區塊
        if(adminSection) adminSection.style.display = 'block';

        // A. 載入所有單位
        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">請選擇單位</option>` + 
                units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) { console.error("載入單位失敗", e); }

        // B. 單位切換時 -> 載入該單位人員
        unitSelect.addEventListener('change', async () => {
            const uid = unitSelect.value;
            userSelect.innerHTML = '<option>載入中...</option>';
            userSelect.disabled = true;
            btnImpersonate.disabled = true;

            if(!uid) {
                userSelect.innerHTML = '<option value="">請先選擇單位</option>';
                return;
            }

            try {
                const staff = await userService.getUnitStaff(uid);
                userSelect.innerHTML = `<option value="">請選擇人員</option>` + 
                    staff.map(s => `<option value="${s.uid}">${s.name} (${s.id||''})</option>`).join('');
                userSelect.disabled = false;
            } catch(e) { console.error(e); }
        });

        userSelect.addEventListener('change', () => {
            btnImpersonate.disabled = !userSelect.value;
        });

        // C. 執行切換身分
        btnImpersonate.addEventListener('click', async () => {
            const targetUid = userSelect.value;
            const targetUnitId = unitSelect.value;
            const targetName = userSelect.options[userSelect.selectedIndex].text;

            if(!targetUid) return;

            // 切換身分狀態
            this.isImpersonating = true;
            this.targetUnitId = targetUnitId;
            
            // 模擬一個 User 物件 (只需包含必要欄位)
            this.currentUser = {
                uid: targetUid,
                name: targetName.split(' ')[0], // 去掉職編只留名字
                unitId: targetUnitId,
                role: 'nurse' // 模擬為一般人員
            };

            // UI 更新
            this.updateImpersonationUI();
            
            // 重載資料
            alert(`已切換身分，正在模擬：${this.currentUser.name}`);
            this.initPageData();
        });

        // D. 綁定退出按鈕 (動態生成的)
        document.addEventListener('click', (e) => {
            if(e.target && e.target.id === 'btn-exit-impersonate') {
                this.exitImpersonation();
            }
        });
    }

    exitImpersonation() {
        this.isImpersonating = false;
        this.currentUser = this.realUser;
        this.targetUnitId = this.realUser.unitId;
        
        this.updateImpersonationUI();
        alert("已退出模擬，恢復管理者身分");
        this.initPageData();
    }

    updateImpersonationUI() {
        const statusDiv = document.getElementById('impersonation-status');
        const nameSpan = document.getElementById('current-impersonating-name');
        const container = document.getElementById('admin-impersonate-section');

        if (this.isImpersonating) {
            statusDiv.style.display = 'block';
            nameSpan.textContent = this.currentUser.name;
            container.classList.add('border-warning');
            container.style.backgroundColor = '#fff3cd'; // 黃色背景提示
        } else {
            statusDiv.style.display = 'none';
            container.classList.remove('border-warning');
            container.style.backgroundColor = '';
            // 重置選單
            document.getElementById('admin-unit-select').value = '';
            document.getElementById('admin-user-select').innerHTML = '<option value="">請先選擇單位</option>';
            document.getElementById('admin-user-select').disabled = true;
            document.getElementById('btn-impersonate').disabled = true;
        }
    }

    // --- 資料載入與重置 ---
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> 載入紀錄中...</td></tr>';
        
        // 這裡會使用 this.currentUser (可能是模擬的人)
        const list = await SwapService.getMyAppliedRequests(this.currentUser.uid);
        tbody.innerHTML = SwapApplyTemplate.renderHistoryRows(list);
    }

    // --- 載入班表選單 ---
    async loadScheduleList() {
        const select = document.getElementById('schedule-select');
        select.innerHTML = '<option>載入中...</option>';
        try {
            const year = new Date().getFullYear();
            const month = new Date().getMonth() + 1;
            const schedules = [];
            
            // 讀取 this.targetUnitId (模擬時會變更)
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

    // --- 點擊與互動邏輯 (完全依賴 this.currentUser) ---
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
                    // 申請人是 "目前的模擬身分"
                    requesterId: this.currentUser.uid,
                    requesterName: this.currentUser.name,
                    requesterDate: item.dateStr,
                    requesterShift: item.shift,
                    
                    targetUserId: item.target.uid,
                    targetUserName: item.target.name,
                    targetDate: item.target.dateStr,
                    targetShift: item.target.shift,
                    
                    reason: finalReason,
                    // 標註是由管理者代操作 (Optional)
                    createdByAdmin: this.isImpersonating ? this.realUser.uid : null
                });
            });

            await Promise.all(promises);
            alert("✅ 申請已送出！");
            
            this.pendingSwaps = [];
            this.updateSwapListUI();
            this.loadMyHistory(); 
            this.loadGrid(); // 刷新表格
            
        } catch (e) { alert("失敗: " + e.message); }
        finally {
            btn.disabled = this.pendingSwaps.length === 0;
            btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> 提交申請';
        }
    }
}
