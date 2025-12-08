import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 用於撈取歷史排班數據
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        // 1. 初始化日期：預設為「下個月」
        // 例如：現在是 12月，預設顯示 1月 (明年)
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1; // getMonth() 是 0-11，+1 為本月，再 +1 為下月
        let targetYear = today.getFullYear();
        
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear++;
        }

        this.year = targetYear;
        this.month = targetMonth;
        
        // 2. 初始化狀態變數
        this.currentUser = null;
        this.currentUnit = null;
        this.preSchedule = null;
        this.myWishes = {};      // 使用者的畫休暫存 { "1": "OFF", "15": "OFF" }
        this.unitAggregate = {}; // 大表統計 { "1": 5 } (代表1號已有5人預休)
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-edit"></i> 提交預班</h2>
                        <div class="text-muted small mt-1" id="header-info">
                            <span class="spinner-border spinner-border-sm"></span> 載入使用者資訊中...
                        </div>
                    </div>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light py-3">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold mb-0">預班月份：</label>
                            <input type="month" id="submit-month" class="form-control w-auto" 
                                   value="${this.year}-${String(this.month).padStart(2,'0')}">
                            <button id="btn-load" class="btn btn-primary">
                                <i class="fas fa-search"></i> 查詢
                            </button>
                        </div>
                    </div>
                </div>

                <div id="not-open-alert" class="alert alert-warning text-center p-5 shadow-sm" style="display:none;">
                    <i class="fas fa-clock fa-3x mb-3 text-warning"></i>
                    <h4>本月預班尚未開放</h4>
                    <p class="mb-0">管理者尚未建立此月份的預班表，請留意單位公告或選擇其他月份。</p>
                </div>

                <div id="submit-area" style="display:none;">
                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-header py-3 d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 font-weight-bold text-primary">班表日曆</h6>
                                    <span class="badge bg-info text-white"><i class="fas fa-info-circle"></i> 右下角數字為全單位預休人數</span>
                                </div>
                                <div class="card-body">
                                    <div id="calendar-grid" class="calendar-grid"></div>
                                </div>
                            </div>
                            
                            <div class="card shadow mb-4">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-success">預班給班率統計 (過去 3 個月)</h6>
                                </div>
                                <div class="card-body">
                                    <div class="row text-center" id="stats-container">
                                        <div class="col border-end">
                                            <div class="h3 font-weight-bold text-gray-800" id="stat-req">-</div>
                                            <div class="small text-muted">提出預休 (天)</div>
                                        </div>
                                        <div class="col border-end">
                                            <div class="h3 font-weight-bold text-success" id="stat-ok">-</div>
                                            <div class="small text-muted">實際給假 (天)</div>
                                        </div>
                                        <div class="col">
                                            <div class="h3 font-weight-bold text-primary" id="stat-rate">-</div>
                                            <div class="small text-muted">達成率</div>
                                        </div>
                                    </div>
                                    <div id="stats-loading" class="text-center text-muted small mt-2" style="display:none;">
                                        計算中...
                                    </div>
                                    <div id="stats-error" class="text-center text-danger small mt-2" style="display:none;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4 sticky-top" style="top: 20px; z-index: 100;">
                                <div class="card-header py-3">
                                    <h6 class="m-0 font-weight-bold text-primary">提交確認</h6>
                                </div>
                                <div class="card-body">
                                    <ul class="list-group list-group-flush mb-3">
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>本月可休上限</span>
                                            <strong id="limit-max" class="text-danger">0</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between bg-light">
                                            <span>目前已選天數</span>
                                            <strong id="current-count" class="text-primary fs-5">0</strong>
                                        </li>
                                    </ul>
                                    
                                    <div class="mb-3">
                                        <label class="form-label small text-muted">備註說明 (選填)</label>
                                        <textarea id="wish-notes" class="form-control" rows="3" placeholder="例如：連假需求、進修課程..."></textarea>
                                    </div>
                                    
                                    <div class="d-grid gap-2">
                                        <button id="btn-submit" class="btn btn-success btn-lg shadow-sm">
                                            <i class="fas fa-paper-plane"></i> 提交預班
                                        </button>
                                    </div>
                                    <div class="mt-2 text-center">
                                        <small id="last-submit-time" class="text-muted"></small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <style>
                    .calendar-grid { 
                        display: grid; 
                        grid-template-columns: repeat(7, 1fr); 
                        gap: 8px; 
                    }
                    .calendar-header-cell {
                        text-align: center;
                        font-weight: bold;
                        padding: 10px 0;
                        color: #4e73df;
                        text-transform: uppercase;
                        font-size: 0.9rem;
                    }
                    .calendar-cell { 
                        border: 1px solid #e3e6f0; 
                        border-radius: 8px; 
                        min-height: 100px; 
                        padding: 8px; 
                        cursor: pointer; 
                        background: #fff; 
                        position: relative; 
                        transition: all 0.2s;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .calendar-cell:hover { 
                        background-color: #f8f9fc; 
                        transform: translateY(-2px);
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        border-color: #4e73df; 
                    }
                    .calendar-cell.selected-off { 
                        background-color: #ffeaea; 
                        border: 2px solid #e74a3b; 
                    }
                    .calendar-cell.weekend {
                        background-color: #fffaf0;
                    }
                    .calendar-cell.weekend:hover {
                        background-color: #fff5e0;
                    }
                    .day-number { 
                        font-weight: 800; 
                        font-size: 1.2rem; 
                        color: #5a5c69;
                    }
                    .day-number.weekend-text {
                        color: #e74a3b;
                    }
                    .wish-badge { 
                        display: block; 
                        text-align: center; 
                        font-weight: bold; 
                        font-size: 1.1rem; 
                        color: #e74a3b; 
                        background: rgba(231, 74, 59, 0.1);
                        border-radius: 4px;
                        padding: 2px;
                        margin: auto 0;
                    }
                    .agg-info { 
                        text-align: right;
                        font-size: 0.8rem; 
                        color: #858796; 
                    }
                </style>
            </div>
        `;
    }

    async afterRender() {
        const authUser = authService.getCurrentUser();
        if (!authUser) {
            // 未登入保護
            alert("請先登入系統");
            window.location.hash = '/login';
            return;
        }

        try {
            // 1. 取得使用者詳細資料
            this.currentUser = await userService.getUserData(authUser.uid);
            
            if (!this.currentUser || !this.currentUser.unitId) {
                document.getElementById('header-info').innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> 錯誤：此帳號未綁定單位，無法使用預班功能。</span>`;
                return;
            }

            // 2. 取得單位資料 (用於顯示單位名稱)
            const unit = await UnitService.getUnitById(this.currentUser.unitId);
            this.currentUnit = unit;
            
            // 3. 更新 Header 資訊
            document.getElementById('header-info').innerHTML = 
                `單位: <strong>${unit.unitName || '未知單位'}</strong> | 
                 職級: <strong>${this.currentUser.rank || 'N/A'}</strong> | 
                 姓名: <strong>${this.currentUser.name}</strong>`;

            // 4. 綁定按鈕事件
            document.getElementById('btn-load').addEventListener('click', () => this.loadData());
            document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());

            // 5. 自動執行首次載入
            await this.loadData();
            
            // 6. 載入統計數據
            this.loadStats();

        } catch (error) {
            console.error("Page Initialization Error:", error);
            document.getElementById('header-info').innerHTML = `<span class="text-danger">系統初始化失敗: ${error.message}</span>`;
        }
    }

    /**
     * 載入預班資料主邏輯
     */
    async loadData() {
        const monthInput = document.getElementById('submit-month').value;
        if (!monthInput) return;

        const [y, m] = monthInput.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        // 重置 UI 狀態
        document.getElementById('submit-area').style.display = 'none';
        document.getElementById('not-open-alert').style.display = 'none';
        
        const btnLoad = document.getElementById('btn-load');
        const originalBtnText = btnLoad.innerHTML;
        btnLoad.disabled = true;
        btnLoad.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 讀取中...`;

        try {
            // 呼叫 Service 獲取整份預班表
            this.preSchedule = await PreScheduleService.getPreSchedule(this.currentUser.unitId, this.year, this.month);
            
            // 檢查是否開放
            if (!this.preSchedule || this.preSchedule.status !== 'open') {
                document.getElementById('not-open-alert').style.display = 'block';
                return;
            }

            const { settings, submissions } = this.preSchedule;
            
            // 取得個人的提交紀錄 (如果有的話)
            const mySub = submissions && submissions[this.currentUser.uid] ? submissions[this.currentUser.uid] : {};
            this.myWishes = mySub.wishes || {}; // 若無則為空物件
            
            // 填充 UI
            document.getElementById('wish-notes').value = mySub.notes || '';
            document.getElementById('limit-max').textContent = settings.maxOffDays;
            
            // 顯示上次提交時間
            if (mySub.submittedAt) {
                // 相容 Firestore Timestamp 與 Date 物件
                const date = mySub.submittedAt.toDate ? mySub.submittedAt.toDate() : new Date(mySub.submittedAt);
                document.getElementById('last-submit-time').textContent = `上次提交: ${date.toLocaleString()}`;
            } else {
                document.getElementById('last-submit-time').textContent = '尚未提交';
            }

            // 計算大表統計
            this.calculateAggregate(submissions);

            // 顯示主要區域並渲染月曆
            document.getElementById('submit-area').style.display = 'block';
            this.renderCalendar();
            this.updateCounter();

        } catch (error) {
            console.error("Load Data Error:", error);
            alert("讀取資料失敗，請檢查網路連線或稍後再試。");
        } finally {
            btnLoad.disabled = false;
            btnLoad.innerHTML = originalBtnText;
        }
    }

    /**
     * 計算全單位每日已預休人數
     */
    calculateAggregate(submissions) {
        this.unitAggregate = {};
        if (!submissions) return;

        Object.values(submissions).forEach(sub => {
            if (sub.wishes) {
                Object.entries(sub.wishes).forEach(([day, wish]) => {
                    if (wish === 'OFF') {
                        this.unitAggregate[day] = (this.unitAggregate[day] || 0) + 1;
                    }
                });
            }
        });
    }

    /**
     * 渲染互動式月曆
     */
    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        
        // 渲染星期標題
        const weeks = ['日', '一', '二', '三', '四', '五', '六'];
        weeks.forEach(w => {
            grid.innerHTML += `<div class="calendar-header-cell">${w}</div>`;
        });

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        const firstDayObj = new Date(this.year, this.month - 1, 1);
        const firstDay = firstDayObj.getDay(); // 0 (Sun) - 6 (Sat)
        
        // 補前方的空白格子
        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="calendar-cell" style="background:#f8f9fc; cursor:default; border:none;"></div>`;
        }

        // 渲染日期
        for (let d = 1; d <= daysInMonth; d++) {
            const wish = this.myWishes[d]; // 'OFF' or undefined
            const agg = this.unitAggregate[d] || 0;
            const currentWeekDay = new Date(this.year, this.month - 1, d).getDay();
            const isWeekend = (currentWeekDay === 0 || currentWeekDay === 6);
            
            const cell = document.createElement('div');
            // 動態 CSS Class
            let classList = 'calendar-cell';
            if (wish === 'OFF') classList += ' selected-off';
            if (isWeekend) classList += ' weekend';
            cell.className = classList;
            
            // 點擊事件
            cell.onclick = () => this.toggleDate(d);
            
            cell.innerHTML = `
                <div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div>
                ${wish ? '<span class="wish-badge">OFF</span>' : ''}
                <div class="agg-info" title="全單位目前有 ${agg} 人預休">
                    <i class="fas fa-users"></i> ${agg}
                </div>
            `;
            grid.appendChild(cell);
        }
    }

    /**
     * 切換日期選取狀態
     */
    toggleDate(day) {
        // 如果已經選了 -> 取消
        if (this.myWishes[day]) {
            delete this.myWishes[day];
        } 
        // 如果沒選 -> 檢查上限 -> 加上
        else {
            const currentCount = Object.keys(this.myWishes).length;
            const limit = parseInt(this.preSchedule.settings.maxOffDays);
            
            if (currentCount >= limit) {
                // 使用 Bootstrap Toast 或簡單 Alert
                alert(`無法選取：已達本月預休上限 (${limit} 天)`);
                return;
            }
            this.myWishes[day] = 'OFF';
        }
        
        this.renderCalendar(); // 重新渲染 (可優化為只更新 DOM)
        this.updateCounter();
    }

    updateCounter() {
        const count = Object.keys(this.myWishes).length;
        const el = document.getElementById('current-count');
        el.textContent = count;
        
        const limit = parseInt(this.preSchedule.settings.maxOffDays);
        if (count > limit) el.className = "text-danger fs-5 fw-bold";
        else el.className = "text-primary fs-5";
    }

    /**
     * 提交預班
     */
    async handleSubmit() {
        // 簡易驗證
        const count = Object.keys(this.myWishes).length;
        if (count === 0) {
            if (!confirm('您目前沒有選擇任何預休日期，確定要提交「空白」預班嗎？\n(這代表您下個月皆可排班)')) return;
        } else {
            if (!confirm(`確定提交 ${count} 天預休需求？\n\n提交後仍可修改，直到管理者關閉預班為止。`)) return;
        }

        const btn = document.getElementById('btn-submit');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 提交中...`;

        try {
            const res = await PreScheduleService.submitPersonalWish(
                this.currentUser.unitId,
                this.year,
                this.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value
            );

            if (res.success) {
                alert('✅ 提交成功！');
                await this.loadData(); // 重新讀取以更新 "上次提交時間"
            } else {
                throw new Error(res.error || 'Unknown Error');
            }
        } catch (error) {
            console.error(error);
            alert('❌ 提交失敗: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    /**
     * 載入統計數據
     * 這裡嘗試呼叫 ScheduleService，如果 Service 還沒實作，會優雅降級。
     */
    async loadStats() {
        const reqEl = document.getElementById('stat-req');
        const okEl = document.getElementById('stat-ok');
        const rateEl = document.getElementById('stat-rate');
        const loadingEl = document.getElementById('stats-loading');
        
        loadingEl.style.display = 'block';

        try {
            // 嘗試呼叫 ScheduleService (假設方法為 getPersonalStats)
            // 如果 ScheduleService 沒有這個 method，catch block 會捕捉到錯誤
            if (typeof ScheduleService.getPersonalStats === 'function') {
                
                // 參數：UnitId, UserId, 回推月份數 (3個月)
                const stats = await ScheduleService.getPersonalStats(
                    this.currentUser.unitId, 
                    this.currentUser.uid, 
                    3
                );

                if (stats) {
                    reqEl.textContent = stats.requested || 0;
                    okEl.textContent = stats.granted || 0;
                    // 計算百分比
                    const rate = stats.requested > 0 
                        ? Math.round((stats.granted / stats.requested) * 100) 
                        : 0;
                    rateEl.textContent = `${rate}%`;
                } else {
                    throw new Error("No data returned");
                }

            } else {
                // 如果方法不存在 (尚未實作)
                console.warn("ScheduleService.getPersonalStats尚未實作，顯示預設值。");
                reqEl.textContent = '-';
                okEl.textContent = '-';
                rateEl.textContent = '-';
            }

        } catch (error) {
            console.warn("無法載入統計數據 (可能尚未有歷史資料):", error);
            reqEl.textContent = '0';
            okEl.textContent = '0';
            rateEl.textContent = 'N/A';
        } finally {
            loadingEl.style.display = 'none';
        }
    }
}
