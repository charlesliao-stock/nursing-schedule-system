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
            unitSettings: null, 
            sortConfig: { key: 'staffId', dir: 'asc' } 
        };
        this.activeContextMenu = null; 
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤：缺少單位 ID</div>';
        
        this.state.unitSettings = await UnitService.getUnitById(this.state.unitId);
        const unitName = this.state.unitSettings ? this.state.unitSettings.unitName : '未知單位';

        document.addEventListener('click', (e) => this.closeContextMenu(e));

        return `
        <div class="page-wrapper">
            <div class="container-fluid p-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="d-flex align-items-center">
                        <h4 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-edit text-primary me-2"></i>預班內容編輯
                        </h4>
                        <span class="badge bg-primary fs-6 ms-3"><i class="fas fa-hospital me-1"></i> ${unitName}</span>
                        <span class="badge bg-white text-dark border ms-2 fs-6 shadow-sm">${this.state.year}年 ${this.state.month}月</span>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-secondary me-2 shadow-sm" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 回列表
                        </button>
                        <button class="btn btn-sm btn-primary shadow-sm" onclick="window.routerPage.saveReview()">
                            <i class="fas fa-save"></i> 儲存變更
                        </button>
                    </div>
                </div>

                <div class="card shadow border-0">
                    <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3 small">
                            <span class="fw-bold text-primary"><i class="fas fa-th me-1"></i> 排班工作台</span>
                            
                            <div class="alert alert-info py-0 px-2 mb-0 border-0" style="font-size: 0.85rem;">
                                <i class="fas fa-mouse-pointer me-1"></i> <strong>提示：</strong>在格子上按 <b>右鍵</b> 可選擇班別
                            </div>

                            <div class="border-start ps-2 text-muted d-flex align-items-center gap-2">
                                <span class="badge bg-warning text-dark border" style="font-size: 0.7rem;">OFF</span>預休
                                <span class="badge bg-dark text-white border" style="font-size: 0.7rem;">M_FF</span>強休
                                <span class="badge bg-danger text-white border" style="font-size: 0.7rem;">X</span>勿排
                                <span class="ms-2 d-flex align-items-center"><div style="width:12px;height:12px;background:#f8d7da;border:1px solid #f5c6cb;margin-right:4px;"></div>未交</span>
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-success btn-sm py-0" onclick="window.routerPage.openAddSupportModal()">
                                <i class="fas fa-user-plus"></i> 支援
                            </button>
                            <button class="btn btn-outline-primary btn-sm py-0" onclick="window.routerPage.exportExcel()">
                                <i class="fas fa-file-excel"></i> 匯出
                            </button>
                            <button class="btn btn-outline-danger btn-sm py-0" onclick="window.routerPage.remindUnsubmitted()">
                                <i class="fas fa-bell"></i> 催繳
                            </button>
                        </div>
                    </div>
                    
                    <div class="card-body p-0 position-relative">
                        <div id="schedule-grid-container" class="table-responsive" style="max-height: 80vh; overflow: auto;">
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
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            
            let staffList = [];
            if (preSchedule && preSchedule.staffIds && preSchedule.staffIds.length > 0) {
                const promises = preSchedule.staffIds.map(uid => userService.getUserData(uid));
                const users = await Promise.all(promises);
                staffList = users.filter(u => u);
            } else {
                staffList = await userService.getUnitStaff(this.state.unitId);
            }

            const supportIds = preSchedule?.supportStaffIds || [];
            
            this.state.staffList = staffList.map(u => {
                u.isSupport = supportIds.includes(u.uid) || u.unitId !== this.state.unitId;
                u.isPregnant = !!u.isPregnant; 
                return u;
            });

            this.state.submissions = preSchedule ? preSchedule.submissions || {} : {};

            await this.loadPrevMonthData();
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

        const maxShiftTypes = this.state.unitSettings?.rules?.constraints?.maxShiftTypesWeek || 3;
        
        // --- 1. 表頭 ---
        // ✅ 修正：縮小欄寬，姓名改為 60px
        let headerHtml = `
            <th class="sticky-col col-1 bg-light text-center px-1" style="width: 70px; cursor:pointer;" onclick="window.routerPage.handleSort('staffId')">
                <small>職編</small>${getSortIcon('staffId')}
            </th>
            <th class="sticky-col col-2 bg-light text-center px-1" style="width: 60px;">姓名</th>
            <th class="sticky-col col-3 bg-light text-center px-1" style="width: 40px;" title="特殊註記">註</th>
            <th class="sticky-col col-4 bg-light text-center px-1" style="width: ${maxShiftTypes===3?'140px':'110px'};">
                <small>排班偏好</small>
            </th>
        `;

        // 上月
        this.state.prevMonthLast6Days.forEach(d => {
            headerHtml += `
                <th class="text-center p-0 bg-secondary bg-opacity-10 text-muted border-bottom border-secondary" style="width: 28px;">
                    <div style="font-size: 0.65rem; transform: scale(0.9);">上月</div>
                    <div style="font-size: 0.75rem;">${d}</div>
                </th>`;
        });

        // 本月
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month - 1, d);
            const dayOfWeek = date.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const colorClass = isWeekend ? 'text-danger fw-bold' : 'text-dark';
            
            headerHtml += `
                <th class="text-center p-0 bg-light border-bottom border-dark" style="width: 32px;">
                    <div class="${colorClass}" style="font-size: 0.75rem;">${weekDays[dayOfWeek]}</div>
                    <div class="${colorClass}" style="font-size: 0.9rem;">${d}</div>
                </th>`;
        }
        headerHtml += `<th class="text-center bg-light px-1" style="width: 40px;"><small>預休</small></th>`;

        // --- 2. 內容 ---
        let bodyHtml = '';
        this.state.staffList.forEach(staff => {
            if (!this.state.submissions[staff.uid]) this.state.submissions[staff.uid] = { wishes: {}, preferences: {} };
            const sub = this.state.submissions[staff.uid];
            const wishes = sub.wishes || {};
            const prefs = sub.preferences || {};
            const isSubmitted = sub.isSubmitted;

            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.5rem; padding: 2px 3px;">支</span>' : '';
            
            const nameCellClass = isSubmitted ? 'bg-white' : 'table-danger'; 
            const nameCellTitle = isSubmitted ? '' : '此人尚未提交預班';

            let noteBadge = '';
            if (staff.isPregnant) {
                noteBadge = `<span class="badge bg-danger rounded-circle p-1 d-flex align-items-center justify-content-center" title="懷孕" style="width:20px;height:20px;font-size:0.7rem;">孕</span>`;
            } else if (staff.specialNote) {
                noteBadge = `<span class="badge bg-info rounded-circle p-1 d-flex align-items-center justify-content-center" title="${staff.specialNote}" style="width:20px;height:20px;">!</span>`;
            }

            let bundleHtml = '';
            if (prefs.batch) {
                const label = prefs.batch === 'N' ? '大' : (prefs.batch === 'E' ? '小' : prefs.batch);
                bundleHtml = `<span class="badge bg-primary" style="font-size:0.7rem;" title="包班:${label}">包${label}</span>`;
            } else {
                bundleHtml = `<span class="text-muted small">-</span>`;
            }

            const genSelect = (val, key) => `
                <select class="form-select form-select-sm p-0 text-center border-0 bg-transparent fw-bold" 
                        style="height: 24px; font-size: 0.8rem; cursor: pointer;"
                        onchange="window.routerPage.updatePreference('${staff.uid}', '${key}', this.value)">
                    <option value="" ${!val?'selected':''}></option>
                    <option value="D" ${val==='D'?'selected':''}>D</option>
                    <option value="E" ${val==='E'?'selected':''}>E</option>
                    <option value="N" ${val==='N'?'selected':''}>N</option>
                </select>`;

            let prefHtml = `
                <div class="d-flex align-items-center justify-content-between px-1" style="height: 100%;">
                    <div style="width: 35px; text-align: center;">${bundleHtml}</div>
                    <div style="width: 1px; height: 16px; background: #ddd;"></div>
                    <div style="width: 25px;">${genSelect(prefs.priority1, 'priority1')}</div>
                    <div style="width: 25px;">${genSelect(prefs.priority2, 'priority2')}</div>
                    ${maxShiftTypes === 3 ? `<div style="width: 25px;">${genSelect(prefs.priority3, 'priority3')}</div>` : ''}
                </div>`;

            // ✅ 修正：姓名欄 max-width 設定為 60px
            let rowHtml = `
                <td class="sticky-col col-1 text-center fw-bold text-secondary bg-white"><small>${staff.staffId || ''}</small></td>
                
                <td class="sticky-col col-2 text-start p-0 ps-1 align-middle text-truncate ${nameCellClass}" 
                    title="${nameCellTitle}" style="max-width: 60px; font-size: 0.85rem;">
                    ${staff.name} ${isSupport}
                </td>
                
                <td class="sticky-col col-3 text-center bg-white p-0 align-middle">${noteBadge}</td>
                <td class="sticky-col col-4 bg-white p-0 align-middle border-end">${prefHtml}</td>
            `;

            this.state.prevMonthLast6Days.forEach(d => {
                const shift = (this.state.prevMonthData[staff.uid] || {})[d] || ''; 
                rowHtml += `
                    <td class="text-center p-0 align-middle bg-secondary bg-opacity-10 text-muted border-end border-light" 
                        style="border:1px solid #e0e0e0; font-size:0.75rem; cursor:pointer;"
                        onclick="window.routerPage.editPrevMonthCell('${staff.uid}', ${d}, '${shift}')"
                        title="上月 ${d} 日 (點擊修改)">
                        ${shift}
                    </td>`;
            });

            let offCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
                const wish = wishes[d] || '';
                
                let cellClass = '';
                let cellText = wish;
                const smallFont = 'font-size: 0.75rem;';

                if (wish === 'OFF') {
                    cellClass = 'bg-warning text-dark opacity-75'; 
                    cellText = 'OFF';
                    offCount++;
                } else if (wish === 'M_OFF') {
                    cellClass = 'bg-dark text-white'; 
                    cellText = 'M_FF';
                    offCount++;
                } else if (['D','E','N'].includes(wish)) {
                    cellClass = 'bg-info text-white fw-bold'; 
                } else if (wish.startsWith('NO_')) {
                    cellClass = 'bg-danger text-white fw-bold'; 
                    cellText = 'X'; 
                } else if (wish) {
                    cellClass = 'bg-primary text-white'; 
                }

                const date = new Date(this.state.year, this.state.month - 1, d);
                const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
                if (isWeekend && !wish) cellClass = 'bg-light';

                rowHtml += `
                    <td class="text-center p-0 align-middle ${cellClass}" 
                        style="cursor: pointer; height: 32px; border-right: 1px solid #eee; border-bottom: 1px solid #eee; user-select: none;"
                        onclick="window.routerPage.handleCellClick('${staff.uid}', ${d})"
                        oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})">
                        <div style="${smallFont} font-weight: 500;">${cellText}</div>
                    </td>
                `;
            }

            rowHtml += `<td class="text-center fw-bold small bg-light">${offCount}</td>`;
            bodyHtml += `<tr>${rowHtml}</tr>`;
        });

        container.innerHTML = `
            <table class="table table-sm mb-0" style="min-width: 100%; border-collapse: separate; border-spacing: 0;">
                <thead class="sticky-top" style="z-index: 20;"><tr>${headerHtml}</tr></thead>
                <tbody>${bodyHtml}</tbody>
            </table>`;
        
        this.addStickyStyles(maxShiftTypes);
    }

    addStickyStyles(maxTypes) {
        if (document.getElementById('matrix-sticky-style')) document.getElementById('matrix-sticky-style').remove();
        const style = document.createElement('style');
        style.id = 'matrix-sticky-style';
        
        // ✅ 修正：重新計算 left 位置
        // w1(職編)=70, w2(姓名)=60, w3(註)=40
        const w1 = 70, w2 = 60, w3 = 40; 
        const w4 = maxTypes === 3 ? 140 : 110; 
        
        style.innerHTML = `
            .sticky-col { position: -webkit-sticky; position: sticky; z-index: 10; border-right: 1px solid #dee2e6; }
            .col-1 { left: 0; width: ${w1}px; }
            .col-2 { left: ${w1}px; width: ${w2}px; }
            .col-3 { left: ${w1+w2}px; width: ${w3}px; }
            .col-4 { left: ${w1+w2+w3}px; width: ${w4}px; box-shadow: 4px 0 5px -2px rgba(0,0,0,0.1); }
            thead .sticky-col { z-index: 30 !important; }
            .dropdown-item:hover { background-color: #f8f9fa; color: #0d6efd; }
        `;
        document.head.appendChild(style);
    }

    // --- 互動邏輯 ---

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

    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.closeContextMenu();

        const menu = document.getElementById('context-menu');
        const shifts = this.state.unitSettings?.settings?.shifts || [
            {code:'D', name:'白班'}, {code:'E', name:'小夜'}, {code:'N', name:'大夜'}
        ];

        let menuHtml = `<h6 class="dropdown-header bg-light py-1">設定 ${day} 日</h6>`;
        
        menuHtml += `<button class="dropdown-item py-1" onclick="window.routerPage.setWish('${uid}', ${day}, 'OFF')"><span class="badge bg-warning text-dark w-25 me-2">OFF</span> 預休</button>`;
        menuHtml += `<button class="dropdown-item py-1" onclick="window.routerPage.setWish('${uid}', ${day}, 'M_OFF')"><span class="badge bg-dark text-white w-25 me-2">M</span> 強迫預休</button>`;
        
        menuHtml += `<div class="dropdown-divider my-1"></div>`;
        
        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item py-1" onclick="window.routerPage.setWish('${uid}', ${day}, '${s.code}')"><span class="badge bg-info text-white w-25 me-2">${s.code}</span> 指定${s.name}</button>`;
        });

        menuHtml += `<div class="dropdown-divider my-1"></div>`;
        
        shifts.forEach(s => {
            menuHtml += `<button class="dropdown-item py-1 text-danger" onclick="window.routerPage.setWish('${uid}', ${day}, 'NO_${s.code}')"><i class="fas fa-ban w-25 me-2"></i> 勿排${s.name}</button>`;
        });

        menuHtml += `<div class="dropdown-divider my-1"></div>`;
        menuHtml += `<button class="dropdown-item py-1 text-secondary" onclick="window.routerPage.setWish('${uid}', ${day}, '')"><i class="fas fa-eraser w-25 me-2"></i> 清除</button>`;

        menu.innerHTML = menuHtml;
        menu.style.display = 'block';
        
        const menuWidth = 150; 
        let left = e.pageX;
        if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
        
        menu.style.left = `${left}px`;
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

    async editPrevMonthCell(uid, day, currentVal) {
        const newVal = prompt(`修改上個月 ${day} 日班別 (D, E, N, OFF):`, currentVal);
        if (newVal !== null) {
            const val = newVal.trim().toUpperCase();
            
            let prevY = this.state.year, prevM = this.state.month - 1;
            if (prevM === 0) { prevM = 12; prevY--; }

            try {
                await ScheduleService.updateShift(this.state.unitId, prevY, prevM, uid, day, val);
                
                if (!this.state.prevMonthData[uid]) this.state.prevMonthData[uid] = {};
                this.state.prevMonthData[uid][day] = val;
                this.renderMatrixGrid();
            } catch (e) {
                alert("更新失敗: " + e.message);
            }
        }
    }

    closeContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    }

    updatePreference(uid, field, value) {
        if (!this.state.submissions[uid]) this.state.submissions[uid] = { wishes: {}, preferences: {} };
        if (!this.state.submissions[uid].preferences) this.state.submissions[uid].preferences = {};
        this.state.submissions[uid].preferences[field] = value.trim();
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
    
    remindUnsubmitted() {
        const unsubmitted = this.state.staffList.filter(s => {
            const sub = this.state.submissions[s.uid];
            return !sub || !sub.isSubmitted;
        });
        
        if (unsubmitted.length === 0) {
            alert("所有人員皆已提交！");
        } else {
            const names = unsubmitted.map(s => s.name).join(', ');
            alert(`以下人員尚未提交預班，請通知：\n${names}`);
        }
    }
    
    exportExcel() { alert("功能實作中"); }
}
