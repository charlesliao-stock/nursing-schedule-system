import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
// import { RuleEngine } from "../../ai/RuleEngine.js"; // 若有規則引擎可在此引入

export class SwapApplyPage {
    constructor() {
        this.realUser = null;
        this.currentUser = null;
        this.targetUnitId = null;
        this.isAdminMode = false;
        this.isImpersonating = false;

        this.scheduleList = [];
        this.currentSchedule = null; // 包含 assignments, year, month
        this.staffList = [];
        
        // 換班選取狀態
        this.selection = {
            source: null, // { uid, day, shift } (我的)
            target: null  // { uid, day, shift } (對方的)
        };
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3><i class="fas fa-exchange-alt text-primary me-2"></i>申請換班</h3>
                </div>

                <div id="admin-impersonate-section" class="card shadow-sm mb-4 border-left-danger" style="display:none;">
                    <div class="card-body py-2">
                        <div class="d-flex align-items-center gap-2">
                            <label class="fw-bold text-danger"><i class="fas fa-user-secret me-1"></i>管理員模式：</label>
                            <select id="admin-unit-select" class="form-select form-select-sm w-auto"><option value="">選擇單位</option></select>
                            <select id="admin-user-select" class="form-select form-select-sm w-auto"><option value="">選擇人員</option></select>
                            <button id="btn-impersonate" class="btn btn-danger btn-sm">切換身分</button>
                        </div>
                        <div id="sim-status-alert" class="alert alert-info mt-2 mb-0 py-2 small" style="display:none;"></div>
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
                        <div class="col-lg-9">
                            <div class="card shadow mb-3">
                                <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                    <div class="small text-muted">
                                        <i class="fas fa-info-circle me-1"></i>
                                        操作提示：先點選 <span class="badge bg-primary">您的班</span>，再點選 <span class="badge bg-success">對方的班</span>
                                    </div>
                                    <div class="small">
                                        <span class="badge bg-light text-dark border">今日：${new Date().toISOString().split('T')[0]}</span>
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div id="schedule-grid-container" class="table-responsive" style="max-height: 70vh;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-3">
                            <div class="card shadow border-left-primary h-100">
                                <div class="card-header bg-primary text-white fw-bold">換班申請單</div>
                                <div class="card-body">
                                    <div class="mb-3 p-2 border rounded bg-light">
                                        <label class="small text-muted">申請人 (我)</label>
                                        <div id="preview-source" class="fw-bold text-primary">請選擇您的班別</div>
                                    </div>
                                    
                                    <div class="text-center mb-3">
                                        <i class="fas fa-arrow-down text-muted"></i>
                                        <i class="fas fa-exchange-alt fa-lg text-primary mx-2"></i>
                                        <i class="fas fa-arrow-up text-muted"></i>
                                    </div>

                                    <div class="mb-3 p-2 border rounded bg-light">
                                        <label class="small text-muted">換班對象 (對方)</label>
                                        <div id="preview-target" class="fw-bold text-success">請選擇對方的班別</div>
                                    </div>

                                    <hr>
                                    
                                    <div id="validation-result" class="alert alert-secondary small mb-3">
                                        尚未選擇完整
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label small">換班原因 (選填)</label>
                                        <textarea id="swap-reason" class="form-control form-control-sm" rows="2"></textarea>
                                    </div>

                                    <button id="btn-submit-swap" class="btn btn-success w-100" disabled>
                                        <i class="fas fa-paper-plane me-1"></i> 提交換班申請
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

        // 管理員權限判斷
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
    }

    // --- 管理員模擬邏輯 ---
    async setupAdminUI() {
        document.getElementById('admin-impersonate-section').style.display = 'block';
        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const btn = document.getElementById('btn-impersonate');

        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">選擇單位</option>` + units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch(e) {}

        unitSelect.addEventListener('change', async () => {
            if(!unitSelect.value) return;
            userSelect.innerHTML = '<option>載入中...</option>';
            const staff = await userService.getUnitStaff(unitSelect.value);
            userSelect.innerHTML = `<option value="">選擇人員</option>` + staff.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');
        });

        btn.addEventListener('click', async () => {
            const uid = userSelect.value;
            const unitId = unitSelect.value;
            if(!uid) return alert("請選擇單位與人員");
            
            try {
                const targetUser = await userService.getUserData(uid);
                this.currentUser = targetUser;
                this.targetUnitId = unitId;
                this.isImpersonating = true;
                
                document.getElementById('sim-status-alert').innerHTML = `<strong>模擬中：</strong> ${targetUser.name}`;
                document.getElementById('sim-status-alert').style.display = 'block';
                
                // 重置介面
                document.getElementById('swap-workspace').style.display = 'none';
                this.loadScheduleList();
            } catch(e) { alert("模擬失敗: " + e.message); }
        });
    }

