import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; 
import { auth } from "../../config/firebase.config.js"; 

export class PreScheduleManagePage {
    constructor() {
        this.state = {
            unitId: null,
            year: null,
            month: null,
            staffList: [],        
            displayList: [],      
            submissions: {},
            prevMonthData: {},    
            prevMonthDays: [],    
            sortConfig: { key: 'staffId', dir: 'asc' }, 
            dragSrcUid: null,
            currentUser: null 
        };
        this.detailModal = null;
    }

    // ====================================================
    // 1. Render
    // ====================================================
    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        
        // 設定預設年月 (如果網址沒帶參數)
        const today = new Date();
        this.state.year = parseInt(params.get('year')) || today.getFullYear();
        // 預設為下個月
        this.state.month = parseInt(params.get('month')) || (today.getMonth() + 2 > 12 ? 1 : today.getMonth() + 2);
        if (today.getMonth() + 2 > 12 && !params.get('year')) this.state.year++;

        console.log("🚀 [System] Render 啟動 (v3.0 - 無參數允許模式)");

        // ✅ 修正點：移除這裡的 Early Return，讓畫面結構始終產生
        // if (!this.state.unitId) return '...'; 

        return `
        <div id="pre-schedule-wrapper" class="container-fluid p-4">
            
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div class="d-flex align-items-center">
                    <h2 class="mb-0 fw-bold text-dark">
                        <i class="fas fa-calendar-check text-primary me-2"></i>預班管理與審核
                    </h2>
                    
                    <div id="unit-selector-container" class="ms-4" style="display:none;">
                        <select id="unit-selector" class="form-select fw-bold border-primary text-primary shadow-sm" 
                                style="min-width: 200px;"
                                onchange="window.routerPage.handleUnitChange(this.value)">
                            <option value="" disabled selected>切換單位...</option>
                        </select>
                    </div>

                    <span class="badge bg-white text-dark border ms-3 fs-6 shadow-sm">
                        ${this.state.year}年 ${this.state.month}月
                    </span>
                </div>
                <div>
                    <button class="btn btn-outline-secondary me-2 shadow-sm" onclick="window.history.back()">
                        <i class="fas fa-arrow-left"></i> 返回
                    </button>
                    <button class="btn btn-primary shadow-sm" onclick="window.routerPage.saveReview()">
                        <i class="fas fa-save"></i> 儲存並轉入排班表
                    </button>
                </div>
            </div>

            ${!this.state.unitId ? 
                `<div class="alert alert-warning shadow-sm"><i class="fas fa-exclamation-triangle me-2"></i>請先選擇上方單位以載入資料。</div>` 
                : ''}

            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card shadow-sm border-0 h-100">
                        <div class="card-body">
                            <h6 class="text-muted mb-2">提交進度</h6>
                            <div class="d-flex align-items-end">
                                <h3 class="mb-0 fw-bold text-success" id="submitted-count">0</h3>
                                <span class="text-muted ms-2">/ <span id="total-staff-count">0</span> 人</span>
                            </div>
                            <div class="progress mt-2" style="height: 6px;">
                                <div id="progress-bar" class="progress-bar bg-success" role="progressbar" style="width: 0%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-9">
                    <div class="card shadow-sm border-0 h-100">
                        <div class="card-body d-flex align-items-center justify-content-between">
                            <div>
                                <h6 class="text-muted mb-1">功能操作</h6>
                                <div class="text-muted small">請點擊下方表格標題進行排序，或拖曳「#」欄位調整順序。</div>
                            </div>
                            <div>
                                <button class="btn btn-outline-primary btn-sm me-2" onclick="window.routerPage.exportExcel()">
                                    <i class="fas fa-file-excel"></i> 匯出報表
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.routerPage.remindUnsubmitted()">
                                    <i class="fas fa-bell"></i> 催繳通知
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card shadow border-0">
                <div class="card-body p-0">
                    <div id="review-table-container">
                        <div class="text-center py-5">
                            ${this.state.unitId ? '<div class="spinner-border text-primary"></div>' : '<div class="text-muted">等待選擇單位...</div>'}
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div class="modal fade" id="detail-modal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-light">
                        <h5 class="modal-title">預班詳細內容</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="modal-body-content">
                        <div class="text-center text-muted py-3">載入中...</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                        <button type="button" class="btn btn-primary" onclick="window.routerPage.saveDetail()">儲存變更</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // ====================================================
    // 2. AfterRender
    // ====================================================
    async afterRender() {
        window.routerPage = this; 
        console.log("🚀 [System] AfterRender 啟動");

        // 1. 抓取 Modal
        const modalEl = document.getElementById('detail-modal');
        if (modalEl) {
            this.detailModal = new bootstrap.Modal(modalEl);
            console.log("✅ Modal 初始化成功");
        } else {
            console.error("❌ 嚴重錯誤：Render 已修正但仍抓不到 Modal，請檢查 Router 是否正確置換 HTML。");
        }

        // 2. 權限判斷與載入單位
        if (auth.currentUser) {
            try {
                const userDoc = await userService.getUserData(auth.currentUser.uid);
                this.state.currentUser = userDoc;
                
                // 如果是管理員，載入單位選單
                if (userDoc && (userDoc.role === 'admin' || userDoc.role === 'system_admin')) {
                    await this.loadUnits();
                }
            } catch (error) {
                console.error("權限讀取錯誤", error);
            }
        }

        // 3. 只有在有 unitId 時才載入資料
        if (this.state.unitId) {
            await this.loadData();
        } else {
            console.log("ℹ️ 無 UnitId，等待使用者選擇...");
        }
    }

    async loadUnits() {
        try {
            const units = await UnitService.getAllUnits();
            const selector = document.getElementById('unit-selector');
            const container = document.getElementById('unit-selector-container');
            
            if (selector && container) {
                selector.innerHTML = '<option value="" disabled selected>切換單位...</option>';
                let hasCurrentUnit = false;

                units.forEach(unit => {
                    const option = document.createElement('option');
                    option.value = unit.id;
                    option.textContent = unit.name;
                    if (unit.id === this.state.unitId) {
                        option.selected = true;
                        hasCurrentUnit = true;
                    }
                    selector.appendChild(option);
                });
                container.style.display = 'block';
                
                // 如果目前網址沒參數，自動跳轉到第一個單位
                if (!this.state.unitId && units.length > 0) {
                    console.log("🔄 自動選擇第一個單位:", units[0].name);
                    this.handleUnitChange(units[0].id);
                }

                console.log("✅ 單位選單載入完成");
            }
        } catch (error) {
            console.error("載入單位失敗:", error);
        }
    }

    handleUnitChange(newUnitId) {
        if (!newUnitId) return;
        // 更新網址並重新整理頁面
        window.location.hash = `/preschedule/manage?unitId=${newUnitId}&year=${this.state.year}&month=${this.state.month}`;
        setTimeout(() => location.reload(), 50);
    }

    async loadData() {
        const container = document.getElementById('review-table-container');
        if (container) container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><div class="mt-2 text-muted">載入資料中...</div></div>';

        try {
            const [staffList, preSchedule] = await Promise.all([
                userService.getUnitStaff(this.state.unitId),
                PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month)
            ]);

            this.state.staffList = staffList;
            if (preSchedule) this.state.submissions = preSchedule.submissions || {};

            await this.loadPrevMonthData();
            this.enrichStaffData();
            this.updateProgress();
            this.handleSort(this.state.sortConfig.key, false);

        } catch (e) {
            console.error("Load Data Error:", e);
            if (container) container.innerHTML = `<div class="alert alert-danger">載入失敗: ${e.message}</div>`;
        }
    }

    // --- 以下為輔助函式 (保持原樣) ---

    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        const last6Days = [];
        for (let i = 5; i >= 0; i--) last6Days.push(daysInPrevMonth - i);
        this.state.prevMonthDays = last6Days;
        try {
            const prevSchedule = await ScheduleService.getSchedule(this.state.unitId, prevYear, prevMonth);
            const map = {};
            if (prevSchedule && prevSchedule.assignments) {
                Object.entries(prevSchedule.assignments).forEach(([uid, shifts]) => {
                    map[uid] = {};
                    last6Days.forEach(d => { if (shifts[d]) map[uid][d] = shifts[d]; });
                });
            }
            this.state.prevMonthData = map;
        } catch (e) { this.state.prevMonthData = {}; }
    }

    enrichStaffData() {
        this.state.staffList.forEach(s => {
            s.prevMonthDays = this.state.prevMonthDays;
            s.prevMonthShifts = this.state.prevMonthData[s.uid] || {};
        });
        this.state.displayList = [...this.state.staffList];
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
        this.state.displayList.sort((a, b) => {
            let valA = a[sortKey] || '';
            let valB = b[sortKey] || '';
            if (sortKey === 'status') {
                valA = this.state.submissions[a.uid]?.isSubmitted ? 1 : 0;
                valB = this.state.submissions[b.uid]?.isSubmitted ? 1 : 0;
            }
            if (sortKey === 'staffId') {
                const numA = parseFloat(valA);
                const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * multiplier;
            }
            return String(valA).localeCompare(String(valB), 'zh-Hant') * multiplier;
        });
        this.renderTableOnly();
    }

    handleDragStart(e) {
        this.state.dragSrcUid = e.currentTarget.dataset.uid;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('table-active');
    }
    handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }
    handleDrop(e) {
        e.stopPropagation();
        const row = e.currentTarget;
        row.classList.remove('table-active');
        const targetUid = row.dataset.uid;
        if (this.state.dragSrcUid === targetUid) return;
        const fromIndex = this.state.displayList.findIndex(s => s.uid === this.state.dragSrcUid);
        const toIndex = this.state.displayList.findIndex(s => s.uid === targetUid);
        if (fromIndex > -1 && toIndex > -1) {
            const [movedItem] = this.state.displayList.splice(fromIndex, 1);
            this.state.displayList.splice(toIndex, 0, movedItem);
            this.renderTableOnly();
        }
    }

    renderTableOnly() {
        const container = document.getElementById('review-table-container');
        if (container) container.innerHTML = this.renderReviewTableHTML();
    }

    renderReviewTableHTML() {
        const { sortKey, dir } = this.state.sortConfig;
        const getSortIcon = (k) => sortKey !== k ? '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>' : (dir === 'asc' ? '<i class="fas fa-sort-up text-dark ms-1"></i>' : '<i class="fas fa-sort-down text-dark ms-1"></i>');
        
        let html = `<div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="bg-light sticky-top"><tr>
            <th style="width:50px;text-align:center">#</th>
            <th style="width:100px;cursor:pointer" onclick="window.routerPage.handleSort('staffId')">員編 ${getSortIcon('staffId')}</th>
            <th style="width:120px">姓名</th>
            <th style="width:90px;cursor:pointer" onclick="window.routerPage.handleSort('group')">組別 ${getSortIcon('group')}</th>
            <th style="min-width:350px">預班內容</th>
            <th style="min-width:250px">特註/偏好</th>
            <th style="width:100px;cursor:pointer" onclick="window.routerPage.handleSort('status')">狀態 ${getSortIcon('status')}</th>
            <th style="width:80px">操作</th>
        </tr></thead><tbody>`;

        if (this.state.displayList.length === 0) return '<div class="p-3 text-center text-muted">無資料</div>';

        this.state.displayList.forEach(staff => {
            const sub = this.state.submissions[staff.uid] || {};
            const wishes = sub.wishes || {};
            const isSubmitted = sub.isSubmitted;
            const statusBadge = isSubmitted 
                ? `<span class="badge bg-success-subtle text-success border border-success px-2 py-1">已送出</span>` 
                : `<span class="badge bg-secondary-subtle text-secondary border px-2 py-1">未填寫</span>`;
            const updateTime = sub.updatedAt ? new Date(sub.updatedAt.seconds * 1000).toLocaleDateString() : '';
            
            let noteHtml = sub.note ? `<div class="mb-1 text-dark" style="white-space: pre-wrap; font-size: 0.9rem;">${sub.note}</div>` : '';
            const wishSummary = this.getWishSummary(wishes);
            if (wishSummary) noteHtml += `<div class="text-primary small"><i class="fas fa-star me-1"></i>${wishSummary}</div>`;
            if (!noteHtml) noteHtml = '<span class="text-muted small">-</span>';

            let gridHtml = '<div class="d-flex overflow-auto" style="max-width:450px">';
            // 上月
            (staff.prevMonthDays||[]).forEach(d => {
                const s = (staff.prevMonthShifts||{})[d] || '';
                const style = s ? 'bg-secondary text-white opacity-50' : 'bg-white text-muted border-dashed';
                gridHtml += `<div class="border rounded text-center me-1 ${style}" style="min-width:24px;cursor:pointer;font-size:0.7em" onclick="window.routerPage.editPrevShift('${staff.uid}',${d})"><div class="bg-light border-bottom text-muted" style="font-size:0.6rem;line-height:12px">${d}</div><div style="font-weight:bold;line-height:18px">${s||'?'}</div></div>`;
            });
            gridHtml += '<div class="border-end mx-1" style="border-color:#ddd"></div>';
            // 本月
            let hasWishes = false;
            for(let d=1; d<=31; d++) {
                if(wishes[d]) {
                    hasWishes = true;
                    const w = wishes[d];
                    const bg = w==='OFF'?'bg-secondary':(w==='M_OFF'?'bg-dark':'bg-primary');
                    gridHtml += `<div class="border rounded text-center me-1 ${bg} text-white" style="min-width:24px;font-size:0.7em"><div class="bg-white text-dark border-bottom opacity-75" style="font-size:0.6rem;line-height:12px">${d}</div><div style="font-weight:bold;line-height:18px">${w}</div></div>`;
                }
            }
            if(!hasWishes) gridHtml += '<span class="text-muted small ms-1">無</span>';
            gridHtml += '</div>';

            html += `<tr draggable="true" data-uid="${staff.uid}" class="review-row" ondragstart="window.routerPage.handleDragStart(event)" ondragover="window.routerPage.handleDragOver(event)" ondrop="window.routerPage.handleDrop(event)">
                <td class="text-center text-muted" style="cursor:grab"><i class="fas fa-grip-vertical"></i></td>
                <td class="fw-bold text-secondary">${staff.staffId||''}</td>
                <td><div class="fw-bold text-dark">${staff.name}</div><div class="small text-muted">${staff.rank||''}</div></td>
                <td><span class="badge bg-light text-dark border">${staff.group||'-'}</span></td>
                <td class="py-2">${gridHtml}</td>
                <td class="text-start align-top py-3">${noteHtml}</td>
                <td class="text-center">${statusBadge}<div class="small text-muted mt-1" style="font-size:0.75rem">${updateTime}</div></td>
                <td class="text-center"><button class="btn btn-sm btn-outline-primary rounded-circle" style="width:32px;height:32px" onclick="window.routerPage.openDetailModal('${staff.uid}')" title="編輯"><i class="fas fa-pen"></i></button></td>
            </tr>`;
        });
        return html + '</tbody></table></div>';
    }

    updateProgress() {
        const total = this.state.staffList.length;
        const submitted = Object.values(this.state.submissions).filter(s => s.isSubmitted).length;
        const percent = total === 0 ? 0 : Math.round((submitted / total) * 100);
        const submittedEl = document.getElementById('submitted-count');
        const totalEl = document.getElementById('total-staff-count');
        const bar = document.getElementById('progress-bar');
        if (submittedEl) submittedEl.textContent = submitted;
        if (totalEl) totalEl.textContent = total;
        if (bar) { bar.style.width = `${percent}%`; bar.textContent = `${percent}%`; }
    }

    async editPrevShift(uid, day) {
        const val = prompt("輸入班別(D/E/N/OFF):");
        if(val) {
            const staff = this.state.displayList.find(s=>s.uid===uid);
            if(staff) {
                if(!staff.prevMonthShifts) staff.prevMonthShifts={};
                staff.prevMonthShifts[day] = val.toUpperCase();
                this.renderTableOnly();
            }
        }
    }

    openDetailModal(uid) {
        const staff = this.state.displayList.find(s => s.uid === uid);
        const sub = this.state.submissions[uid] || {};
        if (this.detailModal) {
            document.getElementById('modal-body-content').innerHTML = `
                <div class="p-3">
                    <h5>${staff.name} (${staff.staffId})</h5>
                    <p>目前特註：${sub.note || '無'}</p>
                    <p class="text-muted small">功能開發中，未來可在此編輯排班內容。</p>
                </div>
            `;
            this.detailModal.show();
        } else {
             const modalEl = document.getElementById('detail-modal');
             if(modalEl) { new bootstrap.Modal(modalEl).show(); }
        }
    }
    
    saveDetail() { if(this.detailModal) this.detailModal.hide(); }
    saveReview() { alert("功能實作中：儲存當前預班狀態至正式班表"); }
    exportExcel() { alert("匯出 Excel 功能尚未實作"); }
    remindUnsubmitted() { alert("催繳通知功能尚未實作"); }
}
