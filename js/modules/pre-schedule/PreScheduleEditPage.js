import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; 

export class PreScheduleEditPage {
    constructor() {
        this.state = { 
            unitId: null, 
            year: null, 
            month: null, 
            staffList: [], 
            submissions: {}, 
            prevMonthData: {}, // 存放上個月的班表 { uid: { day: shift } }
            prevMonthLast6Days: [], // 存放上個月最後 6 天的日期數字 [26, 27, 28...]
            sortConfig: { key: 'staffId', dir: 'asc' } 
        };
        this.detailModal = null;
        this.supportModal = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤：缺少單位 ID</div>';
        
        const unit = await UnitService.getUnitById(this.state.unitId);
        const unitName = unit ? unit.name : '未知單位';

        return `
        <div class="page-wrapper">
            <div class="container-fluid p-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-edit text-primary me-2"></i>預班內容編輯 (大表)
                        </h2>
                        <span class="badge bg-primary fs-6 ms-3"><i class="fas fa-hospital me-1"></i> ${unitName}</span>
                        <span class="badge bg-white text-dark border ms-2 fs-6 shadow-sm">${this.state.year}年 ${this.state.month}月</span>
                    </div>
                    <div>
                        <button class="btn btn-outline-secondary me-2 shadow-sm" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 回列表
                        </button>
                        <button class="btn btn-primary shadow-sm" onclick="window.routerPage.saveReview()">
                            <i class="fas fa-save"></i> 儲存變更
                        </button>
                    </div>
                </div>

                <div class="card shadow border-0">
                    <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <h6 class="m-0 fw-bold text-primary"><i class="fas fa-th me-1"></i> 排班工作台</h6>
                            <div class="small text-muted border-start ps-3 d-flex align-items-center">
                                <span class="me-3"><span class="badge bg-secondary opacity-50 me-1">上月</span> 參考用</span>
                                <span class="me-3"><span class="badge bg-warning text-dark border me-1">OFF</span> 預休</span>
                                <span><i class="fas fa-info-circle"></i> 點擊白色格子可修改</span>
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-success btn-sm" onclick="window.routerPage.openAddSupportModal()">
                                <i class="fas fa-user-plus"></i> 支援人員
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="window.routerPage.exportExcel()">
                                <i class="fas fa-file-excel"></i> 匯出
                            </button>
                        </div>
                    </div>
                    
                    <div class="card-body p-0">
                        <div id="schedule-grid-container" class="table-responsive" style="max-height: 75vh; overflow: auto;">
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary"></div>
                                <div class="mt-2 text-muted">正在載入矩陣大表...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="add-support-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title">加入跨單位支援</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="input-group mb-3">
                                <input type="text" id="support-search-input" class="form-control" placeholder="輸入員編或姓名">
                                <button class="btn btn-outline-secondary" onclick="window.routerPage.searchStaff()">搜尋</button>
                            </div>
                            <div id="search-result-area" class="list-group"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    async afterRender() {
        window.routerPage = this; 
        const m = document.getElementById('add-support-modal');
        if(m) this.supportModal = new bootstrap.Modal(m);
        await this.loadData();
    }

    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        try {
            // 1. 載入預班表設定
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            
            // 2. 準備人員名單
            let staffList = [];
            // 若已有預班表，優先使用儲存的名單 (含支援人員)
            if (preSchedule && preSchedule.staffIds && preSchedule.staffIds.length > 0) {
                const promises = preSchedule.staffIds.map(uid => userService.getUserData(uid));
                const users = await Promise.all(promises);
                staffList = users.filter(u => u);
            } else {
                // 否則載入單位現有人員
                staffList = await userService.getUnitStaff(this.state.unitId);
            }

            // 標記與資料補充
            const supportIds = preSchedule?.supportStaffIds || [];
            this.state.staffList = staffList.map(u => {
                u.isSupport = supportIds.includes(u.uid) || u.unitId !== this.state.unitId;
                // 模擬資料：若 User 沒有這些欄位，先給空值
                u.specialNote = u.specialNote || u.note || ''; // 特殊註記 (懷孕等)
                u.preferences = u.preferences || '';         // 排班偏好 (包班等)
                return u;
            });

            this.state.submissions = preSchedule ? preSchedule.submissions || {} : {};

            // 3. 載入上個月班表 (抓取最後 6 天)
            await this.loadPrevMonthData();

            // 4. 初始排序並渲染
            this.handleSort('staffId', false);

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="alert alert-danger m-4">載入失敗: ${e.message}</div>`;
        }
    }

    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        
        // 計算上個月的最後 6 天日期
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate(); // e.g., 30, 31
        const last6Days = [];
        for (let i = 5; i >= 0; i--) {
            last6Days.push(daysInPrevMonth - i);
        }
        this.state.prevMonthLast6Days = last6Days;

        // 依 User UID 抓取個人班表
        const promises = this.state.staffList.map(async (staff) => {
            try {
                const schedule = await ScheduleService.getPersonalSchedule(staff.uid, prevYear, prevMonth);
                let shifts = {};
                if (schedule && schedule.assignments) shifts = schedule.assignments; 
                else if (schedule) shifts = schedule;
                return { uid: staff.uid, shifts: shifts };
            } catch { return { uid: staff.uid, shifts: {} }; }
        });

        const results = await Promise.all(promises);
        const map = {};
        results.forEach(res => { map[res.uid] = res.shifts; });
        this.state.prevMonthData = map;
    }

    handleSort(key, toggle = true) {
        if (toggle && this.state.sortConfig.key === key) {
            this.state.sortConfig.dir = this.state.sortConfig.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.sortConfig.key = key;
            if (toggle) this.state.sortConfig.dir = 'asc';
        }
        const { key: sortKey, dir } = this.state.sortConfig;
        const multiplier = dir === 'asc' ? 1 : -1;

        this.state.staffList.sort((a, b) => {
            // 支援人員排最後 (可選)
            // if (a.isSupport !== b.isSupport) return a.isSupport ? 1 : -1;

            let valA = a[sortKey] || '';
            let valB = b[sortKey] || '';

            if (sortKey === 'staffId') {
                // 數字/字串混合排序
                const numA = parseFloat(valA); const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * multiplier;
            }
            return String(valA).localeCompare(String(valB), 'zh-Hant') * multiplier;
        });

        this.renderMatrixGrid();
    }

    renderMatrixGrid() {
        const container = document.getElementById('schedule-grid-container');
        const daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        const { key: sortKey, dir: sortDir } = this.state.sortConfig;

        const getSortIcon = (k) => sortKey !== k ? '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>' : (sortDir === 'asc' ? '<i class="fas fa-sort-up text-dark ms-1"></i>' : '<i class="fas fa-sort-down text-dark ms-1"></i>');

        // --- 1. 建立表頭 ---
        // 前四欄固定
        let headerHtml = `
            <th class="sticky-col col-1 bg-light text-center" style="min-width: 90px; cursor:pointer;" onclick="window.routerPage.handleSort('staffId')">
                職編 ${getSortIcon('staffId')}
            </th>
            <th class="sticky-col col-2 bg-light text-center" style="min-width: 100px;">姓名</th>
            <th class="sticky-col col-3 bg-light text-center" style="min-width: 120px;">特殊註記</th>
            <th class="sticky-col col-4 bg-light text-center" style="min-width: 120px;">排班偏好</th>
        `;

        // 上個月最後 6 天 (分隔線 + 灰色背景)
        this.state.prevMonthLast6Days.forEach(d => {
            headerHtml += `
                <th class="text-center p-1 bg-secondary bg-opacity-10 text-muted" style="min-width: 35px; border-bottom: 2px solid #ccc;">
                    <div style="font-size: 0.75rem;">上月</div>
                    <div style="font-size: 0.9rem;">${d}</div>
                </th>`;
        });

        // 本月日期
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month - 1, d);
            const dayOfWeek = date.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const colorClass = isWeekend ? 'text-danger fw-bold' : 'text-dark';
            
            headerHtml += `
                <th class="text-center p-1 bg-light" style="min-width: 40px;">
                    <div class="${colorClass}" style="font-size: 0.8rem;">${weekDays[dayOfWeek]}</div>
                    <div class="${colorClass}" style="font-size: 1rem;">${d}</div>
                </th>`;
        }
        
        // 統計欄
        headerHtml += `<th class="text-center bg-light" style="min-width: 60px;">預休</th>`;

        // --- 2. 建立內容列 ---
        let bodyHtml = '';
        this.state.staffList.forEach(staff => {
            const sub = this.state.submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            
            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem">支</span>' : '';
            
            // 固定欄位內容
            let rowHtml = `
                <td class="sticky-col col-1 text-center fw-bold text-secondary bg-white">${staff.staffId || ''}</td>
                <td class="sticky-col col-2 text-center fw-bold bg-white text-nowrap">${staff.name} ${isSupport}</td>
                <td class="sticky-col col-3 text-start small bg-white text-truncate" title="${staff.specialNote || ''}">${staff.specialNote || ''}</td>
                <td class="sticky-col col-4 text-start small bg-white text-truncate" title="${staff.preferences || ''}">${staff.preferences || ''}</td>
            `;

            // 上個月最後 6 天 (唯讀、灰底)
            this.state.prevMonthLast6Days.forEach(d => {
                const shift = (this.state.prevMonthData[staff.uid] || {})[d] || ''; 
                // 若無班則留白
                const displayShift = shift || '';
                rowHtml += `
                    <td class="text-center p-0 align-middle bg-secondary bg-opacity-10 text-muted" 
                        style="height: 40px; border: 1px solid #e0e0e0;">
                        <div style="font-size: 0.85rem;">${displayShift}</div>
                    </td>
                `;
            });

            // 本月預班 (可編輯)
            let offCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
                const wish = wishes[d] || '';
                if (wish === 'OFF' || wish === 'M_OFF') offCount++;

                let cellClass = '';
                let cellText = '';

                if (wish === 'OFF') {
                    cellClass = 'bg-warning text-dark opacity-75'; 
                    cellText = 'OFF';
                } else if (wish === 'M_OFF') {
                    cellClass = 'bg-dark text-white'; 
                    cellText = 'OFF';
                } else if (wish) {
                    cellClass = 'bg-info text-white'; 
                    cellText = wish;
                }

                const date = new Date(this.state.year, this.state.month - 1, d);
                const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
                if (isWeekend && !wish) cellClass = 'bg-light'; // 週末淡灰底

                rowHtml += `
                    <td class="text-center p-0 align-middle ${cellClass}" 
                        style="cursor: pointer; height: 40px; border: 1px solid #dee2e6;"
                        onclick="window.routerPage.editCell('${staff.uid}', ${d})">
                        <div style="font-weight: bold; font-size: 0.9rem;">${cellText}</div>
                    </td>
                `;
            }

            // 統計
            rowHtml += `<td class="text-center fw-bold">${offCount}</td>`;

            bodyHtml += `<tr>${rowHtml}</tr>`;
        });

        container.innerHTML = `
            <table class="table table-bordered table-sm mb-0" style="min-width: 100%; border-collapse: separate; border-spacing: 0;">
                <thead class="sticky-top" style="z-index: 20;">
                    <tr>${headerHtml}</tr>
                </thead>
                <tbody>
                    ${bodyHtml}
                </tbody>
            </table>
        `;
        
        this.addStickyStyles();
    }

    addStickyStyles() {
        if (document.getElementById('matrix-sticky-style')) return;
        const style = document.createElement('style');
        style.id = 'matrix-sticky-style';
        style.innerHTML = `
            .sticky-col { position: -webkit-sticky; position: sticky; z-index: 10; border-right: 1px solid #dee2e6; }
            .col-1 { left: 0; }
            .col-2 { left: 90px; } /* 根據 col-1 寬度調整 */
            .col-3 { left: 190px; } /* 根據 col-1+2 寬度調整 */
            .col-4 { left: 310px; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1); } /* 最後一欄加陰影 */
            
            /* 讓表頭層級最高 */
            thead .sticky-col { z-index: 30 !important; }
        `;
        document.head.appendChild(style);
    }

    async editCell(uid, day) {
        // 點擊編輯
        const staff = this.state.staffList.find(s => s.uid === uid);
        const currentWish = this.state.submissions[uid]?.wishes?.[day] || '';
        
        const input = prompt(`${staff.name} ${day}日預班 (輸入 OFF, D, E, N, 或空白清除):`, currentWish);
        
        if (input !== null) {
            const val = input.trim().toUpperCase();
            if (!this.state.submissions[uid]) this.state.submissions[uid] = { wishes: {}, name: staff.name };
            if (!this.state.submissions[uid].wishes) this.state.submissions[uid].wishes = {};
            
            if (val === '') delete this.state.submissions[uid].wishes[day];
            else this.state.submissions[uid].wishes[day] = val;

            // 局部重繪太麻煩，直接重繪整個 Matrix (效能通常還行)
            this.renderMatrixGrid();
        }
    }

    async saveReview() {
        if(!confirm("確定儲存所有變更？")) return;
        try {
            await PreScheduleService.updatePreScheduleSubmissions(
                this.state.unitId, 
                this.state.year, 
                this.state.month, 
                this.state.submissions
            );
            alert("✅ 儲存成功");
        } catch(e) {
            alert("儲存失敗: " + e.message);
        }
    }

    // --- 支援人員邏輯 (同前) ---
    openAddSupportModal() { if(this.supportModal) this.supportModal.show(); }
    
    async searchStaff() {
        const input = document.getElementById('support-search-input').value.trim();
        const resultArea = document.getElementById('search-result-area');
        if(!input) return alert("請輸入關鍵字");
        
        resultArea.innerHTML = '<div class="text-center p-2 text-muted">搜尋中...</div>';
        
        try {
            const allUsers = await userService.getAllUsers(); 
            const found = allUsers.filter(u => (u.staffId && u.staffId.includes(input)) || (u.name && u.name.includes(input)));

            resultArea.innerHTML = '';
            if (found.length === 0) {
                resultArea.innerHTML = '<div class="text-center p-2 text-muted">找不到符合的人員</div>';
                return;
            }

            found.forEach(u => {
                if (this.state.staffList.find(s => s.uid === u.uid)) return; 

                const item = document.createElement('button');
                item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                item.innerHTML = `
                    <div><span class="fw-bold">${u.name}</span> <small class="text-muted">(${u.staffId})</small><br><span class="badge bg-light text-dark border">${u.unitName || '未知單位'}</span></div>
                    <span class="badge bg-primary rounded-pill"><i class="fas fa-plus"></i></span>
                `;
                item.onclick = () => this.addSupportStaff(u);
                resultArea.appendChild(item);
            });
        } catch(e) { console.error(e); resultArea.innerHTML = '<div class="text-danger p-2">搜尋發生錯誤</div>'; }
    }

    async addSupportStaff(user) {
        if(!confirm(`將 ${user.name} 加入本月支援名單？`)) return;
        try {
            // 加入支援人員後，需寫入 DB
            await PreScheduleService.addSupportStaff(this.state.unitId, this.state.year, this.state.month, user.uid);
            await this.loadData(); // 重新載入以顯示
            alert("加入成功！");
            if(this.supportModal) this.supportModal.hide();
        } catch(e) { alert("加入失敗: " + e.message); }
    }
    
    exportExcel() { alert("功能實作中"); }
    remindUnsubmitted() { alert("功能實作中"); }
}
