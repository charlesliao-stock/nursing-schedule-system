import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 新增引用
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleEditPage {
    constructor() {
        this.scheduleId = null;
        this.scheduleData = null;
        this.unitData = null;
        this.staffList = [];
        this.isDirty = false;
        
        // 用於儲存上個月最後 6 天的資料
        // 結構: { uid: { 26: 'D', 27: 'OFF'... } }
        this.historyData = {}; 
        this.prevYear = 0;
        this.prevMonth = 0;
        this.prevMonthDays = 0;
        this.historyRange = []; // [25, 26, 27, 28, 29, 30]
    }

    async render() {
        // 先解析 URL 參數取得 ID
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split('?')[1]);
        this.scheduleId = params.get('id');

        return `
            <div class="container-fluid mt-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="d-flex align-items-center gap-3">
                        <h4 class="mb-0 fw-bold" id="page-title"><i class="fas fa-edit me-2"></i>預班內容編輯</h4>
                        <span id="status-badge" class="badge bg-secondary">載入中...</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 返回
                        </button>
                        <button id="btn-save" class="btn btn-primary" disabled>
                            <i class="fas fa-save"></i> 儲存變更
                        </button>
                        <button id="btn-auto-schedule" class="btn btn-success" disabled>
                            <i class="fas fa-robot"></i> 產生排班
                        </button>
                    </div>
                </div>

                <div class="alert alert-info py-2 small d-flex align-items-center">
                    <i class="fas fa-info-circle me-2"></i>
                    <span>提示：灰色底色區域為「上個月月底資料」，修改後請儲存，將作為排班時的連續性檢查依據 (如：換班間隔)。</span>
                </div>

                <div class="card shadow-sm">
                    <div class="card-body p-0">
                        <div class="table-responsive" id="schedule-container">
                            <div class="text-center p-5"><span class="spinner-border text-primary"></span> 資料載入中...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="context-menu" class="dropdown-menu shadow" style="display:none; position:fixed; z-index:9999;"></div>
        `;
    }

    async afterRender() {
        const user = authService.getProfile();
        if (!user) { alert("請先登入"); window.location.hash = '/login'; return; }

        if (!this.scheduleId) { alert("無效的預班表 ID"); window.history.back(); return; }

        window.routerPage = this;
        document.getElementById('btn-save').addEventListener('click', () => this.saveData());
        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.goToAutoSchedule());
        
        // 點擊空白處關閉選單
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && !e.target.closest('#context-menu')) menu.style.display = 'none';
        });

        // 綁定視窗關閉前的提示
        window.onbeforeunload = (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        await this.loadData();
    }

    async loadData() {
        try {
            // 1. 載入預班表資料
            this.scheduleData = await PreScheduleService.getPreScheduleById(this.scheduleId);
            if (!this.scheduleData) throw new Error("找不到預班表資料");

            this.unitData = await UnitService.getUnitById(this.scheduleData.unitId);
            const staff = await userService.getUnitStaff(this.scheduleData.unitId);
            // 排序人員 (依職級或自訂順序)
            this.staffList = staff.sort((a, b) => (a.rank || 'Z').localeCompare(b.rank || 'Z'));

            // 2. 更新標題
            document.getElementById('page-title').innerHTML = `<i class="fas fa-edit me-2"></i>${this.unitData.unitName} - ${this.scheduleData.year}年${this.scheduleData.month}月 預班編輯`;
            this.updateStatusBadge(this.scheduleData.status);

            // 3. 處理「上個月最後6天」的邏輯
            await this.ensureHistoryData();

            // 4. 渲染表格
            this.renderTable();

            // 5. 解鎖按鈕
            document.getElementById('btn-save').disabled = false;
            document.getElementById('btn-auto-schedule').disabled = false;

        } catch (e) {
            console.error(e);
            alert("載入失敗: " + e.message);
        }
    }

    // 🔥 核心邏輯：確保有上個月的資料
    async ensureHistoryData() {
        const currentYear = this.scheduleData.year;
        const currentMonth = this.scheduleData.month;

        // 計算上個月是幾年幾月
        let py = currentYear;
        let pm = currentMonth - 1;
        if (pm === 0) { pm = 12; py--; }
        
        this.prevYear = py;
        this.prevMonth = pm;
        
        // 取得上個月總天數
        this.prevMonthDays = new Date(py, pm, 0).getDate();
        
        // 定義我們要抓取的範圍 (最後 6 天)
        // 例如若上個月30天，範圍是 [25, 26, 27, 28, 29, 30]
        this.historyRange = [];
        for (let i = 5; i >= 0; i--) {
            this.historyRange.push(this.prevMonthDays - i);
        }

        // 檢查資料庫是否已儲存過 history (若有，就用儲存的；若無，才去抓正式班表)
        if (this.scheduleData.history && Object.keys(this.scheduleData.history).length > 0) {
            console.log("🔹 讀取已儲存的歷史班表資料");
            this.historyData = this.scheduleData.history;
        } else {
            console.log("🔸 初次載入，抓取上個月正式班表...");
            try {
                // 呼叫 ScheduleService 抓取上個月的正式班表
                const prevSchedule = await ScheduleService.getSchedule(this.scheduleData.unitId, py, pm);
                
                // 初始化 historyData 結構
                this.historyData = {};
                this.staffList.forEach(s => this.historyData[s.uid] = {});

                if (prevSchedule && prevSchedule.assignments) {
                    this.staffList.forEach(s => {
                        const uid = s.uid;
                        const userAssign = prevSchedule.assignments[uid] || {};
                        
                        this.historyRange.forEach(day => {
                            // 填入資料，若無則留空
                            this.historyData[uid][day] = userAssign[day] || '';
                        });
                    });
                }
                // 標記為已修改，這樣使用者第一次進來就會被提示要儲存
                this.isDirty = true;
            } catch (e) {
                console.warn("無法抓取上月班表 (可能是該月尚未排班):", e);
                // 即使失敗，也要初始化空物件，避免渲染錯誤
                this.historyData = {};
                this.staffList.forEach(s => this.historyData[s.uid] = {});
            }
        }
    }

    renderTable() {
        const daysInMonth = new Date(this.scheduleData.year, this.scheduleData.month, 0).getDate();
        const submissions = this.scheduleData.submissions || {};

        let html = `
        <table class="table table-bordered table-sm text-center align-middle schedule-table user-select-none">
            <thead class="table-light sticky-top" style="z-index: 5;">
                <tr>
                    <th rowspan="2" style="min-width:80px; width:80px;">職編</th>
                    <th rowspan="2" style="min-width:90px; width:90px;">姓名</th>
                    <th rowspan="2" style="width:40px;">註</th>
                    <th rowspan="2" style="width:120px;">排班偏好</th>
                    
                    <th colspan="6" class="bg-secondary bg-opacity-10 border-end border-2">上月 (${this.prevMonth}月)</th>
                    
                    <th colspan="${daysInMonth}">本月 (${this.scheduleData.month}月)</th>
                </tr>
                <tr>
                    ${this.historyRange.map(d => `<th class="bg-secondary bg-opacity-10 text-muted small">${d}</th>`).join('')}
                    
                    ${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const weekDay = new Date(this.scheduleData.year, this.scheduleData.month - 1, d).getDay();
                        const isWeekend = weekDay === 0 || weekDay === 6;
                        return `<th class="${isWeekend ? 'text-danger' : ''}">${d}<br><span class="small">${this.getWeekName(weekDay)}</span></th>`;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
        `;

        this.staffList.forEach(staff => {
            const uid = staff.uid;
            const sub = submissions[uid] || {};
            const wishes = sub.wishes || {};
            const pref = sub.preferences || {};
            const history = this.historyData[uid] || {};

            // 偏好顯示字串
            let prefStr = '';
            if (pref.batch) prefStr += `<span class="badge bg-primary me-1">包${pref.batch}</span>`;
            if (pref.priority1) prefStr += `<small class="text-muted">${pref.priority1} > ${pref.priority2 || '-'}</small>`;
            if (!prefStr) prefStr = '-';

            html += `
                <tr>
                    <td class="text-muted small">${staff.staffId || ''}</td>
                    <td class="fw-bold text-start ps-2">${staff.name}</td>
                    <td>${staff.constraints?.isPregnant ? '<span class="badge bg-danger rounded-pill">孕</span>' : ''}</td>
                    <td>${prefStr}</td>

                    ${this.historyRange.map(d => {
                        const val = history[d] || '';
                        return `<td class="history-cell bg-secondary bg-opacity-10" 
                                    data-uid="${uid}" 
                                    data-day="${d}" 
                                    data-type="history"
                                    onclick="window.routerPage.handleCellClick(this, '${val}')"
                                    style="cursor:pointer; border-right: ${d===this.historyRange[this.historyRange.length-1] ? '2px solid #dee2e6' : ''}">
                                    ${this.renderShiftBadge(val)}
                                </td>`;
                    }).join('')}

                    ${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const val = wishes[d] || '';
                        return `<td class="wish-cell" 
                                    data-uid="${uid}" 
                                    data-day="${d}" 
                                    data-type="current"
                                    onclick="window.routerPage.handleCellClick(this, '${val}')"
                                    style="cursor:pointer;">
                                    ${this.renderShiftBadge(val)}
                                </td>`;
                    }).join('')}
                </tr>
            `;
        });

        html += `</tbody></table>`;
        document.getElementById('schedule-container').innerHTML = html;
    }

    renderShiftBadge(code) {
        if (!code) return '';
        const map = {
            'D': 'bg-primary',
            'E': 'bg-warning text-dark',
            'N': 'bg-dark',
            'OFF': 'bg-warning',
            'M_OFF': 'bg-dark text-white',
        };
        // 處理勿排 (NO_D, NO_E...)
        if (code.startsWith('NO_')) {
            return `<i class="fas fa-ban text-danger"></i> ${code.replace('NO_', '')}`;
        }
        const bg = map[code] || 'bg-secondary';
        const label = code === 'M_OFF' ? '強休' : (code === 'OFF' ? '預休' : code);
        return `<span class="badge ${bg} w-100">${label}</span>`;
    }

    getWeekName(day) {
        return ['日', '一', '二', '三', '四', '五', '六'][day];
    }

    updateStatusBadge(status) {
        const el = document.getElementById('status-badge');
        const map = {
            'draft': { text: '草稿', cls: 'bg-secondary' },
            'open': { text: '開放填寫中', cls: 'bg-success' },
            'closed': { text: '已截止 / 排班中', cls: 'bg-warning text-dark' },
            'published': { text: '已發布', cls: 'bg-primary' }
        };
        const s = map[status] || { text: status, cls: 'bg-secondary' };
        el.className = `badge ${s.cls}`;
        el.textContent = s.text;
    }

    // 處理點擊 (包含歷史資料與本月預班)
    handleCellClick(cell, currentVal) {
        // 防止重複開啟
        const existing = document.getElementById('context-menu');
        if (existing.style.display === 'block') {
            existing.style.display = 'none';
            return;
        }

        const type = cell.dataset.type; // 'history' or 'current'
        const uid = cell.dataset.uid;
        const day = cell.dataset.day;

        this.currentEditTarget = { uid, day, type, cell };

        // 產生選單
        let menuHtml = '';
        const shifts = ['D', 'E', 'N'];
        
        menuHtml += `<h6 class="dropdown-header">設定 ${type==='history' ? '上月' : ''} ${day} 日</h6>`;
        
        // 歷史資料也可設定 OFF 或 班別，但不需設定「預休/強休」的區別，統一為 OFF 即可
        // 但為了格式統一，我們允許 OFF, D, E, N
        menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 休假</button>`;
        
        if (type === 'current') {
            menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('M_OFF')"><span class="badge bg-dark text-white w-25 me-2">M</span> 強迫預休</button>`;
        }
        menuHtml += `<div class="dropdown-divider"></div>`;

        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item" onclick="window.routerPage.applyShift('${s}')"><span class="badge bg-secondary w-25 me-2">${s}</span> ${s}</button>`;
        });

        // 只有本月可以設定 "勿排"
        if (type === 'current') {
            menuHtml += `<div class="dropdown-divider"></div>`;
            shifts.forEach(s => {
                menuHtml += `<button class="dropdown-item text-danger small" onclick="window.routerPage.applyShift('NO_${s}')"><i class="fas fa-ban w-25 me-2"></i> 勿排${s}</button>`;
            });
        }

        menuHtml += `<div class="dropdown-divider"></div>`;
        menuHtml += `<button class="dropdown-item text-muted" onclick="window.routerPage.applyShift('')"><i class="fas fa-eraser w-25 me-2"></i> 清除</button>`;

        const menu = document.getElementById('context-menu');
        menu.innerHTML = menuHtml;
        
        // 定位
        const rect = cell.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.display = 'block';
    }

    applyShift(val) {
        if (!this.currentEditTarget) return;
        const { uid, day, type } = this.currentEditTarget;

        if (type === 'history') {
            // 更新歷史資料物件
            if (!this.historyData[uid]) this.historyData[uid] = {};
            this.historyData[uid][day] = val;
        } else {
            // 更新本月預班物件
            if (!this.scheduleData.submissions[uid]) this.scheduleData.submissions[uid] = {};
            if (!this.scheduleData.submissions[uid].wishes) this.scheduleData.submissions[uid].wishes = {};
            
            if (val) this.scheduleData.submissions[uid].wishes[day] = val;
            else delete this.scheduleData.submissions[uid].wishes[day];
        }

        this.isDirty = true;
        this.renderTable(); // 重新渲染以更新畫面
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('btn-save').disabled = false;
    }

    async saveData() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

        try {
            // 準備更新資料
            // 我們將 historyData 存入 document 的 history 欄位
            const updates = {
                submissions: this.scheduleData.submissions,
                history: this.historyData, // ✅ 關鍵：儲存上個月資料供排班程式使用
                lastUpdated: new Date()
            };

            await PreScheduleService.updatePreSchedule(this.scheduleId, updates);
            
            this.isDirty = false;
            alert("✅ 儲存成功！");
        } catch (e) {
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存變更';
        }
    }

    goToAutoSchedule() {
        if (this.isDirty) {
            if (!confirm("您有未儲存的變更，是否繼續？(未儲存的變更將不會應用於排班)")) return;
        }
        // 跳轉到排班工作台，並帶上 ID
        window.location.hash = `/schedule/auto?preScheduleId=${this.scheduleId}`;
    }
}
