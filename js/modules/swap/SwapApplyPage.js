import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";

export class SwapApplyPage {
    constructor() {
        this.realUser = null;
        this.currentUser = null;
        this.targetUnitId = null;
        this.isAdminMode = false;

        this.currentSchedule = null;
        this.staffList = [];
        
        // 換班暫存清單 (購物車概念)
        this.pendingSwaps = []; 
        // 暫存當前點選的來源 (我的班)
        this.tempSource = null; 

        // 換班理由選項
        this.reasonOptions = ['單位人力調整', '公假', '病假', '喪假', '支援', '個人因素', '其他'];
    }

    async render() {
        // 產生理由下拉選單的 HTML
        const reasonOptionsHtml = this.reasonOptions.map(r => `<option value="${r}">${r}</option>`).join('');

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3><i class="fas fa-exchange-alt text-primary me-2"></i>申請換班 (多筆)</h3>
                </div>

                <div id="admin-impersonate-section" class="card shadow-sm mb-4 border-left-danger" style="display:none;">
                    <div class="card-body py-2">
                        <div class="d-flex align-items-center gap-2">
                            <label class="fw-bold text-danger">管理員模式：</label>
                            <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">選擇單位</option></select>
                            <select id="admin-user-select" class="form-select form-select-sm w-auto"><option value="">選擇人員</option></select>
                            <button id="btn-impersonate" class="btn btn-danger btn-sm">切換身分</button>
                        </div>
                    </div>
                </div>

                <div id="step-select-schedule" class="card shadow mb-3">
                    <div class="card-body d-flex align-items-center gap-3">
                        <label class="fw-bold">選擇已發布班表：</label>
                        <select id="schedule-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-load-grid" class="btn btn-primary">
                            <i class="fas fa-table me-1"></i> 載入班表
                        </button>
                    </div>
                </div>

                <div id="swap-workspace" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-3">
                                <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                    <div class="small text-muted">
                                        <i class="fas fa-info-circle me-1"></i>
                                        操作：1.點選<span class="badge bg-primary">您的班</span> 2.點選該日<span class="badge bg-success">對方的班</span> (限同日互換)
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div id="schedule-grid-container" class="table-responsive" style="max-height: 70vh;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow border-left-primary h-100">
                                <div class="card-header bg-primary text-white fw-bold d-flex justify-content-between">
                                    <span>換班申請單</span>
                                    <span class="badge bg-white text-primary" id="swap-count-badge">0 筆</span>
                                </div>
                                <div class="card-body d-flex flex-column">
                                    
                                    <div class="flex-grow-1 mb-3 overflow-auto" style="max-height: 300px;">
                                        <ul class="list-group" id="swap-list-container">
                                            <li class="list-group-item text-center text-muted py-4">
                                                尚未選擇任何換班<br>請在左側點選日期加入
                                            </li>
                                        </ul>
                                    </div>

                                    <hr>

                                    <div class="mb-3">
                                        <label class="form-label small fw-bold">換班理由 (必填)</label>
                                        <select id="swap-reason-select" class="form-select form-select-sm mb-2">
                                            ${reasonOptionsHtml}
                                        </select>
                                        <input type="text" id="swap-reason-text" class="form-control form-control-sm" placeholder="請輸入其他理由..." style="display:none;">
                                    </div>

                                    <button id="btn-submit-swap" class="btn btn-success w-100" disabled>
                                        <i class="fas fa-paper-plane me-1"></i> 提交申請
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.realUser = authService.getProfile();
        if (!this.realUser) return;

        window.routerPage = this;

        // 管理員判斷
        if (this.realUser.role === 'system_admin' || this.realUser.originalRole === 'system_admin') {
            this.isAdminMode = true;
            this.setupAdminUI();
        } else {
            this.targetUnitId = this.realUser.unitId;
            this.currentUser = this.realUser;
            if(this.targetUnitId) this.loadScheduleList();
            else alert("未綁定單位");
        }

        document.getElementById('btn-load-grid').addEventListener('click', () => this.loadGrid());
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitSwap());
        
