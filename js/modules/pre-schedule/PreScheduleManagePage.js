import { PreScheduleManageTemplate } from "./templates/PreScheduleManageTemplate.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js"; // 記得確認引用路徑
import { userService } from "../../services/firebase/UserService.js";

export class PreScheduleManagePage {
    constructor() {
        this.state = {
            unitId: null,
            year: null,
            month: null,
            staffList: [],        // 原始資料
            displayList: [],      // 排序後的顯示資料
            submissions: {},
            prevMonthData: {},    // 上個月班表快取
            prevMonthDays: [],    // 上個月最後幾天 [25, 26...]
            sortConfig: { key: 'staffId', dir: 'asc' }, // 預設依員編排序
            dragSrcUid: null      // 拖曳暫存
        };
        this.detailModal = null;
        this.currentEditUid = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) return '<div class="alert alert-danger">無效的單位參數</div>';

        return PreScheduleManageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        this.detailModal = new bootstrap.Modal(document.getElementById('detail-modal'));
        window.routerPage = this; // 綁定到 window 以供 Template 呼叫
        await this.loadData();
    }

    async loadData() {
        const container = document.getElementById('review-table-container');
        if (container) container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><div class="mt-2 text-muted">載入資料中...</div></div>';

        try {
            // 1. 平行載入人員名單與本月預班
            const [staffList, preSchedule] = await Promise.all([
                userService.getUnitStaff(this.state.unitId),
                PreScheduleService.getPreSchedule(this.state.unitId, this.state.year, this.state.month)
            ]);

            this.state.staffList = staffList;
            if (preSchedule) this.state.submissions = preSchedule.submissions || {};

            // 2. 載入上個月班表 (用於補足月底 6 天)
            await this.loadPrevMonthData();

            // 3. 整合資料：把上月班表塞進 staff 物件
            this.enrichStaffData();

            // 4. 更新進度條
            this.updateProgress();

            // 5. 初始排序與渲染
            this.handleSort(this.state.sortConfig.key, false);

        } catch (e) {
            console.error("Load Data Error:", e);
            if (container) container.innerHTML = `<div class="alert alert-danger">載入失敗: ${e.message}</div>`;
        }
    }

    // --- 新功能：載入上個月資料 ---
    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        // 計算上個月的最後 6 天
        const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
        const last6Days = [];
        for (let i = 5; i >= 0; i--) {
            last6Days.push(daysInPrevMonth - i);
        }
        this.state.prevMonthDays = last6Days;

        try {
            const prevSchedule = await ScheduleService.getSchedule(this.state.unitId, prevYear, prevMonth);
            const map = {};
            
            // 如果上個月有班表，轉存為 { uid: { day: code } }
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
            this.state.prevMonthData = {}; // 保持為空，顯示虛線讓用戶填
        }
    }

    enrichStaffData() {
        // 將上月班表注入到每個員工物件，方便 Template 讀取
        this.state.staffList.forEach(s => {
            s.prevMonthDays = this.state.prevMonthDays;
            // 若 DB 有資料則用 DB，若無則為空
            s.prevMonthShifts = this.state.prevMonthData[s.uid] || {};
        });
        // 初始化顯示列表
        this.state.displayList = [...this.state.staffList];
    }

    // --- 新功能：排序處理 ---
    handleSort(key, toggle = true) {
        // 更新排序設定
        if (toggle && this.state.sortConfig.key === key) {
            this.state.sortConfig.dir = this.state.sortConfig.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.sortConfig.key = key;
            if (toggle) this.state.sortConfig.dir = 'asc';
        }

        const { key: sortKey, dir } = this.state.sortConfig;
        const multiplier = dir === 'asc' ? 1 : -1;

        // 執行排序
        this.state.displayList.sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];

            // 特殊處理：狀態排序 (依是否提交)
            if (sortKey === 'status') {
                valA = this.state.submissions[a.uid]?.isSubmitted ? 1 : 0;
                valB = this.state.submissions[b.uid]?.isSubmitted ? 1 : 0;
            } else {
                valA = valA || '';
                valB = valB || '';
            }

            // 特殊處理：員編若為數字字串，轉數字排序
            if (sortKey === 'staffId') {
                const numA = parseFloat(valA);
                const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return (numA - numB) * multiplier;
                }
            }

            // 一般字串排序
            return String(valA).localeCompare(String(valB), 'zh-Hant') * multiplier;
        });

        this.renderTableOnly();
    }

    // --- 新功能：拖曳排序 (Drag & Drop) ---
    handleDragStart(e) {
        this.state.dragSrcUid = e.currentTarget.dataset.uid;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('table-active'); // 拖曳時的視覺效果
    }

    handleDragOver(e) {
        if (e.preventDefault) e.preventDefault(); // 允許放置
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDrop(e) {
        e.stopPropagation();
        const row = e.currentTarget;
        row.classList.remove('table-active');
        
        const targetUid = row.dataset.uid;
        if (this.state.dragSrcUid === targetUid) return;

        // 重新排列 Array
        const fromIndex = this.state.displayList.findIndex(s => s.uid === this.state.dragSrcUid);
        const toIndex = this.state.displayList.findIndex(s => s.uid === targetUid);

        if (fromIndex > -1 && toIndex > -1) {
            const [movedItem] = this.state.displayList.splice(fromIndex, 1);
            this.state.displayList.splice(toIndex, 0, movedItem);
            
            // 拖曳後，通常不再維持原本的排序規則 (視為自訂排序)
            // 這裡重新渲染表格
            this.renderTableOnly();
        }
    }

    // --- 新功能：手動編輯上個月班別 ---
    async editPrevShift(uid, day) {
        const staff = this.state.displayList.find(s => s.uid === uid);
        const currentVal = staff.prevMonthShifts[day] || '';
        
        const input = prompt(`請輸入 ${staff.name} 於上個月 ${day} 日的班別 (例如 D, E, N, OFF):`, currentVal);
        
        if (input !== null) {
            const code = input.trim().toUpperCase();
            if (['D', 'E', 'N', 'OFF', 'M_OFF', ''].includes(code) || code === '') {
                // 更新本地暫存資料
                if (!staff.prevMonthShifts) staff.prevMonthShifts = {};
                staff.prevMonthShifts[day] = code;
                
                // 注意：這裡僅更新畫面暫存，若要永久儲存，建議呼叫 ScheduleService 更新上一月的班表
                // await ScheduleService.updateShift(unitId, prevYear, prevMonth, uid, day, code);
                // 這裡為了流暢度先只做前端更新
                
                this.renderTableOnly();
            } else {
                alert("無效的班別代碼，請輸入 D, E, N 或 OFF");
            }
        }
    }

    // 只重繪表格內容 (不重繪外框與 Modal)
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

    // 更新進度條 UI
    updateProgress() {
        const total = this.state.staffList.length;
        const submitted = Object.values(this.state.submissions).filter(s => s.isSubmitted).length;
        const percent = total === 0 ? 0 : Math.round((submitted / total) * 100);

        document.getElementById('submitted-count').textContent = submitted;
        document.getElementById('total-staff-count').textContent = total;
        const bar = document.getElementById('progress-bar');
        if (bar) {
            bar.style.width = `${percent}%`;
            bar.textContent = `${percent}%`;
        }
    }
    
    // (其餘 saveReview, exportExcel 等方法維持原樣或根據您的需求保留)
    async saveReview() {
        // 這裡您可以實作將預班轉入正式班表的邏輯
        alert("功能實作中：儲存當前預班狀態至正式班表");
    }
    
    openDetailModal(uid) {
        alert(`開啟詳細編輯: ${uid} (功能請自行串接 Detail Template)`);
    }
}
