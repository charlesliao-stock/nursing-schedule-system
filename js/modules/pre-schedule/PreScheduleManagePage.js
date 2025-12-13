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
    // 1. Render: 直接回傳 HTML，不透過 Template 物件
    // ====================================================
    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger">無效的單位參數</div>';

        console.log("🚀 [System] Render 函式執行中...");

        // 直接在這裡構建 HTML，確保絕對不會拿錯
        return `
        <div id="pre-schedule-wrapper" class="container-fluid p-4">
            
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div class="d-flex align-items-center">
                    <h2 class="mb-0 fw-bold text-dark">
                        <i class="fas fa-calendar-check text-primary me-2"></i>預班管理與審核 (除錯版)
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

            <div class="row mb-4">
                <div class="col-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h6 class="text-muted">載入狀態</h6>
                            <div id="loading-status">準備載入資料...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card shadow border-0">
                <div class="card-body p-0">
                    <div id="review-table-container">
                        <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
                    </div>
                </div>
            </div>

        </div>

        <div class="modal fade" id="detail-modal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
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
    // 2. AfterRender: 強力偵錯模式
    // ====================================================
    async afterRender() {
        window.routerPage = this; 
        console.log("🚀 [System] AfterRender 啟動");

        // [偵錯步驟 1] 檢查 main-view 裡面到底有沒有東西
        const mainView = document.getElementById('main-view');
        if (mainView) {
            console.log(`📄 [DOM Check] #main-view 內容長度: ${mainView.innerHTML.length}`);
            console.log(`📄 [DOM Check] 是否包含 detail-modal 字串? ${mainView.innerHTML.includes('detail-modal')}`);
        } else {
            console.error("❌ [DOM Check] 嚴重錯誤：找不到 #main-view 容器！Router 運作異常。");
        }

        // [偵錯步驟 2] 嘗試抓取 Modal
        const modalEl = document.getElementById('detail-modal');
        
        if (modalEl) {
            console.log("✅ [System] 成功抓取到 Modal 元素！");
            this.detailModal = new bootstrap.Modal(modalEl);
        } else {
            console.error("❌ [System] 依然抓不到 Modal 元素。這代表 HTML 渲染不完整。");
            // 強制插入一個 Modal 測試 (如果原本的沒渲染出來)
            if (mainView) {
                console.warn("⚠️ 嘗試強制插入 Modal HTML...");
                mainView.insertAdjacentHTML('beforeend', `
                    <div class="modal fade" id="detail-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body">強制插入測試</div></div></div></div>
                `);
                const retryModal = document.getElementById('detail-modal');
                if(retryModal) {
                    this.detailModal = new bootstrap.Modal(retryModal);
                    console.log("✅ [System] 強制插入後初始化成功。");
                }
            }
        }

        // 3. 權限判斷與載入單位
        if (auth.currentUser) {
            try {
                const userDoc = await userService.getUserData(auth.currentUser.uid);
                this.state.currentUser = userDoc;
                
                if (userDoc && (userDoc.role === 'admin' || userDoc.role === 'system_admin')) {
                    await this.loadUnits();
                }
            } catch (error) {
                console.error("權限讀取錯誤", error);
            }
        }

        await this.loadData();
    }

    async loadUnits() {
        try {
            const units = await UnitService.getAllUnits();
            const selector = document.getElementById('unit-selector');
            const container = document.getElementById('unit-selector-container');
            
            if (selector && container) {
                selector.innerHTML = '<option value="" disabled>切換單位...</option>';
                units.forEach(unit => {
                    const option = document.createElement('option');
                    option.value = unit.id;
                    option.textContent = unit.name;
                    if (unit.id === this.state.unitId) {
                        option.selected = true;
                    }
                    selector.appendChild(option);
                });
                container.style.display = 'block';
                console.log("✅ 單位選單載入完成");
            } else {
                // 不報錯，避免洗版，因為可能權限不足
            }
        } catch (error) {
            console.error("載入單位失敗:", error);
        }
    }

    handleUnitChange(newUnitId) {
        if (!newUnitId) return;
        window.location.hash = `/preschedule/manage?unitId=${newUnitId}&year=${this.state.year}&month=${this.state.month}`;
        setTimeout(() => location.reload(), 100);
    }

    async loadData() {
        const container = document.getElementById('review-table-container');
        const statusEl = document.getElementById('loading-status');
        if (statusEl) statusEl.textContent = "正在讀取資料庫...";

        try {
            const [staffList, preSchedule] = await Promise.all([
                userService.getUnitStaff(this.state.unitId),
                PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month)
            ]);

            this.state.staffList = staffList;
            if (preSchedule) this.state.submissions = preSchedule.submissions || {};

            await this.loadPrevMonthData();
            this.enrichStaffData();
            this.updateProgress(); // 這裡可能會報錯，先註解或檢查
            this.handleSort(this.state.sortConfig.key, false);
            
            if (statusEl) statusEl.textContent = `載入完成，共 ${staffList.length} 筆資料`;

        } catch (e) {
            console.error("Load Data Error:", e);
            if (container) container.innerHTML = `<div class="alert alert-danger">載入失敗: ${e.message}</div>`;
        }
    }

    // 省略 loadPrevMonthData, enrichStaffData, handleSort, handleDragStart... 
    // 為了節省篇幅，請保留您原本檔案中下方的輔助函式
    // 或是直接複製下方的完整輔助函式區塊
    
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

    // 內建 Table 產生器，取代外部 Template
    renderReviewTableHTML() {
        const { sortKey, dir } = this.state.sortConfig;
        const getSortIcon = (k) => sortKey !== k ? '<i class="fas fa-sort text-muted opacity-25"></i>' : (dir === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>');
        
        let html = `<div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="bg-light sticky-top"><tr>
            <th style="width:50px">#</th>
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
            const statusBadge = sub.isSubmitted ? '<span class="badge bg-success">已送出</span>' : '<span class="badge bg-secondary">未填寫</span>';
            
            // 產生格子 HTML
            let gridHtml = '<div class="d-flex overflow-auto" style="max-width:450px">';
            // 上月
            (staff.prevMonthDays||[]).forEach(d => {
                const s = (staff.prevMonthShifts||{})[d] || '';
                const style = s ? 'bg-secondary text-white opacity-50' : 'bg-white text-muted border-dashed';
                gridHtml += `<div class="border rounded text-center me-1 ${style}" style="min-width:24px;font-size:0.7em" onclick="window.routerPage.editPrevShift('${staff.uid}',${d})"><div>${d}</div><div>${s||'?'}</div></div>`;
            });
            gridHtml += '<div class="border-end mx-1"></div>';
            // 本月
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
                <td>${staff.name}</td>
                <td>${staff.group||''}</td>
                <td>${gridHtml}</td>
                <td class="small text-start">${sub.note||'-'}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center"><button class="btn btn-sm btn-outline-primary rounded-circle" style="width:30px;height:30px" onclick="window.routerPage.openDetailModal('${staff.uid}')"><i class="fas fa-pen"></i></button></td>
            </tr>`;
        });
        return html + '</tbody></table></div>';
    }

    updateProgress() { /* ... */ }

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
            document.getElementById('modal-body-content').innerHTML = `<div class="p-3"><h5>${staff.name}</h5><p>備註: ${sub.note||'無'}</p></div>`;
            this.detailModal.show();
        } else {
            // 最後防線：如果原本 Modal 壞了，直接用 JS 建立一個新的
            alert(`編輯: ${staff.name}\n(系統異常：Modal 元件未載入，請按 F5)`);
        }
    }
    
    saveDetail() { if(this.detailModal) this.detailModal.hide(); }
    saveReview() { alert("儲存功能實作中"); }
    exportExcel() { alert("匯出功能實作中"); }
    remindUnsubmitted() { alert("催繳功能實作中"); }
}
