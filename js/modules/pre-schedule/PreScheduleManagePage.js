import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js"; 
import { auth } from "../../config/firebase.config.js"; 

// =========================================================
// ⬇️ 直接將 Template 定義在這裡，避開所有引入與快取問題 ⬇️
// =========================================================
const LocalTemplate = {
    renderLayout(year, month) {
        return `
        <div class="page-wrapper">
            <div class="container-fluid p-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="d-flex align-items-center">
                        <h2 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-calendar-check text-primary me-2"></i>預班管理與審核 (合體版)
                        </h2>
                        
                        <div id="unit-selector-container" class="ms-4" style="display:none;">
                            <select id="unit-selector" class="form-select fw-bold border-primary text-primary shadow-sm" 
                                    style="min-width: 200px;"
                                    onchange="window.routerPage.handleUnitChange(this.value)">
                                <option value="" disabled selected>切換單位...</option>
                            </select>
                        </div>

                        <span class="badge bg-white text-dark border ms-3 fs-6 shadow-sm">
                            ${year}年 ${month}月
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
                            <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
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
        </div>
        `;
    },

    renderReviewTable(staffList, submissions, year, month, options = {}) {
        const { sortKey = 'staffId', sortDir = 'asc' } = options;
        const getSortIcon = (key) => {
            if (sortKey !== key) return '<i class="fas fa-sort text-muted opacity-25 ms-1"></i>';
            return sortDir === 'asc' ? '<i class="fas fa-sort-up text-dark ms-1"></i>' : '<i class="fas fa-sort-down text-dark ms-1"></i>';
        };

        let html = `
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" id="review-table">
                <thead class="bg-light sticky-top" style="z-index: 10;">
                    <tr>
                        <th style="width: 50px;" class="text-center">#</th>
                        <th style="width: 100px; cursor: pointer;" onclick="window.routerPage.handleSort('staffId')">員編 ${getSortIcon('staffId')}</th>
                        <th style="width: 120px;">姓名</th>
                        <th style="width: 90px; cursor: pointer;" onclick="window.routerPage.handleSort('group')">組別 ${getSortIcon('group')}</th>
                        <th style="min-width: 350px;">預班內容 (含上月月底)</th>
                        <th style="min-width: 250px; max-width: 300px;">特註 / 偏好</th>
                        <th style="width: 100px; cursor: pointer;" onclick="window.routerPage.handleSort('status')">狀態 ${getSortIcon('status')}</th>
                        <th style="width: 80px;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (staffList.length === 0) {
            html += `<tr><td colspan="8" class="text-center py-5 text-muted">目前尚無人員資料</td></tr>`;
        } else {
            staffList.forEach((staff) => {
                const sub = submissions[staff.uid] || {};
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
                const gridHtml = this.renderGridVisual(staff, wishes, year, month);

                html += `
                    <tr draggable="true" 
                        data-uid="${staff.uid}" 
                        class="review-row"
                        ondragstart="window.routerPage.handleDragStart(event)" 
                        ondragover="window.routerPage.handleDragOver(event)" 
                        ondrop="window.routerPage.handleDrop(event)">
                        <td class="text-center text-muted" style="cursor: grab;" title="拖曳排序"><i class="fas fa-grip-vertical"></i></td>
                        <td class="fw-bold text-secondary">${staff.staffId || ''}</td>
                        <td><div class="fw-bold text-dark">${staff.name}</div><div class="small text-muted">${staff.rank || ''}</div></td>
                        <td><span class="badge bg-light text-dark border">${staff.group || '-'}</span></td>
                        <td class="py-2">${gridHtml}</td>
                        <td class="text-start align-top py-3">${noteHtml}</td>
                        <td class="text-center">${statusBadge}<div class="small text-muted mt-1" style="font-size:0.75rem">${updateTime}</div></td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-primary rounded-circle" style="width:32px; height:32px;" onclick="window.routerPage.openDetailModal('${staff.uid}')" title="編輯"><i class="fas fa-pen"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
        html += `</tbody></table></div>`;
        return html;
    },

    renderGridVisual(staff, wishes, year, month) {
        let html = '<div class="d-flex align-items-center overflow-auto pb-1" style="max-width: 450px;">';
        const prevDays = staff.prevMonthDays || []; 
        const prevShifts = staff.prevMonthShifts || {};
        prevDays.forEach(d => {
            const shift = prevShifts[d] || '';
            let styleClass = shift ? 'bg-secondary text-white opacity-50 border-secondary' : 'bg-white text-muted border-secondary border-dashed';
            html += `<div class="text-center me-1 rounded border ${styleClass}" style="min-width: 24px; cursor: pointer;" title="上月 ${d} 日" onclick="window.routerPage.editPrevShift('${staff.uid}', ${d})"><div class="bg-light border-bottom text-muted" style="font-size: 0.6rem; line-height: 12px;">${d}</div><div style="font-size: 0.75rem; font-weight: bold; line-height: 18px;">${shift || '?'}</div></div>`;
        });
        if (prevDays.length > 0) html += '<div class="border-end mx-2" style="height: 30px; border-color: #ddd;"></div>';
        let hasWishes = false;
        for (let d = 1; d <= 31; d++) {
            if (wishes[d]) {
                hasWishes = true;
                const w = wishes[d];
                let bgClass = w === 'OFF' ? 'bg-secondary text-white border-secondary' : (w === 'M_OFF' ? 'bg-dark text-white border-dark' : 'bg-primary text-white border-primary');
                html += `<div class="text-center me-1 rounded border ${bgClass}" style="min-width: 24px;"><div class="bg-white text-dark border-bottom opacity-75" style="font-size: 0.6rem; line-height: 12px;">${d}</div><div style="font-size: 0.75rem; font-weight: bold; line-height: 18px;">${w}</div></div>`;
            }
        }
        if (!hasWishes) html += '<span class="text-muted small ms-1">無預班</span>';
        html += '</div>';
        return html;
    },

    getWishSummary(wishes) {
        if (!wishes) return '';
        const counts = {};
        Object.values(wishes).forEach(w => counts[w] = (counts[w] || 0) + 1);
        const parts = [];
        if (counts['OFF']) parts.push(`OFF:${counts['OFF']}`);
        if (counts['M_OFF']) parts.push(`管休:${counts['M_OFF']}`);
        Object.keys(counts).forEach(key => { if (key !== 'OFF' && key !== 'M_OFF') parts.push(`${key}:${counts[key]}`); });
        return parts.join(', ');
    }
};

