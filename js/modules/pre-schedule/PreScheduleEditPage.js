import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; 

export class PreScheduleEditPage {
    constructor() {
        this.state = { unitId: null, year: null, month: null, staffList: [], submissions: {}, prevMonthData: {}, prevMonthDays: [], sortConfig: { key: 'staffId', dir: 'asc' } };
        this.detailModal = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger m-4">參數錯誤</div>';
        
        const unit = await UnitService.getUnitById(this.state.unitId);
        const unitName = unit ? unit.name : '未知單位';

        return `
        <div class="page-wrapper">
            <div class="container-fluid p-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-edit text-primary me-2"></i>預班內容編輯
                        </h2>
                        <span class="badge bg-primary fs-6 ms-3"><i class="fas fa-hospital me-1"></i> ${unitName}</span>
                        <span class="badge bg-white text-dark border ms-2 fs-6 shadow-sm">${this.state.year}年 ${this.state.month}月</span>
                    </div>
                    <div>
                        <button class="btn btn-outline-secondary me-2 shadow-sm" onclick="window.history.back()">
                            <i class="fas fa-arrow-left"></i> 回列表
                        </button>
                    </div>
                </div>

                <div class="card shadow border-0">
                    <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                        <div class="fw-bold text-primary"><i class="fas fa-list-alt me-1"></i> 預班填寫狀況</div>
                        <div class="d-flex gap-2">
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
                            <div class="text-center py-5"><div class="spinner-border text-primary"></div><div class="mt-2 text-muted">讀取中...</div></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="detail-modal" tabindex="-1">
                <div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header bg-light"><h5 class="modal-title">詳細內容</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="modal-body-content"></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button></div></div></div>
            </div>
        </div>`;
    }

    async afterRender() {
        window.routerPage = this; 
        const m1 = document.getElementById('detail-modal');
        if(m1) this.detailModal = new bootstrap.Modal(m1);
        await this.loadData();
    }

    async loadData() {
        const container = document.getElementById('review-table-container');
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month);
            if (!preSchedule) throw new Error("找不到預班表資料");

            // 1. 取得人員名單 (包含支援人員)
            const staffIds = preSchedule.staffIds || [];
            const promises = staffIds.map(uid => userService.getUserData(uid));
            const allStaff = await Promise.all(promises);
            
            // 2. 標記屬性
            const supportIds = preSchedule.supportStaffIds || [];
            this.state.staffList = allStaff.filter(u=>u).map(u => {
                u.isSupport = supportIds.includes(u.uid) || u.unitId !== this.state.unitId;
                const savedGroup = preSchedule.staffSettings?.[u.uid]?.group;
                if(savedGroup) u.group = savedGroup;
                return u;
            });

            this.state.submissions = preSchedule.submissions || {};

            // 3. 載入上個月班表
            await this.loadPrevMonthData();
            this.handleSort('staffId', false);

        } catch (e) {
            console.error(e);
            if (container) container.innerHTML = `<div class="alert alert-danger m-4">載入失敗: ${e.message}</div>`;
        }
    }

    // ✅ 關鍵：依 User UID 抓取上月班表 (不依賴單位)
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
                // 使用 PersonalSchedule 確保抓到該員的班表
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
        this.renderTable();
    }

    renderTable() {
        const getSortIcon = (k) => this.state.sortConfig.key !== k ? '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>' : (this.state.sortConfig.dir === 'asc' ? '<i class="fas fa-sort-up text-dark ms-1"></i>' : '<i class="fas fa-sort-down text-dark ms-1"></i>');
        
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

        if (this.state.staffList.length === 0) return '<div class="p-5 text-center text-muted">無資料</div>';

        this.state.staffList.forEach(staff => {
            const sub = this.state.submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            const isSupport = staff.isSupport ? '<span class="badge bg-warning text-dark ms-1">支援</span>' : '';
            const statusBadge = sub.isSubmitted ? '<span class="badge bg-success">已送出</span>' : '<span class="badge bg-secondary">未填寫</span>';
            const noteHtml = sub.note ? `<div class="text-truncate" style="max-width:200px" title="${sub.note}">${sub.note}</div>` : '<span class="text-muted">-</span>';

            let gridHtml = '<div class="d-flex overflow-auto" style="max-width:450px">';
            // 上月月底
            (this.state.prevMonthDays||[]).forEach(d => {
                const s = (this.state.prevMonthData[staff.uid]||{})[d] || '';
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

            html += `<tr>
                <td class="text-center text-muted"><i class="fas fa-grip-vertical"></i></td>
                <td class="fw-bold text-secondary">${staff.staffId||''}</td>
                <td><div class="fw-bold text-dark">${staff.name} ${isSupport}</div><div class="small text-muted">${staff.rank||''}</div></td>
                <td><span class="badge bg-light text-dark border">${staff.group||'-'}</span></td>
                <td>${gridHtml}</td>
                <td>${noteHtml}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center"><button class="btn btn-sm btn-outline-primary rounded-circle" style="width:30px;height:30px" onclick="window.routerPage.openDetailModal('${staff.uid}')"><i class="fas fa-pen"></i></button></td>
            </tr>`;
        });
        document.getElementById('review-table-container').innerHTML = html + '</tbody></table></div>';
    }

    openDetailModal(uid) {
        const staff = this.state.staffList.find(s => s.uid === uid);
        const sub = this.state.submissions[uid] || {};
        if (this.detailModal) {
            document.getElementById('modal-body-content').innerHTML = `<div class="p-3"><h5>${staff.name}</h5><p>${sub.note||'無特註'}</p></div>`;
            this.detailModal.show();
        }
    }
    
    exportExcel() { alert("功能實作中"); }
    remindUnsubmitted() { alert("功能實作中"); }
}
