// ✅ 關鍵修改：在檔名後加上 ?v=2.1 強制瀏覽器重抓檔案，避開快取
import { PreScheduleManageTemplate } from "./templates/PreScheduleManageTemplate.js?v=2.1"; 
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

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger">無效的單位參數</div>';

        console.log("🚀 [System] Render 啟動 (v2.1)");
        return PreScheduleManageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        window.routerPage = this; 
        console.log("🚀 [System] AfterRender 啟動");

        // 1. 抓取 Modal (加入重試機制，防止 DOM 渲染延遲)
        let modalEl = document.getElementById('detail-modal');
        if (!modalEl) {
            console.warn("⚠️ 尚未偵測到 Modal，嘗試延遲抓取 (100ms)...");
            await new Promise(r => setTimeout(r, 100)); // 等 0.1 秒
            modalEl = document.getElementById('detail-modal');
        }

        if (modalEl) {
            this.detailModal = new bootstrap.Modal(modalEl);
            console.log("✅ Modal 初始化成功");
        } else {
            console.error("❌ 嚴重錯誤：畫面樣板 (Template) 仍是舊版！請務必清除瀏覽器快取。");
            // 這裡不 return，繼續嘗試執行其他邏輯
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
                console.error("❌ 找不到單位選單 DOM (#unit-selector)，確認是舊版 Template。");
            }
        } catch (error) {
            console.error("載入單位失敗:", error);
        }
    }

    handleUnitChange(newUnitId) {
        if (!newUnitId) return;
        window.location.hash = `/preschedule/manage?unitId=${newUnitId}&year=${this.state.year}&month=${this.state.month}`;
        // 強制重新整理以確保參數生效
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
            container.innerHTML = PreScheduleManageTemplate.renderReviewTable(
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
            console.error("Modal 尚未初始化，請重新整理");
            // 嘗試手動顯示
            const modalEl = document.getElementById('detail-modal');
            if(modalEl) {
                const tempModal = new bootstrap.Modal(modalEl);
                tempModal.show();
            } else {
                alert("無法開啟視窗，請重新整理頁面");
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