// =========================================================
// ⬆️ Template 結束，下方是 Page Class ⬆️
// =========================================================

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

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger">無效的單位參數</div>';

        console.log("🚀 [System] Render 啟動 (合體版)");
        // ✅ 直接使用本地定義的 LocalTemplate
        return LocalTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        window.routerPage = this; 
        console.log("🚀 [System] AfterRender 啟動");

        // 1. 抓取 Modal
        // 因為是本地 Template，這裡理論上一定抓得到
        let modalEl = document.getElementById('detail-modal');
        if (!modalEl) {
            console.warn("⚠️ 尚未偵測到 Modal，等待 DOM...");
            await new Promise(r => setTimeout(r, 100)); 
            modalEl = document.getElementById('detail-modal');
        }

        if (modalEl) {
            this.detailModal = new bootstrap.Modal(modalEl);
            console.log("✅ Modal 初始化成功");
        } else {
            console.error("❌ 嚴重錯誤：即使合體了還是抓不到 Modal，請檢查 Router.js 是否正確將內容塞入 DOM。");
            return;
        }

        // 2. 權限判斷與載入單位
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
                console.error("❌ 找不到單位選單 DOM");
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

    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        const last6Days = [];
        for (let i = 5; i >= 0; i--) {
            last6Days.push(daysInPrevMonth - i);
        }
        this.state.prevMonthDays = last6Days;

        try {
            const prevSchedule = await ScheduleService.getSchedule(this.state.unitId, prevYear, prevMonth);
            const map = {};
            if (prevSchedule && prevSchedule.assignments) {
                Object.entries(prevSchedule.assignments).forEach(([uid, shifts]) => {
                    map[uid] = {};
                    last6Days.forEach(d => {
                        if (shifts[d]) map[uid][d] = shifts[d];
                    });
                });
            }
            this.state.prevMonthData = map;
        } catch (e) {
            this.state.prevMonthData = {}; 
        }
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
            let valA = a[sortKey];
            let valB = b[sortKey];

            if (sortKey === 'status') {
                valA = this.state.submissions[a.uid]?.isSubmitted ? 1 : 0;
                valB = this.state.submissions[b.uid]?.isSubmitted ? 1 : 0;
            } else {
                valA = valA || '';
                valB = valB || '';
            }

            if (sortKey === 'staffId') {
                const numA = parseFloat(valA);
                const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return (numA - numB) * multiplier;
                }
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

    handleDragOver(e) {
        if (e.preventDefault) e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

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

    async editPrevShift(uid, day) {
        const staff = this.state.displayList.find(s => s.uid === uid);
        const currentVal = staff.prevMonthShifts[day] || '';
        
        const input = prompt(`請輸入 ${staff.name} 於上個月 ${day} 日的班別 (例如 D, E, N, OFF):`, currentVal);
        
        if (input !== null) {
            const code = input.trim().toUpperCase();
            if (['D', 'E', 'N', 'OFF', 'M_OFF', ''].includes(code) || code === '') {
                if (!staff.prevMonthShifts) staff.prevMonthShifts = {};
                staff.prevMonthShifts[day] = code;
                this.renderTableOnly();
            } else {
                alert("無效的班別代碼，請輸入 D, E, N 或 OFF");
            }
        }
    }

    renderTableOnly() {
        const container = document.getElementById('review-table-container');
        if (container) {
            container.innerHTML = LocalTemplate.renderReviewTable(
                this.state.displayList,
                this.state.submissions,
                this.state.year,
                this.state.month,
                { 
                    sortKey: this.state.sortConfig.key, 
                    sortDir: this.state.sortConfig.dir 
                }
            );
        }
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
        if (bar) {
            bar.style.width = `${percent}%`;
            bar.textContent = `${percent}%`;
        }
    }
    
    async saveReview() {
        alert("功能實作中：儲存當前預班狀態至正式班表");
    }
    
    openDetailModal(uid) {
        const staff = this.state.staffList.find(s => s.uid === uid);
        const sub = this.state.submissions[uid] || {};
        
        if (this.detailModal) {
            document.getElementById('modal-body-content').innerHTML = `
                <div class="p-3">
                    <h5>${staff.name} (${staff.staffId})</h5>
                    <p>目前特註：${sub.note || '無'}</p>
                    <p class="text-muted small">此處可擴充為完整的預班編輯表單。</p>
                </div>
            `;
            this.detailModal.show();
        } else {
             const modalEl = document.getElementById('detail-modal');
             if(modalEl) {
                 new bootstrap.Modal(modalEl).show();
             } else {
                 alert("Modal 初始化失敗，請重新整理頁面");
             }
        }
    }
    
    saveDetail() {
        if(this.detailModal) this.detailModal.hide();
    }
    
    exportExcel() {
        alert("匯出 Excel 功能尚未實作");
    }
    
    remindUnsubmitted() {
        alert("催繳通知功能尚未實作");
    }
}
