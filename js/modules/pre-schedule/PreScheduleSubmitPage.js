import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    constructor() {
        this.currentUser = null;
        this.currentUnit = null; 
        this.unitStaffMap = {}; 
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        
        // 資料暫存
        this.myWishes = {};
        this.myPreferences = {}; 
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.isReadOnly = false;
        
        // 右鍵選單暫存
        this.tempTarget = null;

        // 定義班別類型 (對應需求 4)
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D':   { label: '白',   color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E':   { label: '小',   color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N':   { label: '大',   color: '#212529', bg: '#212529', text: 'white' },
            'XD':  { label: '勿白', color: '#adb5bd', bg: '#f8f9fa', text: '#0d6efd', border: '1px solid #0d6efd' },
            'XE':  { label: '勿小', color: '#adb5bd', bg: '#f8f9fa', text: '#ffc107', border: '1px solid #ffc107' },
            'XN':  { label: '勿大', color: '#adb5bd', bg: '#f8f9fa', text: '#212529', border: '1px solid #212529' }
        };
    }

    async render() {
        // 1. CSS 樣式：針對右下角小人頭與卡片樣式優化
        const styles = `
            <style>
                .calendar-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 8px;
                    padding: 5px;
                }
                .calendar-header {
                    text-align: center;
                    font-weight: bold;
                    color: #4e73df;
                    padding: 10px 0;
                }
                .calendar-cell {
                    background-color: #fff;
                    border: 1px solid #e3e6f0;
                    border-radius: 6px;
                    min-height: 90px;
                    padding: 6px;
                    cursor: pointer;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.2s;
                }
                .calendar-cell:hover {
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    border-color: #4e73df;
                    z-index: 5;
                }
                .calendar-cell.weekend { background-color: #fff0f5; } /* 需求 2: 假日粉紅底 */
                .calendar-cell.disabled { background-color: #f1f3f5; opacity: 0.7; cursor: default; }
                
                /* 選中樣式 */
                .calendar-cell.selected {
                    background-color: #fff3cd !important;
                    border: 2px solid #ffc107 !important;
                }

                .day-number { font-weight: 800; font-size: 1.1rem; color: #5a5c69; }
                .day-number.weekend-text { color: #e74a3b; }

                /* 班別標籤 (置中) */
                .shift-tag-container {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .shift-badge {
                    font-size: 1.1rem;
                    font-weight: bold;
                    padding: 2px 8px;
                    border-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                /* 需求 3: 右下角小人頭計數 */
                .bottom-stats {
                    position: absolute;
                    bottom: 4px;
                    right: 6px;
                    font-size: 0.75rem;
                    color: #858796;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }
                .bottom-stats.full { color: #e74a3b; font-weight: bold; } /* 額滿變紅 */
            </style>
        `;

        const html = `
            <div class="container-fluid mt-4">
                
                <div id="list-view">
                    <div class="mb-3">
                        <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                        <p class="text-muted small mb-0">請選擇開放中的月份進行預班。</p>
                    </div>

                    <div class="card shadow">
                        <div class="card-header py-3 bg-white">
                            <h6 class="m-0 font-weight-bold text-primary">可預班月份清單</h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle mb-0 text-center">
                                    <thead class="table-light">
                                        <tr>
                                            <th>月份</th>
                                            <th>單位</th>
                                            <th>預班開放日期</th>
                                            <th>狀態</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="schedule-list-tbody">
                                        <tr><td colspan="5" class="py-5 text-muted">載入中...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="detail-view" style="display:none;">
                    <div class="d-flex align-items-center mb-3">
                        <button class="btn btn-outline-secondary btn-sm me-3" id="btn-back">
                            <i class="fas fa-arrow-left"></i> 返回清單
                        </button>
                        <h4 class="m-0 fw-bold text-gray-800" id="calendar-header-title"></h4>
                    </div>

                    <div class="row">
                        <div class="col-lg-8">
                            <div class="card shadow mb-4">
                                <div class="card-body p-3 bg-light">
                                    <div class="d-flex justify-content-end mb-2 small text-muted">
                                        <span class="me-3"><i class="fas fa-mouse-pointer"></i> 左鍵: 預設OFF / 取消</span>
                                        <span><i class="fas fa-mouse-pointer"></i> 右鍵: 選擇班別 (白/小/大/勿排)</span>
                                    </div>
                                    <div id="calendar-container" class="calendar-grid"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card shadow mb-4 border-left-info sticky-top" style="top: 80px; z-index: 10;">
                                <div class="card-header py-3 bg-white">
                                    <h6 class="m-0 font-weight-bold text-info">排班偏好與確認</h6>
                                </div>
                                <div class="card-body">
                                    
                                    <div class="mb-3">
                                        <div class="d-flex justify-content-between mb-1">
                                            <span>預班總數 <small class="text-muted">(上限 <span id="limit-total"></span>)</small></span>
                                            <span class="badge bg-primary rounded-pill" id="count-total">0</span>
                                        </div>
                                        <div class="d-flex justify-content-between">
                                            <span>假日預休 <small class="text-muted">(上限 <span id="limit-holiday"></span>)</small></span>
                                            <span class="badge bg-info rounded-pill" id="count-holiday">0</span>
                                        </div>
                                    </div>
                                    <hr>

                                    <div id="batch-pref-section" class="mb-3" style="display:none;">
                                        <label class="fw-bold d-block mb-1 small">包班意願</label>
                                        <div class="btn-group w-100 btn-group-sm" role="group">
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-none" value="" checked>
                                            <label class="btn btn-outline-secondary" for="batch-none">無</label>
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-e" value="E">
                                            <label class="btn btn-outline-warning text-dark" for="batch-e">小夜</label>
                                            <input type="radio" class="btn-check" name="batchPref" id="batch-n" value="N">
                                            <label class="btn btn-outline-dark" for="batch-n">大夜</label>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="fw-bold d-block mb-1 small">優先班別 (順序)</label>
                                        <div class="input-group input-group-sm mb-2">
                                            <span class="input-group-text">1</span>
                                            <select class="form-select" id="pref-1">
                                                <option value="">(無)</option><option value="D">白班</option><option value="E">小夜</option><option value="N">大夜</option>
                                            </select>
                                        </div>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text">2</span>
                                            <select class="form-select" id="pref-2">
                                                <option value="">(無)</option><option value="D">白班</option><option value="E">小夜</option><option value="N">大夜</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="fw-bold small">備註</label>
                                        <textarea class="form-control form-control-sm" id="wish-notes" rows="2"></textarea>
                                    </div>

                                    <button id="btn-submit" class="btn btn-success w-100">
                                        <i class="fas fa-paper-plane"></i> 提交預班
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 需求 4: 右鍵選單
        const contextMenu = `
            <div id="user-shift-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                ${Object.entries(this.shiftTypes).map(([key, cfg]) => 
                    `<button class="list-group-item list-group-item-action py-1 text-center small fw-bold" 
                        style="color:${cfg.bg==='#f8f9fa'?cfg.text:'white'}; background:${cfg.bg==='#f8f9fa'?'white':cfg.bg};"
                        onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                ).join('')}
                <button class="list-group-item list-group-item-action py-1 text-center text-secondary small" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
            </div>
        `;

        return styles + html + contextMenu;
    }

    async afterRender() {
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        
        const profile = authService.getProfile();
        if (!profile) { alert("無法讀取使用者資訊"); return; }

        window.routerPage = this; // 供 HTML 呼叫

        try {
            // 讀取完整 User 資料
            this.currentUser = await userService.getUserData(profile.uid);
            this.currentUnit = await UnitService.getUnitById(this.currentUser.unitId);
            
            // 載入清單
            await this.loadList();

        } catch(e) { console.error(e); }

        document.getElementById('btn-back').addEventListener('click', () => this.showListView());
        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());
        
        // 關閉右鍵選單
        document.addEventListener('click', (e) => {
            if(!e.target.closest('#user-shift-menu')) document.getElementById('user-shift-menu').style.display = 'none';
        });
    }

    // 需求 1: 載入清單 (權限過濾)
    async loadList() {
        const unitId = this.currentUser.unitId;
        // 取得該單位所有預班表
        const allSchedules = await PreScheduleService.getPreSchedulesList(unitId);
        
        // 預先抓取單位人員名稱 (for Tooltip)
        const staffList = await userService.getUnitStaff(unitId);
        staffList.forEach(s => this.unitStaffMap[s.uid] = s.name);

        const tbody = document.getElementById('schedule-list-tbody');
        
        if (allSchedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-5 text-muted">目前無預班表</td></tr>';
            return;
        }

        // 渲染列表
        tbody.innerHTML = allSchedules.map(p => {
            // 權限檢查：只有在 staffIds 名單內的人才顯示 (或系統管理員)
            const canAccess = p.staffIds && p.staffIds.includes(this.currentUser.uid);
            // 系統管理員可看全部，一般人只能看自己被加入的
            if (!canAccess && this.currentUser.role !== 'system_admin') return '';

            const openDate = p.settings?.openDate || 'N/A';
            const closeDate = p.settings?.closeDate || 'N/A';
            const now = new Date().toISOString().split('T')[0];
            
            let statusBadge = '';
            let btnClass = 'btn-primary';
            let btnText = '預班';
            let isExpired = false;

            if (p.status === 'closed') {
                statusBadge = '<span class="badge bg-secondary">已關閉</span>'; 
                btnClass = 'btn-outline-secondary'; btnText = '檢視'; isExpired = true;
            } else if (now < openDate) {
                statusBadge = '<span class="badge bg-warning text-dark">未開放</span>';
                btnClass = 'btn-secondary disabled'; 
            } else if (now > closeDate) {
                statusBadge = '<span class="badge bg-danger">已截止</span>'; 
                btnClass = 'btn-outline-secondary'; btnText = '檢視'; isExpired = true;
            } else {
                statusBadge = '<span class="badge bg-success">進行中</span>';
            }

            return `
                <tr>
                    <td class="fw-bold">${p.year}-${String(p.month).padStart(2,'0')}</td>
                    <td>${this.currentUnit.unitName}</td>
                    <td><small>${openDate} ~ ${closeDate}</small></td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm ${btnClass}" onclick="window.routerPage.openSchedule('${p.id}', ${isExpired})">
                            ${btnText}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // 暫存列表以供後續查詢
        this.preSchedulesList = allSchedules;
    }

    showListView() {
        document.getElementById('list-view').style.display = 'block';
        document.getElementById('detail-view').style.display = 'none';
    }

    // 開啟月曆 (Detail View)
    openSchedule(id, isReadOnly) {
        this.currentSchedule = this.preSchedulesList.find(s => s.id === id);
        if (!this.currentSchedule) return;
        this.isReadOnly = isReadOnly;

        document.getElementById('list-view').style.display = 'none';
        document.getElementById('detail-view').style.display = 'block';

        // 需求 2: 標題顯示 預班單位、年月
        const title = `${this.currentUnit.unitName} ${this.currentSchedule.year}年${this.currentSchedule.month}月 預班月曆`;
        document.getElementById('calendar-header-title').textContent = title;

        // 設定限制顯示
        const settings = this.currentSchedule.settings;
        document.getElementById('limit-total').textContent = settings.maxOffDays;
        document.getElementById('limit-holiday').textContent = settings.maxHoliday || 0;

        // 讀取我的資料
        const mySub = (this.currentSchedule.submissions && this.currentSchedule.submissions[this.currentUser.uid]) || {};
        this.myWishes = mySub.wishes || {};
        document.getElementById('wish-notes').value = mySub.notes || '';

        // 偏好設定回填
        const myPref = mySub.preferences || {};
        // 包班 (有權限才顯示)
        if (this.currentUser.constraints?.canBatch) {
            document.getElementById('batch-pref-section').style.display = 'block';
            if (myPref.batch) {
                const radio = document.querySelector(`input[name="batchPref"][value="${myPref.batch}"]`);
                if(radio) radio.checked = true;
            } else {
                document.getElementById('batch-none').checked = true;
            }
        } else {
            document.getElementById('batch-pref-section').style.display = 'none';
        }
        // 優先
        document.getElementById('pref-1').value = myPref.priority1 || '';
        document.getElementById('pref-2').value = myPref.priority2 || '';

        // UI 狀態
        if (isReadOnly) {
            document.getElementById('btn-submit').disabled = true;
            document.getElementById('btn-submit').textContent = "唯讀 (已關閉)";
            document.querySelectorAll('input, textarea, select').forEach(i => i.disabled = true);
        } else {
            document.getElementById('btn-submit').disabled = false;
            document.getElementById('btn-submit').textContent = "提交預班";
            document.querySelectorAll('input, textarea, select').forEach(i => i.disabled = false);
        }

        this.calculateAggregate();
        this.renderCalendar();
        this.updateCounters();
    }

    calculateAggregate() {
        this.unitAggregate = {};
        this.unitNames = {};
        const subs = this.currentSchedule.submissions || {};

        Object.entries(subs).forEach(([uid, sub]) => {
            if (sub.wishes) {
                Object.entries(sub.wishes).forEach(([day, type]) => {
                    // 只要有排就算 (不論 OFF 或 D/E/N)
                    this.unitAggregate[day] = (this.unitAggregate[day] || 0) + 1;
                    
                    // 紀錄姓名 (若開啟顯示)
                    if (this.currentSchedule.settings.showOtherNames) {
                        if (!this.unitNames[day]) this.unitNames[day] = [];
                        const name = this.unitStaffMap[uid] || '未知';
                        this.unitNames[day].push(`${name}(${type})`);
                    }
                });
            }
        });
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-container');
        grid.innerHTML = '';
        ['日','一','二','三','四','五','六'].forEach(w => grid.innerHTML += `<div class="calendar-header">${w}</div>`);

        const { year, month } = this.currentSchedule;
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDay = new Date(year, month - 1, 1).getDay();

        // 取得每日限額 (簡易算法: 總人數 - 每日Min - 保留)
        const totalStaff = this.currentSchedule.staffIds.length;
        const reserved = this.currentSchedule.settings.reservedStaff || 0;
        const reqMatrix = this.currentUnit.staffRequirements || {D:{}, E:{}, N:{}};

        // 空白格
        for(let i=0; i<firstDay; i++) grid.innerHTML += `<div style="background:transparent;"></div>`;

        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const w = date.getDay();
            const isWeekend = (w === 0 || w === 6);
            
            // 計算當日限額
            const reqTotal = (reqMatrix.D?.[w]||0) + (reqMatrix.E?.[w]||0) + (reqMatrix.N?.[w]||0);
            let dailyLimit = totalStaff - reqTotal - reserved;
            if(dailyLimit < 0) dailyLimit = 0;

            const count = this.unitAggregate[d] || 0;
            const isFull = count >= dailyLimit;

            const myType = this.myWishes[d];
            const cfg = myType ? this.shiftTypes[myType] : null;

            // 建立格子
            const cell = document.createElement('div');
            let classes = 'calendar-cell';
            if(isWeekend) classes += ' weekend';
            if(myType) classes += ' selected';
            if(this.isReadOnly) classes += ' disabled';
            if(isFull) classes += ' over-limit'; // 若額滿顯示樣式(可選)

            cell.className = classes;
            
            // 樣式處理 (有選時)
            let tagHtml = '';
            if(cfg) {
                const style = cfg.border ? 
                    `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border};` :
                    `background:${cfg.bg}; color:${cfg.text};`;
                tagHtml = `<div class="shift-tag-container"><span class="shift-badge" style="${style}">${cfg.label}</span></div>`;
            }

            // 需求 3: Tooltip (已預班者)
            if (this.currentSchedule.settings.showOtherNames && this.unitNames[d]) {
                cell.title = `已預班者：${this.unitNames[d].join('、')}`;
            }

            // 需求 3: 右下角小人頭
            const bottomInfo = `
                <div class="bottom-stats ${isFull ? 'full' : ''}">
                    <i class="fas fa-user"></i> ${count}/${dailyLimit}
                </div>`;

            cell.innerHTML = `
                <div class="day-number ${isWeekend ? 'weekend-text' : ''}">${d}</div>
                ${tagHtml}
                ${bottomInfo}
            `;

            // 事件綁定
            if(!this.isReadOnly) {
                // 左鍵：切換預設 OFF
                cell.onclick = () => this.toggleDay(d);
                // 右鍵：選單
                cell.oncontextmenu = (e) => this.handleRightClick(e, d);
            }

            grid.appendChild(cell);
        }
    }

    toggleDay(day) {
        // 若已有值則取消，若無值則設為 OFF
        if (this.myWishes[day]) {
            delete this.myWishes[day];
        } else {
            // 檢查上限
            if (!this.checkLimits(day)) return;
            this.myWishes[day] = 'OFF';
        }
        this.renderCalendar();
        this.updateCounters();
    }

    handleRightClick(e, day) {
        e.preventDefault();
        this.tempTarget = day;
        const menu = document.getElementById('user-shift-menu');
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        const day = this.tempTarget;
        if (!day) return;

        if (type) {
            // 檢查上限 (若 type 是 OFF 或 勿排類，通常算入預班額度)
            // 這裡簡化：只要有填都算佔用一個名額
            if (!this.myWishes[day] && !this.checkLimits(day)) return;
            this.myWishes[day] = type;
        } else {
            delete this.myWishes[day];
        }
        
        document.getElementById('user-shift-menu').style.display = 'none';
        this.renderCalendar();
        this.updateCounters();
    }

    checkLimits(day) {
        const settings = this.currentSchedule.settings;
        const maxOff = parseInt(settings.maxOffDays);
        const maxHoliday = parseInt(settings.maxHoliday || 0);
        
        // 總數
        const currentTotal = Object.keys(this.myWishes).length;
        if (currentTotal >= maxOff) { alert("已達預班總數上限"); return false; }

        // 假日
        const date = new Date(this.currentSchedule.year, this.currentSchedule.month-1, day);
        const w = date.getDay();
        if(w===0 || w===6) {
            let hCount = 0;
            Object.keys(this.myWishes).forEach(d => {
                const dt = new Date(this.currentSchedule.year, this.currentSchedule.month-1, d);
                if(dt.getDay()===0 || dt.getDay()===6) hCount++;
            });
            if(hCount >= maxHoliday) { alert("已達假日預班上限"); return false; }
        }
        return true;
    }

    updateCounters() {
        const total = Object.keys(this.myWishes).length;
        let holiday = 0;
        Object.keys(this.myWishes).forEach(d => {
            const date = new Date(this.currentSchedule.year, this.currentSchedule.month - 1, d);
            if(date.getDay() === 0 || date.getDay() === 6) holiday++;
        });

        document.getElementById('count-total').textContent = total;
        document.getElementById('count-holiday').textContent = holiday;
        
        const maxOff = parseInt(this.currentSchedule.settings.maxOffDays);
        const maxHoliday = parseInt(this.currentSchedule.settings.maxHoliday || 0);

        document.getElementById('count-total').className = `badge rounded-pill ${total >= maxOff ? 'bg-danger' : 'bg-primary'}`;
        document.getElementById('count-holiday').className = `badge rounded-pill ${holiday >= maxHoliday ? 'bg-danger' : 'bg-info'}`;
    }

    async handleSubmit() {
        if (this.isReadOnly) return;
        if (!confirm('確定提交預班需求？')) return;

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = '提交中...';

        // 收集偏好
        const batchPref = document.querySelector('input[name="batchPref"]:checked')?.value || "";
        const pref1 = document.getElementById('pref-1').value;
        const pref2 = document.getElementById('pref-2').value;

        const preferences = {
            batch: batchPref,
            priority1: pref1,
            priority2: pref2
        };

        try {
            const res = await PreScheduleService.submitPersonalWish(
                this.currentSchedule.unitId,
                this.currentSchedule.year,
                this.currentSchedule.month,
                this.currentUser.uid,
                this.myWishes,
                document.getElementById('wish-notes').value,
                preferences
            );

            if (res.success) {
                alert('✅ 提交成功！');
                this.loadList(); // 重整清單
                this.showListView(); // 返回列表
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            alert("提交失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '提交預班';
        }
    }
}
