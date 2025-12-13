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
            prevMonthData: {}, // 上月班表資料 (By UID)
            sortConfig: { key: 'staffId', dir: 'asc' } 
        };
        this.unitSettings = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤：缺少單位 ID</div>';
        
        // 取得單位名稱
        const unit = await UnitService.getUnitById(this.state.unitId);
        const unitName = unit ? unit.name : '未知單位';
        this.unitSettings = unit;

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
                            <h6 class="m-0 fw-bold text-primary"><i class="fas fa-th me-1"></i> 全院預班總表</h6>
                            <div class="small text-muted border-start ps-3">
                                <span class="me-2"><span class="badge bg-white text-dark border">OFF</span> 預休</span>
                                <span class="me-2"><span class="badge bg-white text-dark border" style="border-color: #333 !important; color: #333;">M_OFF</span> 強迫</span>
                                <span class="me-2"><i class="fas fa-info-circle"></i> 點擊格子可修改</span>
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
                        <div id="schedule-grid-container" class="table-responsive" style="max-height: 75vh;">
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
            // 1. 載入預班表
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            
            // 2. 準備人員名單
            // 若預班表已存在，優先使用儲存的 staffIds (包含支援人員)
            // 若不存在，則抓取單位現有人員
            let staffList = [];
            if (preSchedule && preSchedule.staffIds && preSchedule.staffIds.length > 0) {
                const promises = preSchedule.staffIds.map(uid => userService.getUserData(uid));
                const users = await Promise.all(promises);
                staffList = users.filter(u => u);
            } else {
                staffList = await userService.getUnitStaff(this.state.unitId);
            }

            // 標記支援人員與組別
            const supportIds = preSchedule?.supportStaffIds || [];
            this.state.staffList = staffList.map(u => {
                u.isSupport = supportIds.includes(u.uid) || u.unitId !== this.state.unitId;
                // 優先使用預班表存的組別，否則用個人資料的
                u.displayGroup = preSchedule?.staffSettings?.[u.uid]?.group || u.group || '';
                return u;
            });

            this.state.submissions = preSchedule ? preSchedule.submissions || {} : {};

            // 3. 載入上個月班表 (用來顯示在名字旁邊，供參考)
            await this.loadPrevMonthData();

            // 4. 渲染大表
            this.renderMatrixGrid();

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="alert alert-danger m-4">載入失敗: ${e.message}</div>`;
        }
    }

    // 依 User UID 抓取上月班表 (不依賴單位)
    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        
        // 為了簡單起見，我們只抓上個月最後 3 天顯示在名字旁，或者抓整個月
        // 這裡假設 ScheduleService.getPersonalSchedule 回傳 { assignments: { '1': 'D', ... } }
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

    renderMatrixGrid() {
        const container = document.getElementById('schedule-grid-container');
        const daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

        // 1. 表頭 (日期)
        let headerHtml = `
            <th class="sticky-col first-col bg-light text-center" style="min-width: 150px; z-index: 5;">人員</th>
            <th class="text-center bg-light" style="min-width: 60px;">組別</th>
        `;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month - 1, d);
            const dayOfWeek = date.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const colorClass = isWeekend ? 'text-danger' : 'text-dark';
            
            headerHtml += `
                <th class="text-center p-1 bg-light" style="min-width: 40px;">
                    <div class="${colorClass}" style="font-size: 0.8rem;">${weekDays[dayOfWeek]}</div>
                    <div class="${colorClass}" style="font-size: 1rem;">${d}</div>
                </th>`;
        }
        headerHtml += `<th class="text-center bg-light" style="min-width: 80px;">統計</th>`;

        // 2. 表格內容 (人員列)
        // 先依照組別、職級排序
        this.state.staffList.sort((a, b) => {
            // 支援人員排最後
            if (a.isSupport !== b.isSupport) return a.isSupport ? 1 : -1;
            // 組別排序
            if (a.displayGroup !== b.displayGroup) return (a.displayGroup || '').localeCompare(b.displayGroup || '');
            return (a.staffId || '').localeCompare(b.staffId || '');
        });

        let bodyHtml = '';
        this.state.staffList.forEach(staff => {
            const sub = this.state.submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            
            // 支援人員樣式
            const rowClass = staff.isSupport ? 'table-warning' : '';
            const nameBadge = staff.isSupport ? '<span class="badge bg-dark ms-1">支</span>' : '';

            // 上月最後一日班表 (參考用)
            // 算出上個月最後一天
            let prevY = this.state.year, prevM = this.state.month - 1;
            if (prevM===0) { prevM=12; prevY--; }
            const lastDayPrev = new Date(prevY, prevM, 0).getDate();
            const lastShift = (this.state.prevMonthData[staff.uid] || {})[lastDayPrev] || '-';

            // 固定欄位：姓名
            let rowHtml = `
                <td class="sticky-col first-col ${rowClass} border-end">
                    <div class="d-flex justify-content-between align-items-center px-2">
                        <div>
                            <div class="fw-bold text-nowrap">${staff.name} ${nameBadge}</div>
                            <div class="small text-muted" style="font-size: 0.75rem;">${staff.staffId}</div>
                        </div>
                        <div class="badge bg-secondary opacity-50" title="上月${lastDayPrev}日班別">${lastShift}</div>
                    </div>
                </td>
                <td class="text-center ${rowClass}">${staff.displayGroup || '-'}</td>
            `;

            let offCount = 0;

            // 日期格子
            for (let d = 1; d <= daysInMonth; d++) {
                const wish = wishes[d] || '';
                if (wish === 'OFF' || wish === 'M_OFF') offCount++;

                let cellClass = '';
                let cellText = '';

                if (wish === 'OFF') {
                    cellClass = 'bg-warning text-dark opacity-75'; // 預休黃色
                    cellText = 'OFF';
                } else if (wish === 'M_OFF') {
                    cellClass = 'bg-dark text-white'; // 強迫預休黑色
                    cellText = 'OFF';
                } else if (wish) {
                    cellClass = 'bg-info text-white'; // 其他班別
                    cellText = wish;
                }

                // 假日背景微調
                const date = new Date(this.state.year, this.state.month - 1, d);
                const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
                if (isWeekend && !wish) cellClass = 'bg-light';

                rowHtml += `
                    <td class="text-center p-0 align-middle ${cellClass}" 
                        style="cursor: pointer; height: 40px; border: 1px solid #dee2e6;"
                        onclick="window.routerPage.editCell('${staff.uid}', ${d})">
                        <div style="font-weight: bold; font-size: 0.9rem;">${cellText}</div>
                    </td>
                `;
            }

            // 統計
            rowHtml += `<td class="text-center fw-bold ${rowClass}">${offCount}</td>`;

            bodyHtml += `<tr class="${rowClass}">${rowHtml}</tr>`;
        });

        container.innerHTML = `
            <table class="table table-bordered table-sm mb-0" style="min-width: 100%;">
                <thead class="sticky-top" style="z-index: 10;">
                    <tr>${headerHtml}</tr>
                </thead>
                <tbody>
                    ${bodyHtml}
                </tbody>
            </table>
        `;
        
        // 加入 CSS 讓第一欄固定
        this.addStickyStyles();
    }

    addStickyStyles() {
        if (document.getElementById('sticky-col-style')) return;
        const style = document.createElement('style');
        style.id = 'sticky-col-style';
        style.innerHTML = `
            .sticky-col { position: -webkit-sticky; position: sticky; background-color: #fff; z-index: 2; }
            .first-col { left: 0; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1); }
            thead .sticky-col { z-index: 15 !important; }
        `;
        document.head.appendChild(style);
    }

    async editCell(uid, day) {
        // 簡單編輯：點擊跳出 Prompt 或選單 (這裡用 Prompt 示範，可改用 Modal)
        const staff = this.state.staffList.find(s => s.uid === uid);
        const currentWish = this.state.submissions[uid]?.wishes?.[day] || '';
        
        const input = prompt(`${staff.name} ${day}日預班 (輸入 OFF, D, E, N, 或空白清除):`, currentWish);
        
        if (input !== null) {
            const val = input.trim().toUpperCase();
            // 更新本地資料
            if (!this.state.submissions[uid]) this.state.submissions[uid] = { wishes: {}, name: staff.name };
            if (!this.state.submissions[uid].wishes) this.state.submissions[uid].wishes = {};
            
            if (val === '') delete this.state.submissions[uid].wishes[day];
            else this.state.submissions[uid].wishes[day] = val;

            // 重新渲染格子
            this.renderMatrixGrid();
        }
    }

    async saveReview() {
        if(!confirm("確定儲存所有變更？")) return;
        try {
            // 只需更新 submissions 部分，staffIds 與 settings 不變
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
    async searchStaff() { /* 略，同前 */ }
    async addSupportStaff(user) { /* 略，同前 */ }
    
    exportExcel() { alert("功能實作中"); }
    remindUnsubmitted() { alert("功能實作中"); }
}
