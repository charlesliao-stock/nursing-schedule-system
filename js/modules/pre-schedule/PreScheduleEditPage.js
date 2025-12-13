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
            prevMonthData: {}, 
            prevMonthLast6Days: [],
            unitSettings: null, // 儲存單位設定 (含班別)
            sortConfig: { key: 'staffId', dir: 'asc' } 
        };
        this.activeContextMenu = null; // 追蹤當前開啟的右鍵選單
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤：缺少單位 ID</div>';
        
        // 1. 取得單位設定 (含班別定義)
        this.state.unitSettings = await UnitService.getUnitById(this.state.unitId);
        const unitName = this.state.unitSettings ? this.state.unitSettings.name : '未知單位';

        // 關閉全域右鍵選單 (點擊其他地方關閉)
        document.addEventListener('click', (e) => this.closeContextMenu(e));

        return `
        <div class="page-wrapper">
            <div class="container-fluid p-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-edit text-primary me-2"></i>預班內容編輯 (進階版)
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
                                <span class="me-3"><i class="fas fa-mouse-pointer"></i> 左鍵: 切換 OFF</span>
                                <span class="me-3"><i class="fas fa-mouse-pointer"></i> 右鍵: 選擇班別/勿排</span>
                                <span class="badge bg-warning text-dark border me-1">OFF</span> 預休
                                <span class="badge bg-info text-white border me-1 ms-2">班</span> 指定
                                <span class="badge bg-danger text-white border me-1 ms-2">X</span> 勿排
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
                    
                    <div class="card-body p-0 position-relative">
                        <div id="schedule-grid-container" class="table-responsive" style="max-height: 75vh; overflow: auto;">
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary"></div>
                                <div class="mt-2 text-muted">正在載入資料...</div>
                            </div>
                        </div>
                        
                        <div id="context-menu" class="dropdown-menu shadow" style="display:none; position:fixed; z-index:10000;"></div>
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
            // 1. 載入預班表
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            
            // 2. 準備人員名單
            let staffList = [];
            if (preSchedule && preSchedule.staffIds && preSchedule.staffIds.length > 0) {
                const promises = preSchedule.staffIds.map(uid => userService.getUserData(uid));
                const users = await Promise.all(promises);
                staffList = users.filter(u => u);
            } else {
                staffList = await userService.getUnitStaff(this.state.unitId);
            }

            // 3. 資料整合
            const supportIds = preSchedule?.supportStaffIds || [];
            this.state.staffList = staffList.map(u => {
                u.isSupport = supportIds.includes(u.uid) || u.unitId !== this.state.unitId;
                return u;
            });

            this.state.submissions = preSchedule ? preSchedule.submissions || {} : {};

            // 4. 載入上個月班表 (by UID)
            await this.loadPrevMonthData();

            // 5. 渲染
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
        
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        const last6Days = [];
        for (let i = 5; i >= 0; i--) { last6Days.push(daysInPrevMonth - i); }
        this.state.prevMonthLast6Days = last6Days;

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
            let valA = a[sortKey] || '';
            let valB = b[sortKey] || '';
            if (sortKey === 'staffId') {
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

        // --- 1. 表頭 ---
        let headerHtml = `
            <th class="sticky-col col-1 bg-light text-center" style="min-width: 90px; cursor:pointer;" onclick="window.routerPage.handleSort('staffId')">職編 ${getSortIcon('staffId')}</th>
            <th class="sticky-col col-2 bg-light text-center" style="min-width: 100px;">姓名</th>
            <th class="sticky-col col-3 bg-light text-center" style="min-width: 120px;">特殊註記</th>
            <th class="sticky-col col-4 bg-light text-center" style="min-width: 250px;">排班偏好 (包班 / 偏好1-3)</th>
        `;

        // 上月
        this.state.prevMonthLast6Days.forEach(d => {
            headerHtml += `<th class="text-center p-1 bg-secondary bg-opacity-10 text-muted" style="min-width: 35px; border-bottom: 2px solid #ccc;"><div style="font-size:0.7em">上月</div><div>${d}</div></th>`;
        });

        // 本月
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month - 1, d);
            const dayOfWeek = date.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const colorClass = isWeekend ? 'text-danger fw-bold' : 'text-dark';
            headerHtml += `<th class="text-center p-1 bg-light" style="min-width: 40px;"><div class="${colorClass}" style="font-size:0.8em">${weekDays[dayOfWeek]}</div><div class="${colorClass}">${d}</div></th>`;
        }
        headerHtml += `<th class="text-center bg-light" style="min-width: 60px;">預休</th>`;

        // --- 2. 內容 ---
        let bodyHtml = '';
        this.state.staffList.forEach(staff => {
            // 初始化/讀取 Submission 資料
            if (!this.state.submissions[staff.uid]) this.state.submissions[staff.uid] = { wishes: {}, preferences: {} };
            const sub = this.state.submissions[staff.uid];
            const wishes = sub.wishes || {};
            const prefs = sub.preferences || {};

            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem">支</span>' : '';
            
            // 資料來源：特殊註記來自 User Profile (唯讀)，排班偏好來自 Submission (可由管理員編輯)
            const specialNote = staff.note || staff.specialNote || ''; 
            
            // 偏好顯示 (可編輯 Input)
            const prefInput = `
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control px-1 text-center" placeholder="包班" value="${prefs.bundle || ''}" onchange="window.routerPage.updatePreference('${staff.uid}', 'bundle', this.value)" title="包班偏好">
                    <input type="text" class="form-control px-1 text-center" placeholder="1" value="${prefs.p1 || ''}" onchange="window.routerPage.updatePreference('${staff.uid}', 'p1', this.value)" title="偏好1">
                    <input type="text" class="form-control px-1 text-center" placeholder="2" value="${prefs.p2 || ''}" onchange="window.routerPage.updatePreference('${staff.uid}', 'p2', this.value)" title="偏好2">
                    <input type="text" class="form-control px-1 text-center" placeholder="3" value="${prefs.p3 || ''}" onchange="window.routerPage.updatePreference('${staff.uid}', 'p3', this.value)" title="偏好3">
                </div>`;

            let rowHtml = `
                <td class="sticky-col col-1 text-center fw-bold text-secondary bg-white">${staff.staffId || ''}</td>
                <td class="sticky-col col-2 text-center fw-bold bg-white text-nowrap">${staff.name} ${isSupport}</td>
                <td class="sticky-col col-3 text-start small bg-white text-truncate text-danger fw-bold" title="${specialNote}">${specialNote}</td>
                <td class="sticky-col col-4 bg-white p-1">${prefInput}</td>
            `;

            // 上月班表
            this.state.prevMonthLast6Days.forEach(d => {
                const shift = (this.state.prevMonthData[staff.uid] || {})[d] || ''; 
                rowHtml += `<td class="text-center p-0 align-middle bg-secondary bg-opacity-10 text-muted" style="border:1px solid #e0e0e0; font-size:0.85em;">${shift}</td>`;
            });

            // 本月格子
            let offCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
                const wish = wishes[d] || '';
                if (wish === 'OFF' || wish === 'M_OFF') offCount++;

                // 樣式判斷
                let cellClass = '';
                let cellText = wish;
                
                if (wish === 'OFF') {
                    cellClass = 'bg-warning text-dark opacity-75 fw-bold'; // 一般預休
                } else if (['D','E','N'].includes(wish)) {
                    cellClass = 'bg-info text-white fw-bold'; // 指定班別
                } else if (wish.startsWith('NO_')) {
                    cellClass = 'bg-danger text-white fw-bold'; // 勿排
                    cellText = 'X ' + wish.replace('NO_', '');
                } else if (wish) {
                    cellClass = 'bg-primary text-white'; // 其他
                }

                // 假日底色
                const date = new Date(this.state.year, this.state.month - 1, d);
                const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
                if (isWeekend && !wish) cellClass = 'bg-light';

                rowHtml += `
                    <td class="text-center p-0 align-middle ${cellClass}" 
                        style="cursor: pointer; height: 40px; border: 1px solid #dee2e6; user-select: none;"
                        onclick="window.routerPage.handleCellClick('${staff.uid}', ${d})"
                        oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})">
                        <div style="font-size: 0.9rem;">${cellText}</div>
                    </td>
                `;
            }

            rowHtml += `<td class="text-center fw-bold">${offCount}</td>`;
            bodyHtml += `<tr>${rowHtml}</tr>`;
        });

        container.innerHTML = `
            <table class="table table-bordered table-sm mb-0" style="min-width: 100%; border-collapse: separate; border-spacing: 0;">
                <thead class="sticky-top" style="z-index: 20;"><tr>${headerHtml}</tr></thead>
                <tbody>${bodyHtml}</tbody>
            </table>`;
        
        this.addStickyStyles();
    }

    addStickyStyles() {
        if (document.getElementById('matrix-sticky-style')) return;
        const style = document.createElement('style');
        style.id = 'matrix-sticky-style';
        style.innerHTML = `
            .sticky-col { position: -webkit-sticky; position: sticky; z-index: 10; border-right: 1px solid #dee2e6; }
            .col-1 { left: 0; }
            .col-2 { left: 90px; }
            .col-3 { left: 190px; }
            .col-4 { left: 310px; box-shadow: 4px 0 5px -2px rgba(0,0,0,0.1); }
            thead .sticky-col { z-index: 30 !important; }
            .dropdown-item:hover { background-color: #f8f9fa; color: #0d6efd; }
        `;
        document.head.appendChild(style);
    }

    // --- 互動邏輯 ---

    // 左鍵：切換 OFF / 清除
    handleCellClick(uid, day) {
        if (!this.state.submissions[uid].wishes) this.state.submissions[uid].wishes = {};
        const current = this.state.submissions[uid].wishes[day];

        if (current === 'OFF') {
            delete this.state.submissions[uid].wishes[day];
        } else {
            this.state.submissions[uid].wishes[day] = 'OFF';
        }
        this.renderMatrixGrid();
    }

    // 右鍵：顯示選單
    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.closeContextMenu();

        const menu = document.getElementById('context-menu');
        const shifts = this.state.unitSettings?.settings?.shifts || [
            {code:'D', name:'白班'}, {code:'E', name:'小夜'}, {code:'N', name:'大夜'}
        ];

        let menuHtml = `<h6 class="dropdown-header bg-light">設定 ${day} 日預班</h6>`;
        
        // 1. 一般班別
        menuHtml += `<button class="dropdown-item" onclick="window.routerPage.setWish('${uid}', ${day}, 'OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 預休</button>`;
        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item" onclick="window.routerPage.setWish('${uid}', ${day}, '${s.code}')"><span class="badge bg-info text-white w-25 me-2">${s.code}</span> ${s.name}</button>`;
        });

        menuHtml += `<div class="dropdown-divider"></div><h6 class="dropdown-header text-danger">負向排班 (勿排)</h6>`;
        
        // 2. 勿排班別
        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item text-danger" onclick="window.routerPage.setWish('${uid}', ${day}, 'NO_${s.code}')"><i class="fas fa-ban w-25 me-2"></i> 勿排 ${s.name}</button>`;
        });

        menuHtml += `<div class="dropdown-divider"></div>`;
        menuHtml += `<button class="dropdown-item text-secondary" onclick="window.routerPage.setWish('${uid}', ${day}, '')"><i class="fas fa-eraser w-25 me-2"></i> 清除設定</button>`;

        menu.innerHTML = menuHtml;
        menu.style.display = 'block';
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        
        this.activeContextMenu = menu;
    }

    setWish(uid, day, value) {
        if (!this.state.submissions[uid].wishes) this.state.submissions[uid].wishes = {};
        if (value === '') {
            delete this.state.submissions[uid].wishes[day];
        } else {
            this.state.submissions[uid].wishes[day] = value;
        }
        this.closeContextMenu();
        this.renderMatrixGrid();
    }

    closeContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    }

    // 更新偏好設定 (包班、P1~P3)
    updatePreference(uid, field, value) {
        if (!this.state.submissions[uid]) this.state.submissions[uid] = { wishes: {}, preferences: {} };
        if (!this.state.submissions[uid].preferences) this.state.submissions[uid].preferences = {};
        
        this.state.submissions[uid].preferences[field] = value.trim();
        // 這裡不需要重繪整個 Grid，因為是 Input 變更，但為了資料一致性建議在 Save 時統一處理
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

    // --- 支援人員邏輯 ---
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
                item.innerHTML = `<div><span class="fw-bold">${u.name}</span> <small class="text-muted">(${u.staffId})</small></div><span class="badge bg-primary"><i class="fas fa-plus"></i></span>`;
                item.onclick = () => this.addSupportStaff(u);
                resultArea.appendChild(item);
            });
        } catch(e) { console.error(e); }
    }

    async addSupportStaff(user) {
        if(!confirm(`將 ${user.name} 加入本月支援名單？`)) return;
        try {
            await PreScheduleService.addSupportStaff(this.state.unitId, this.state.year, this.state.month, user.uid);
            await this.loadData();
            alert("加入成功！");
            if(this.supportModal) this.supportModal.hide();
        } catch(e) { alert("加入失敗: " + e.message); }
    }
    
    exportExcel() { alert("功能實作中"); }
}
