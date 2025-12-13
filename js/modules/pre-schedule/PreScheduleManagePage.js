import { PreScheduleManageTemplate } from "./templates/PreScheduleManageTemplate.js";
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

        // Log 1: 確認 render 有被呼叫
        console.log("🚀 [Debug] Page.render() 被呼叫，準備回傳 HTML String");
        return PreScheduleManageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        window.routerPage = this; 
        console.log("🚀 [Debug] Page.afterRender() 開始執行");

        // Log 2: 檢查當下 DOM 狀態
        let modalEl = document.getElementById('detail-modal');
        console.log("🔍 [Debug] 第一次嘗試抓取 #detail-modal:", modalEl);

        // --- 解決方案：給瀏覽器一點時間渲染 DOM ---
        if (!modalEl) {
            console.warn("⚠️ [Debug] 第一次抓不到 Modal，嘗試等待 50ms...");
            await new Promise(r => setTimeout(r, 50)); // 等待 50 毫秒
            modalEl = document.getElementById('detail-modal');
            console.log("🔍 [Debug] 延遲後第二次抓取 #detail-modal:", modalEl);
        }

        // 初始化 Modal
        if (modalEl) {
            this.detailModal = new bootstrap.Modal(modalEl);
            console.log("✅ [Debug] Modal 初始化成功");
        } else {
            console.error("❌ [Debug] 嚴重錯誤：等待後依然找不到 ID 為 'detail-modal' 的元素。請檢查 Template 是否正確輸出 HTML。");
            // 印出當前 body 的內容長度，協助判斷是否整個頁面都沒渲染
            console.log("📄 [Debug] 當前 Body 內容長度:", document.body.innerHTML.length);
        }

        // 權限判斷與載入單位
        if (auth.currentUser) {
            try {
                const userDoc = await userService.getUserData(auth.currentUser.uid);
                this.state.currentUser = userDoc;
                
                if (userDoc && (userDoc.role === 'admin' || userDoc.role === 'system_admin')) {
                    await this.loadUnits();
                }
            } catch (error) {
                console.error("讀取使用者資料失敗", error);
            }
        }

        await this.loadData();
    }

    // --- 其餘邏輯保持不變 ---

    async loadUnits() {
        try {
            const units = await UnitService.getAllUnits();
            const selector = document.getElementById('unit-selector');
            const container = document.getElementById('unit-selector-container');
            
            // Log 3: 檢查單位選單元素
            if (!selector) console.warn("⚠️ [Debug] 找不到 #unit-selector 下拉選單");

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
            }
        } catch (error) {
            console.error("載入單位列表失敗:", error);
        }
    }

    handleUnitChange(newUnitId) {
        if (!newUnitId) return;
        window.location.hash = `/preschedule/manage?unitId=${newUnitId}&year=${this.state.year}&month=${this.state.month}`;
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
            console.warn("上個月班表載入失敗或不存在:", e);
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
            // 這邊如果再跳錯，代表延遲也沒用，可能是 Template 真的沒寫進去
            console.error("❌ [Debug] openDetailModal 失敗: detailModal 物件不存在");
            alert("系統錯誤：無法開啟視窗，請按 F12 查看 Log 並截圖回報。");
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