    // --- Step 1: 載入可用班表 ---
    async loadScheduleList() {
        const select = document.getElementById('schedule-select');
        select.innerHTML = '<option>載入中...</option>';
        
        try {
            // 這裡應該只撈取 "published" 的班表
            // 若 ScheduleService 沒有直接提供列表，這裡簡化為抓取最近幾個月
            const year = new Date().getFullYear();
            const month = new Date().getMonth() + 1;
            
            // 抓取本月與下個月的班表 (假設已發布)
            const schedules = [];
            
            // 嘗試讀取本月
            const s1 = await ScheduleService.getSchedule(this.targetUnitId, year, month);
            if(s1 && s1.status === 'published') schedules.push(s1);
            
            // 嘗試讀取下月
            let nextY = year, nextM = month + 1;
            if(nextM > 12) { nextM = 1; nextY++; }
            const s2 = await ScheduleService.getSchedule(this.targetUnitId, nextY, nextM);
            if(s2 && s2.status === 'published') schedules.push(s2);

            if(schedules.length === 0) {
                select.innerHTML = '<option value="">無可換班的已發布班表</option>';
                return;
            }

            select.innerHTML = schedules.map(s => 
                `<option value="${s.year}-${s.month}">${s.year}年 ${s.month}月 (已發布)</option>`
            ).join('');
            
        } catch(e) {
            console.error(e);
            select.innerHTML = '<option>載入失敗</option>';
        }
    }

    // --- Step 2: 載入並渲染矩陣 ---
    async loadGrid() {
        const val = document.getElementById('schedule-select').value;
        if(!val) return alert("請先選擇班表");
        
        const [y, m] = val.split('-');
        const year = parseInt(y);
        const month = parseInt(m);

        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '<div class="text-center p-5"><span class="spinner-border text-primary"></span></div>';
        document.getElementById('swap-workspace').style.display = 'block';

        // 重置選取
        this.selection = { source: null, target: null };
        this.updateSelectionUI();

        try {
            const [schedule, staff] = await Promise.all([
                ScheduleService.getSchedule(this.targetUnitId, year, month),
                userService.getUnitStaff(this.targetUnitId)
            ]);

            this.currentSchedule = schedule;
            this.staffList = staff;
            
            this.renderMatrix(schedule, staff, year, month);

        } catch(e) {
            container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
        }
    }

    renderMatrix(schedule, staffList, year, month) {
        const daysInMonth = new Date(year, month, 0).getDate();
        const assignments = schedule.assignments || {};
        const todayStr = new Date().toISOString().split('T')[0];

        let html = `<table class="table table-bordered table-sm text-center align-middle mb-0" style="font-size: 0.9rem;">`;
        
        // 表頭
        html += `<thead class="table-light sticky-top"><tr><th style="min-width:80px">人員</th>`;
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isPast = dateStr < todayStr;
            const style = isPast ? 'background:#e9ecef; color:#adb5bd;' : '';
            html += `<th style="min-width:35px; ${style}">${d}</th>`;
        }
        html += `</tr></thead><tbody>`;