        // 理由連動
        const reasonSelect = document.getElementById('swap-reason-select');
        reasonSelect.addEventListener('change', (e) => {
            const input = document.getElementById('swap-reason-text');
            input.style.display = e.target.value === '其他' ? 'block' : 'none';
        });
    }

    // --- Admin Logic (省略細節，保持原樣) ---
    async setupAdminUI() {
        document.getElementById('admin-impersonate-section').style.display = 'block';
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        const units = await UnitService.getAllUnits();
        unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', async () => {
            const uid = userSelect.value;
            if(!uid) return;
            this.currentUser = await userService.getUserData(uid);
            this.targetUnitId = unitSelect.value;
            this.loadScheduleList();
            document.getElementById('swap-workspace').style.display = 'none';
        });
    }

    // --- Step 1: 載入可用班表 ---
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
                select.innerHTML = '<option value="">無可換班的已發布班表</option>';
                return;
            }
            select.innerHTML = schedules.map(s => `<option value="${s.year}-${s.month}">${s.year}年 ${s.month}月</option>`).join('');
        } catch(e) { console.error(e); }
    }

    // --- Step 2: 載入矩陣 ---
    async loadGrid() {
        const val = document.getElementById('schedule-select').value;
        if(!val) return alert("請先選擇班表");
        
        const [y, m] = val.split('-');
        this.currentYear = parseInt(y);
        this.currentMonth = parseInt(m);

        document.getElementById('swap-workspace').style.display = 'block';
        
        // 重置狀態
        this.pendingSwaps = [];
        this.tempSource = null;
        this.updateSwapListUI();

        const [schedule, staff] = await Promise.all([
            ScheduleService.getSchedule(this.targetUnitId, this.currentYear, this.currentMonth),
            userService.getUnitStaff(this.targetUnitId)
        ]);
        this.currentSchedule = schedule;
        this.staffList = staff;
        this.renderMatrix(schedule, staff);
    }

    renderMatrix(schedule, staffList) {
        const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
        const assignments = schedule.assignments || {};
        const todayStr = new Date().toISOString().split('T')[0];

        let html = `<table class="table table-bordered table-sm text-center align-middle mb-0" style="font-size: 0.9rem;">`;
        html += `<thead class="table-light sticky-top"><tr><th style="min-width:80px">人員</th>`;
        for(let d=1; d<=daysInMonth; d++) html += `<th style="min-width:35px;">${d}</th>`;
        html += `</tr></thead><tbody>`;

        staffList.forEach(s => {
            const isMe = s.uid === this.currentUser.uid;
            html += `<tr class="${isMe ? 'table-info' : ''}">`;
            html += `<td class="fw-bold text-start ps-2">${s.name}${isMe ? '<span class="badge bg-primary ms-1">我</span>' : ''}</td>`;
            
            const userShifts = assignments[s.uid] || {};
            for(let d=1; d<=daysInMonth; d++) {
                const shift = userShifts[d] || '';
                const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                
                // 過去日期或空班不可點 (視規則而定，這裡假設空班不能換)
                const isPast = dateStr < todayStr;
                const isEmpty = !shift; 
                const clickable = !isPast && !isEmpty;

                html += `<td style="cursor:${clickable?'pointer':'not-allowed'}; opacity:${clickable?'1':'0.5'}" 
                            class="swap-cell" id="cell-${d}-${s.uid}"
                            data-uid="${s.uid}" data-day="${d}" data-shift="${shift}" data-name="${s.name}" data-date="${dateStr}"
                            onclick="window.routerPage.handleCellClick(this, ${clickable})">
                            ${shift}
                        </td>`;
            }
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        document.getElementById('schedule-grid-container').innerHTML = html;
    }

    // --- Step 3: 點選邏輯 (同日換班) ---
    handleCellClick(cell, clickable) {
        if (!clickable) return;

        const uid = cell.dataset.uid;
        const day = parseInt(cell.dataset.day);
        const shift = cell.dataset.shift;
        const name = cell.dataset.name;
        const dateStr = cell.dataset.date;

        // 1. 如果點選的是自己
        if (uid === this.currentUser.uid) {
            // 如果已經在清單中，提示不可重複選同日 (或可設計為取消選取)
            if (this.pendingSwaps.find(s => s.day === day)) {
                return alert("此日期已在換班清單中，若要修改請先刪除。");
            }

            // 設定為暫存來源
            this.tempSource = { uid, day, shift, name, dateStr };
            
            // UI 高亮：清除其他選取，只亮自己與該日期的 column
            this.highlightSource(day, uid);
        } 
        // 2. 如果點選的是別人 (且已選了自己)
        else {
            if (!this.tempSource) {
                return alert("請先點選您自己要換的班別 (藍色區域)。");
            }
            
            // 檢查是否為同一天 (Requirement 2)
            if (this.tempSource.day !== day) {
                return alert("僅限「同一日」互換班別！");
            }

            // 檢查是否換相同的班
            if (this.tempSource.shift === shift) {
                return alert("班別相同，無需交換。");
            }

            // 配對成功 -> 加入清單
            this.addSwapToList({
                source: this.tempSource,
                target: { uid, day, shift, name, dateStr }
            });

            // 重置暫存與 UI
            this.tempSource = null;
            this.clearHighlight();
        }
    }

    highlightSource(day, myUid) {
        // 清除所有高亮
        document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white', 'bg-warning'));
        
        // 高亮我自己點的那格
        const myCell = document.getElementById(`cell-${day}-${myUid}`);
        if(myCell) myCell.classList.add('bg-primary', 'text-white');

        // 提示該日期的其他欄位 (可選目標)
        // document.querySelectorAll(`[data-day="${day}"]`).forEach(c => {
        //     if(c.dataset.uid !== myUid) c.classList.add('bg-light-warning'); 
        // });
    }

    clearHighlight() {
        document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
    }

    // --- Step 4: 清單管理 (Requirement 1) ---
    addSwapToList(pair) {
        // 檢查清單是否已有該日
        const existIdx = this.pendingSwaps.findIndex(s => s.day === pair.source.day);
        if (existIdx >= 0) {
            // 覆蓋舊的
            this.pendingSwaps[existIdx] = { ...pair.source, target: pair.target };
        } else {
            // 新增
            this.pendingSwaps.push({ ...pair.source, target: pair.target });
        }
        this.updateSwapListUI();
    }

    removeSwapFromList(day) {
        this.pendingSwaps = this.pendingSwaps.filter(s => s.day !== day);
        this.updateSwapListUI();
    }

    updateSwapListUI() {
        const container = document.getElementById('swap-list-container');
        const countBadge = document.getElementById('swap-count-badge');
        const btn = document.getElementById('btn-submit-swap');

        countBadge.textContent = `${this.pendingSwaps.length} 筆`;
        btn.disabled = this.pendingSwaps.length === 0;

        if (this.pendingSwaps.length === 0) {
            container.innerHTML = `<li class="list-group-item text-center text-muted py-4">尚未選擇任何換班<br>請在左側點選日期加入</li>`;
            return;
        }

        container.innerHTML = this.pendingSwaps.map(item => `
            <li class="list-group-item position-relative">
                <button class="btn btn-sm btn-outline-danger border-0 position-absolute top-0 end-0 m-1" 
                        onclick="window.routerPage.removeSwapFromList(${item.day})">
                    <i class="fas fa-times"></i>
                </button>
                <div class="fw-bold mb-1">${item.dateStr}</div>
                <div class="d-flex justify-content-between align-items-center small">
                    <div class="text-center">
                        <div class="text-primary">我</div>
                        <span class="badge bg-primary">${item.shift}</span>
                    </div>
                    <i class="fas fa-exchange-alt text-muted"></i>
                    <div class="text-center">
                        <div class="text-success">${item.target.name}</div>
                        <span class="badge bg-success">${item.target.shift}</span>
                    </div>
                </div>
            </li>
        `).join('');
    }

    // --- Step 5: 送出 (產生多筆 Request) ---
    async submitSwap() {
        const reasonType = document.getElementById('swap-reason-select').value;
        const reasonText = document.getElementById('swap-reason-text').value;
        let finalReason = reasonType;
        
        if (reasonType === '其他') {
            if (!reasonText.trim()) return alert("請輸入具體理由");
            finalReason = `其他：${reasonText}`;
        }

        if (!confirm(`確定提交共 ${this.pendingSwaps.length} 筆換班申請？\n理由：${finalReason}\n送出後需等待對方及管理者逐筆審核。`)) return;

        const btn = document.getElementById('btn-submit-swap');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 提交中...';

        try {
            // 逐筆產生 request (Requirement 1 & 3)
            const promises = this.pendingSwaps.map(item => {
                const data = {
                    unitId: this.targetUnitId,
                    scheduleId: this.currentSchedule.id || `${this.targetUnitId}_${this.currentYear}_${String(this.currentMonth).padStart(2,'0')}`,
                    year: this.currentYear,
                    month: this.currentMonth,
                    
                    requesterId: item.uid,
                    requesterName: this.currentUser.name,
                    requesterDate: item.dateStr,
                    requesterShift: item.shift,
                    
                    targetUserId: item.target.uid,
                    targetUserName: item.target.name,
                    targetDate: item.target.dateStr, // 同日
                    targetShift: item.target.shift,
                    
                    reason: finalReason
                };
                return SwapService.createSwapRequest(data);
            });

            await Promise.all(promises);
            
            alert("✅ 申請已全部送出！");
            this.loadGrid(); // 重置畫面

        } catch (e) {
            console.error(e);
            alert("提交失敗: " + e.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> 提交申請';
        }
    }
}
