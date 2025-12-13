import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; 
import { auth } from "../../config/firebase.config.js"; 

// 內嵌 Template
const EditTemplate = {
    renderLayout(year, month, unitName) {
        return `
        <div class="page-wrapper">
            <div class="container-fluid p-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-edit text-primary me-2"></i>預班內容編輯
                        </h2>
                        <span class="badge bg-primary fs-6 ms-3"><i class="fas fa-hospital me-1"></i> ${unitName}</span>
                        <span class="badge bg-white text-dark border ms-2 fs-6 shadow-sm">${year}年 ${month}月</span>
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
                        <div class="fw-bold text-primary"><i class="fas fa-list-alt me-1"></i> 預班填寫狀況</div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-success btn-sm" onclick="window.routerPage.openAddSupportModal()">
                                <i class="fas fa-user-plus"></i> 加入支援人員
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="window.routerPage.exportExcel()">
                                <i class="fas fa-file-excel"></i> 匯出
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="window.routerPage.remindUnsubmitted()">
                                <i class="fas fa-bell"></i> 催繳
                            </button>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div id="review-table-container">
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary"></div><div class="mt-2 text-muted">讀取中...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="detail-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header bg-light"><h5 class="modal-title">詳細內容</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="modal-body-content"></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button></div></div></div>
            </div>
            <div class="modal fade" id="add-support-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog"><div class="modal-content"><div class="modal-header bg-success text-white"><h5 class="modal-title">加入跨單位支援</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="input-group mb-3"><input type="text" id="support-search-input" class="form-control" placeholder="輸入員編或姓名"><button class="btn btn-outline-secondary" onclick="window.routerPage.searchStaff()">搜尋</button></div><div id="search-result-area" class="list-group"></div></div></div></div>
            </div>
        </div>`;
    },

    renderReviewTable(staffList, submissions, year, month, options = {}) {
        const { sortKey, dir } = options;
        const getSortIcon = (k) => sortKey !== k ? '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>' : (dir === 'asc' ? '<i class="fas fa-sort-up text-dark ms-1"></i>' : '<i class="fas fa-sort-down text-dark ms-1"></i>');
        
        let html = `<div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="bg-light sticky-top"><tr>
            <th style="width:50px">#</th>
            <th style="width:100px;cursor:pointer" onclick="window.routerPage.handleSort('staffId')">員編 ${getSortIcon('staffId')}</th>
            <th style="width:120px">姓名</th>
            <th style="width:90px;cursor:pointer" onclick="window.routerPage.handleSort('group')">組別 ${getSortIcon('group')}</th>
            <th style="min-width:350px">預班內容 <small class="text-muted">(含上月)</small></th>
            <th style="min-width:250px">特註/偏好</th>
            <th style="width:100px;cursor:pointer" onclick="window.routerPage.handleSort('status')">狀態 ${getSortIcon('status')}</th>
            <th style="width:80px">操作</th>
        </tr></thead><tbody>`;

        if (!staffList || staffList.length === 0) return '<div class="p-5 text-center text-muted">無資料</div>';

        staffList.forEach(staff => {
            const sub = submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1">支援</span>' : '';
            const statusBadge = sub.isSubmitted ? '<span class="badge bg-success">已送出</span>' : '<span class="badge bg-secondary">未填寫</span>';
            const noteHtml = sub.note ? `<div class="text-truncate" style="max-width:200px" title="${sub.note}">${sub.note}</div>` : '<span class="text-muted">-</span>';

            let gridHtml = '<div class="d-flex overflow-auto" style="max-width:450px">';
            // 上月班表 (by UID)
            (staff.prevMonthDays||[]).forEach(d => {
                const s = (staff.prevMonthShifts||{})[d] || '';
                const style = s ? 'bg-secondary text-white opacity-50' : 'bg-white text-muted border-dashed';
                gridHtml += `<div class="border rounded text-center me-1 ${style}" style="min-width:24px;font-size:0.7em"><div>${d}</div><div>${s||'?'}</div></div>`;
            });
            gridHtml += '<div class="border-end mx-1"></div>';
            // 本月預班
            for(let d=1; d<=31; d++) {
                if(wishes[d]) {
                    const w = wishes[d];
                    const bg = w==='OFF'?'bg-secondary':(w==='M_OFF'?'bg-dark':'bg-primary');
                    gridHtml += `<div class="border rounded text-center me-1 ${bg} text-white" style="min-width:24px;font-size:0.7em"><div>${d}</div><div>${w}</div></div>`;
                }
            }
            gridHtml += '</div>';

            html += `<tr draggable="true" data-uid="${staff.uid}" ondragstart="window.routerPage.handleDragStart(event)" ondragover="window.routerPage.handleDragOver(event)" ondrop="window.routerPage.handleDrop(event)">
                <td class="text-center"><i class="fas fa-grip-vertical text-muted"></i></td>
                <td>${staff.staffId||''}</td>
                <td>${staff.name} ${isSupport}</td>
                <td>${staff.group||''}</td>
                <td>${gridHtml}</td>
                <td>${noteHtml}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center"><button class="btn btn-sm btn-outline-primary rounded-circle" style="width:30px;height:30px" onclick="window.routerPage.openDetailModal('${staff.uid}')"><i class="fas fa-pen"></i></button></td>
            </tr>`;
        });
        return html + '</tbody></table></div>';
    }
};

