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
            unitSettings: null, // 儲存單位設定 (含排班規則)
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
        
        // 1. 取得單位設定
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
                        <div class="d-flex align-items-center gap-2 small">
                            <span class="fw-bold text-primary"><i class="fas fa-th me-1"></i> 排班工作台</span>
                            <div class="border-start ps-2 text-muted">
                                <span class="badge bg-warning text-dark border me-1">OFF</span>預休
                                <span class="badge bg-dark text-white border me-1">強休</span>系統
                                <span class="badge bg-info text-white border me-1">班</span>指定
                                <span class="badge bg-danger text-white border me-1">X</span>勿排
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-success btn-sm py-0" onclick="window.routerPage.openAddSupportModal()">
                                <i class="fas fa-user-plus"></i> 支援
                            </button>
                            <button class="btn btn-outline-primary btn-sm py-0" onclick="window.routerPage.exportExcel()">
                                <i class="fas fa-file-excel"></i> 匯出
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

        // 讀取班別種類上限 (2 或 3，預設 3)
        // 假設路徑：unitSettings.rules.constraints.maxShiftTypesWeek
        // 若找不到則預設為 3
        const maxShiftTypes = this.state.unitSettings?.rules?.constraints?.maxShiftTypesWeek || 3;
        
        // CSS 優化：壓縮固定欄位寬度
        let headerHtml = `
            <th class="sticky-col col-1 bg-light text-center px-1" style="width: 70px; cursor:pointer;" onclick="window.routerPage.handleSort('staffId')">
                <small>職編</small>${getSortIcon('staffId')}
            </th>
            <th class="sticky-col col-2 bg-light text-center px-1" style="width: 80px;">姓名</th>
            <th class="sticky-col col-3 bg-light text-center px-1" style="width: 40px;" title="特殊註記">註</th>
            <th class="sticky-col col-4 bg-light text-center px-1" style="width: ${maxShiftTypes===3?'140px':'110px'};">
                <small>排班偏好 (包/1-${maxShiftTypes})</small>
            </th>
        `;

        // 上月 (極簡化顯示)
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

        // --- 內容 ---
        let bodyHtml = '';
        this.state.staffList.forEach(staff => {
            if (!this.state.submissions[staff.uid]) this.state.submissions[staff.uid] = { wishes: {}, preferences: {} };
            const sub = this.state.submissions[staff.uid];
            const wishes = sub.wishes || {};
            const prefs = sub.preferences || {};

            // 1. 支援人員標記
            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.5rem; padding: 2px 3px;">支</span>' : '';
            
            // 2. 特殊註記：讀取 isPregnant
            // 若有懷孕，顯示紅色「孕」字
            let noteBadge = '';
            if (staff.isPregnant) {
                noteBadge = `<span class="badge bg-danger rounded-circle p-1" title="懷孕" style="width:20px;height:20px;line-height:12px;">孕</span>`;
            } else if (staff.specialNote) {
                noteBadge = `<span class="badge bg-info rounded-circle p-1" title="${staff.specialNote}" style="width:20px;height:20px;">!</span>`;
            }

            // 3. 偏好欄位 (包班 + 1~N)
            // 包班顯示邏輯
            let bundleHtml = '';
            if (prefs.batch) {
                bundleHtml = `<span class="badge bg-primary" title="包班:${prefs.batch}">包${prefs.batch}</span>`;
            } else {
                bundleHtml = `<span class="text-muted small">-</span>`;
            }

            // 下拉選單產生器
            const genSelect = (val, key) => `
                <select class="form-select form-select-sm p-0 text-center border-0 bg-transparent fw-bold" 
                        style="height: 24px; font-size: 0.8rem; cursor: pointer;"
                        onchange="window.routerPage.updatePreference('${staff.uid}', '${key}', this.value)">
                    <option value="" ${!val?'selected':''}></option>
                    <option value="D" ${val==='D'?'selected':''}>D</option>
                    <option value="E" ${val==='E'?'selected':''}>E</option>
                    <option value="N" ${val==='N'?'selected':''}>N</option>
                </select>`;

            // 組合偏好欄位
            let prefHtml = `
                <div class="d-flex align-items-center justify-content-between px-1" style="height: 100%;">
                    <div style="width: 35px; text-align: center;">${bundleHtml}</div>
                    <div style="width: 1px; height: 16px; background: #ddd;"></div>
                    <div style="width: 25px;">${genSelect(prefs.priority1, 'priority1')}</div>
                    <div style="width: 25px;">${genSelect(prefs.priority2, 'priority2')}</div>
                    ${maxShiftTypes === 3 ? `<div style="width: 25px;">${genSelect(prefs.priority3, 'priority3')}</div>` : ''}
                </div>`;

            // 組合列
            let rowHtml = `
                <td class="sticky-col col-1 text-center bg-white p-0 align-middle"><small>${staff.staffId || ''}</small></td>
                <td class="sticky-col col-2 text-start bg-white p-0 ps-1 align-middle text-truncate" style="max-width: 80px; font-size: 0.85rem;">${staff.name} ${isSupport}</td>
                <td class="sticky-col col-3 text-center bg-white p-0 align-middle">${noteBadge}</td>
                <td class="sticky-col col-4 bg-white p-0 align-middle border-end">${prefHtml}</td>
            `;

            // 上月班表
            this.state.prevMonthLast6Days.forEach(d => {
                const shift = (this.state.prevMonthData[staff.uid] || {})[d] || ''; 
                rowHtml += `<td class="text-center p-0 align-middle bg-secondary bg-opacity-10 text-muted border-end border-light" style="font-size:0.75rem;">${shift}</td>`;
            });

            // 本月格子
            let offCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
                const wish = wishes[d] || '';
                
                let cellClass = '';
                let cellText = wish;
                
                if (wish === 'OFF') {
                    cellClass = 'bg-warning text-dark'; 
                    cellText = 'OFF';
                    offCount++;
                } else if (wish === 'M_OFF') {
                    cellClass = 'bg-dark text-white'; 
                    cellText = '強休'; // 4. 優化顯示文字
                    offCount++;
                } else if (['D','E','N'].includes(wish)) {
                    cellClass = 'bg-info text-white fw-bold'; 
                } else if (wish.startsWith('NO_')) {
                    cellClass = 'bg-danger text-white fw-bold'; 
                    cellText = 'X'; // 簡化勿排顯示
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
                        <div style="font-size: 0.8rem; font-weight: 500;">${cellText}</div>
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
        
        // 計算各欄位寬度與位置 (Pixel Perfect 調整)
        const w1 = 70, w2 = 80, w3 = 40;
        const w4 = maxTypes === 3 ? 140 : 110; 
        
        style.innerHTML = `
            .sticky-col { position: -webkit-sticky; position: sticky; z-index: 10; border-right: 1px solid #dee2e6; }
            .col-1 { left: 0; width: ${w1}px; }
            .col-2 { left: ${w1}px; width: ${w2}px; }
            .col-3 { left: ${w1+w2}px; width: ${w3}px; }
            .col-4 { left: ${w1+w2+w3}px; width: ${w4}px; box-shadow: 4px 0 5px -2px rgba(0,0,0,0.1); }
            
            thead .sticky-col { z-index: 30 !important; }
            .dropdown-item:hover { background-color: #f8f9fa; color: #0d6efd; }
            
            /* 讓表頭日期直立顯示 (如果真的很擠) */
            /* .th-date { writing-mode: vertical-lr; } */
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
        // 2. 從設定讀取班別，若無則用預設
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
        
        // 防止選單超出視窗
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

    closeContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    }

    // 更新偏好設定 (管理者修改)
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