        // 內容
        staffList.forEach(s => {
            const isMe = s.uid === this.currentUser.uid;
            const rowClass = isMe ? 'table-info' : '';
            const myBadge = isMe ? '<span class="badge bg-primary ms-1">我</span>' : '';
            
            html += `<tr class="${rowClass}">`;
            html += `<td class="fw-bold text-start ps-2">${s.name}${myBadge}</td>`;
            
            const userShifts = assignments[s.uid] || {};
            
            for(let d=1; d<=daysInMonth; d++) {
                const shift = userShifts[d] || '';
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isPast = dateStr < todayStr;
                
                // 判斷是否可點選
                // 1. 必須是未來日期
                // 2. 必須有班 (OFF 也可以換，視規則而定，這裡假設可以)
                // 3. 簡化：過去日期不可選
                const clickable = !isPast; 
                const cursor = clickable ? 'pointer' : 'not-allowed';
                const opacity = isPast ? '0.5' : '1';
                const bgColor = isPast ? '#f8f9fa' : '#fff';

                html += `
                    <td style="cursor:${cursor}; opacity:${opacity}; background:${bgColor}" 
                        class="swap-cell"
                        data-uid="${s.uid}" data-day="${d}" data-shift="${shift}" data-name="${s.name}" data-date="${dateStr}"
                        onclick="window.routerPage.handleCellClick(this)">
                        ${shift}
                    </td>
                `;
            }
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        
        document.getElementById('schedule-grid-container').innerHTML = html;
    }

    // --- Step 3: 點選邏輯 ---
    handleCellClick(cell) {
        const uid = cell.dataset.uid;
        const day = parseInt(cell.dataset.day);
        const shift = cell.dataset.shift;
        const name = cell.dataset.name;
        const dateStr = cell.dataset.date;
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. 檢查日期
        if (dateStr < todayStr) {
            alert("無法選擇過去的日期");
            return;
        }

        // 2. 判斷點選的是 "我" 還是 "對方"
        if (uid === this.currentUser.uid) {
            // 點選自己 -> 設定 Source
            this.selection.source = { uid, day, shift, name, dateStr };
            // 清除之前的選取樣式
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
            cell.classList.add('bg-primary', 'text-white');
        } else {
            // 點選別人 -> 設定 Target
            if (!this.selection.source) {
                alert("請先點選您自己的班別 (藍色區域)");
                return;
            }
            this.selection.target = { uid, day, shift, name, dateStr };
            // 清除之前的 Target 樣式
            document.querySelectorAll('.swap-cell.bg-success').forEach(c => c.classList.remove('bg-success', 'text-white'));
            cell.classList.add('bg-success', 'text-white');
        }

        this.updateSelectionUI();
        this.validateSwap();
    }

    updateSelectionUI() {
        const src = this.selection.source;
        const tgt = this.selection.target;

        const srcEl = document.getElementById('preview-source');
        const tgtEl = document.getElementById('preview-target');

        if (src) {
            srcEl.innerHTML = `
                <div class="fs-5">${src.dateStr} (日 ${src.day})</div>
                <div class="badge bg-primary fs-6">${src.shift || 'OFF'}</div>
            `;
        } else {
            srcEl.textContent = "請點選您的班別";
        }

        if (tgt) {
            tgtEl.innerHTML = `
                <div class="fs-6">${tgt.name}</div>
                <div class="fs-5">${tgt.dateStr} (日 ${tgt.day})</div>
                <div class="badge bg-success fs-6">${tgt.shift || 'OFF'}</div>
            `;
        } else {
            tgtEl.textContent = "請點選對方的班別";
        }
    }

    // --- Step 4: 預覽與驗證 ---
    validateSwap() {
        const resEl = document.getElementById('validation-result');
        const btn = document.getElementById('btn-submit-swap');
        const src = this.selection.source;
        const tgt = this.selection.target;

        if (!src || !tgt) {
            resEl.className = 'alert alert-secondary small mb-3';
            resEl.textContent = '請選擇雙方的班別以進行檢測';
            btn.disabled = true;
            return;
        }

        // 簡易驗證邏輯 (實際上應該呼叫 RuleEngine)
        // 1. 基本檢查
        if (src.shift === tgt.shift) {
            resEl.className = 'alert alert-warning small mb-3';
            resEl.textContent = '警告：雙方班別相同，無需換班';
            btn.disabled = true;
            return;
        }

        // 2. 模擬規則檢查 (此處為示意，實際需整合 RuleEngine)
        // 假設：檢查是否有連續 7 天上班，或間隔不足
        // 這裡我們暫時回傳通過，但顯示提示
        
        resEl.className = 'alert alert-success small mb-3';
        resEl.innerHTML = `
            <i class="fas fa-check-circle"></i> 初步檢測通過<br>
            交換後：<br>
            您將上：<b>${tgt.shift||'OFF'}</b><br>
            ${tgt.name} 將上：<b>${src.shift||'OFF'}</b>
        `;
        btn.disabled = false;
    }

    // --- Step 5: 提交 ---
    async submitSwap() {
        if (!confirm("確定提交換班申請？\n送出後需等待對方及管理者審核。")) return;

        const btn = document.getElementById('btn-submit-swap');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 提交中...';

        try {
            const data = {
                unitId: this.targetUnitId,
                scheduleId: this.currentSchedule.id, // 用來對應原始班表
                year: this.currentSchedule.year,
                month: this.currentSchedule.month,
                requesterId: this.selection.source.uid,
                requesterName: this.currentUser.name,
                requesterDate: this.selection.source.dateStr,
                requesterShift: this.selection.source.shift,
                targetUserId: this.selection.target.uid,
                targetUserName: this.selection.target.name,
                targetDate: this.selection.target.dateStr,
                targetShift: this.selection.target.shift,
                reason: document.getElementById('swap-reason').value
            };

            await SwapService.createSwapRequest(data);
            
            alert("✅ 申請已送出！");
            // 重置
            this.loadGrid(); // 重新載入畫面

        } catch (e) {
            alert("提交失敗: " + e.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> 提交換班申請';
        }
    }
}