export class PreScheduleEditPage {
    constructor() {
        this.state = { unitId: null, year: null, month: null, staffList: [], submissions: {}, prevMonthData: {}, prevMonthDays: [], sortConfig: { key: 'staffId', dir: 'asc' }, dragSrcUid: null };
        this.detailModal = null;
        this.supportModal = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤</div>';
        
        // 取得單位名稱
        const unit = await UnitService.getUnitById(this.state.unitId);
        const unitName = unit ? unit.name : '未知單位';

        return EditTemplate.renderLayout(this.state.year, this.state.month, unitName);
    }

    async afterRender() {
        window.routerPage = this; 
        const m1 = document.getElementById('detail-modal');
        if(m1) this.detailModal = new bootstrap.Modal(m1);
        const m2 = document.getElementById('add-support-modal');
        if(m2) this.supportModal = new bootstrap.Modal(m2);

        await this.loadData();
    }

    async loadData() {
        const container = document.getElementById('review-table-container');
        try {
            // 1. 載入本單位人員
            const unitStaff = await userService.getUnitStaff(this.state.unitId);
            
            // 2. 載入預班表 (含支援名單)
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            
            let finalStaffList = [...unitStaff];
            
            // 3. 合併支援人員
            if (preSchedule && preSchedule.supportStaffIds && preSchedule.supportStaffIds.length > 0) {
                const supportPromises = preSchedule.supportStaffIds.map(uid => userService.getUserData(uid));
                const supportStaffData = await Promise.all(supportPromises);
                supportStaffData.forEach(s => {
                    if (s && !finalStaffList.find(existing => existing.uid === s.uid)) {
                        s.isSupport = true;
                        finalStaffList.push(s);
                    }
                });
            }

            this.state.staffList = finalStaffList;
            this.state.submissions = preSchedule ? preSchedule.submissions || {} : {};

            // 4. 載入上個月班表 (by UID)
            await this.loadPrevMonthData();
            this.handleSort('staffId', false);

        } catch (e) {
            console.error(e);
            if (container) container.innerHTML = `<div class="alert alert-danger">載入失敗: ${e.message}</div>`;
        }
    }

    // 依 User UID 抓取上月班表 (不依賴單位)
    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        const last6Days = [];
        for (let i = 5; i >= 0; i--) last6Days.push(daysInPrevMonth - i);
        this.state.prevMonthDays = last6Days;

        const promises = this.state.staffList.map(async (staff) => {
            try {
                // 使用 PersonalSchedule 確保抓到該員的班表，無論他在哪個單位
                const schedule = await ScheduleService.getPersonalSchedule(staff.uid, prevYear, prevMonth);
                let shifts = {};
                if (schedule && schedule.assignments) shifts = schedule.assignments; 
                else if (schedule) shifts = schedule; 
                return { uid: staff.uid, shifts: shifts };
            } catch { return { uid: staff.uid, shifts: {} }; }
        });

        const results = await Promise.all(promises);
        const map = {};
        results.forEach(res => {
            map[res.uid] = {};
            last6Days.forEach(d => { if (res.shifts[d]) map[res.uid][d] = res.shifts[d]; });
        });
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
            if (sortKey === 'status') {
                valA = this.state.submissions[a.uid]?.isSubmitted ? 1 : 0;
                valB = this.state.submissions[b.uid]?.isSubmitted ? 1 : 0;
            }
            if (sortKey === 'staffId') {
                const numA = parseFloat(valA); const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * multiplier;
            }
            return String(valA).localeCompare(String(valB), 'zh-Hant') * multiplier;
        });
        document.getElementById('review-table-container').innerHTML = EditTemplate.renderReviewTable(this.state.staffList, this.state.submissions, this.state.year, this.state.month, this.state.sortConfig);
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
            user.isSupport = true;
            this.state.staffList.push(user);
            
            // 寫入 DB
            await PreScheduleService.addSupportStaff(this.state.unitId, this.state.year, this.state.month, user.uid);
            
            // 重新載入以更新上月班表
            await this.loadData();
            
            alert("加入成功！");
            if(this.supportModal) this.supportModal.hide();
        } catch(e) { alert("加入失敗: " + e.message); }
    }

    openDetailModal(uid) {
        const staff = this.state.staffList.find(s => s.uid === uid);
        const sub = this.state.submissions[uid] || {};
        if (this.detailModal) {
            document.getElementById('modal-body-content').innerHTML = `<div class="p-3"><h5>${staff.name}</h5><p>${sub.note||'無特註'}</p></div>`;
            this.detailModal.show();
        }
    }
    
    // 預留功能
    handleDragStart(e) { /*...*/ }
    handleDragOver(e) { e.preventDefault(); }
    handleDrop(e) { /*...*/ }
    saveDetail() { if(this.detailModal) this.detailModal.hide(); }
    saveReview() { alert("功能實作中"); }
    exportExcel() { alert("功能實作中"); }
    remindUnsubmitted() { alert("功能實作中"); }
}
