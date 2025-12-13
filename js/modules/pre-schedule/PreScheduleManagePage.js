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
        this.modalInitRetries = 0;
        this.maxRetries = 3;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.unitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if (!this.state.unitId) {
            return `
                <div class="alert alert-danger m-4">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    無效的單位參數
                </div>
            `;
        }

        return PreScheduleManageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        window.routerPage = this; 
        console.log(`🚀 [Debug] Page.afterRender() 執行 (Template v${PreScheduleManageTemplate.version})`);

        // 檢查 Template 版本
        this.checkTemplateVersion();

        // 初始化 Modal (使用重試機制)
        await this.initializeModal();

        // 載入使用者資料
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

        // 載入資料
        await this.loadData();
    }

    checkTemplateVersion() {
        const wrapper = document.querySelector('.page-wrapper[data-template-version]');
        if (wrapper) {
            const version = wrapper.getAttribute('data-template-version');
            console.log(`✅ [Debug] 偵測到 Template 版本: ${version}`);
            if (version !== PreScheduleManageTemplate.version) {
                console.warn(`⚠️ [Debug] Template 版本不一致! DOM: ${version}, Code: ${PreScheduleManageTemplate.version}`);
                this.showCacheWarning();
            }
        } else {
            console.error("❌ [Debug] 無法偵測 Template 版本,可能載入舊版快取");
            this.showCacheWarning();
        }
    }

    showCacheWarning() {
        const container = document.getElementById('review-table-container');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-warning m-4">
                    <h5 class="alert-heading">
                        <i class="fas fa-exclamation-triangle me-2"></i>偵測到快取問題
                    </h5>
                    <p>系統偵測到您正在使用舊版頁面快取,部分功能可能無法正常運作。</p>
                    <hr>
                    <p class="mb-0">
                        <strong>解決方法:</strong>
                        請按 <kbd>Ctrl</kbd> + <kbd>F5</kbd> (Windows) 或 
                        <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> (Mac) 強制重新整理頁面。
                    </p>
                    <button class="btn btn-primary mt-3" onclick="location.reload(true)">
                        <i class="fas fa-sync-alt me-2"></i>立即重新整理
                    </button>
                </div>
            `;
        }
    }

    async initializeModal() {
        return new Promise((resolve) => {
            const attemptInit = () => {
                const modalEl = document.getElementById('detail-modal');
                
                if (modalEl) {
                    try {
                        this.detailModal = new bootstrap.Modal(modalEl);
                        console.log("✅ [Debug] Modal 初始化成功");
                        resolve(true);
                    } catch (error) {
                        console.error("❌ [Debug] Modal 初始化失敗:", error);
                        resolve(false);
                    }
                } else {
                    this.modalInitRetries++;
                    
                    if (this.modalInitRetries < this.maxRetries) {
                        console.warn(`⚠️ [Debug] Modal 元素尚未載入,重試 ${this.modalInitRetries}/${this.maxRetries}`);
                        setTimeout(attemptInit, 100);
                    } else {
                        console.error(`❌ [Debug] Modal 初始化失敗,已達最大重試次數 (${this.maxRetries})`);
                        this.showCacheWarning();
                        resolve(false);
                    }
                }
            };
            
            attemptInit();
        });
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
                console.log(`✅ [Debug] 單位選單載入完成 (${units.length} 個單位)`);
            } else {
                console.warn("⚠️ [Debug] 找不到單位選單 DOM,可能是快取問題");
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
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary"></div>
                    <div class="mt-2 text-muted">載入資料中...</div>
                </div>
            `;
        }

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

            console.log(`✅ [Debug] 資料載入完成: ${staffList.length} 位人員`);

        } catch (e) {
            console.error("Load Data Error:", e);
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger m-4">
                        <h5 class="alert-heading">
                            <i class="fas fa-exclamation-circle me-2"></i>載入失敗
                        </h5>
                        <p>${e.message}</p>
                        <button class="btn btn-outline-danger" onclick="window.routerPage.loadData()">
                            <i class="fas fa-redo me-2"></i>重新載入
                        </button>
                    </div>
                `;
            }
        }
    }

    async loadPrevMonthData() {
        let prevYear = this.state.year;
        let prevMonth = this.state.month - 1;
        if (prevMonth === 0) { 
            prevMonth = 12; 
            prevYear--; 
        }

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
            console.log(`✅ [Debug] 上月班表載入完成 (${prevYear}/${prevMonth})`);
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
        e.currentTarget.style.opacity = '0.5';
    }

    handleDragOver(e) {
        if (e.preventDefault) e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        const row = e.currentTarget;
        row.classList.add('table-info');
        return false;
    }

    handleDrop(e) {
        e.stopPropagation();
        const row = e.currentTarget;
        row.classList.remove('table-info');
        
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

    handleDragEnd(e) {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.classList.remove('table-active');
        document.querySelectorAll('.table-info').forEach(el => {
            el.classList.remove('table-info');
        });
    }

    async editPrevShift(uid, day) {
        const staff = this.state.displayList.find(s => s.uid === uid);
        if (!staff) return;
        
        const currentVal = staff.prevMonthShifts[day] || '';
        
        const input = prompt(
            `請輸入 ${staff.name} 於上個月 ${day} 日的班別\n(例如 D, E, N, OFF, M_OFF):`, 
            currentVal
        );
        
        if (input !== null) {
            const code = input.trim().toUpperCase();
            const validCodes = ['D', 'E', 'N', 'OFF', 'M_OFF', ''];
            
            if (validCodes.includes(code)) {
                if (!staff.prevMonthShifts) staff.prevMonthShifts = {};
                staff.prevMonthShifts[day] = code;
                this.renderTableOnly();
                console.log(`✅ [Debug] 已更新 ${staff.name} 上月 ${day} 日班別為: ${code || '(清空)'}`);
            } else {
                alert("無效的班別代碼,請輸入 D, E, N, OFF 或 M_OFF");
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
            bar.setAttribute('aria-valuenow', percent);
            if (percent > 5) {
                bar.textContent = `${percent}%`;
            }
        }
    }
    
    async saveReview() {
        if (!confirm('確定要儲存當前預排狀態並轉入正式班表嗎?')) return;
        
        try {
            // TODO: 實作儲存邏輯
            alert("功能實作中:儲存當前預排狀態至正式班表");
        } catch (error) {
            console.error("儲存失敗:", error);
            alert(`儲存失敗: ${error.message}`);
        }
    }
    
    openDetailModal(uid) {
        if (!this.detailModal) {
            alert("系統偵測到您正在使用舊版頁面快取,請按 Ctrl+F5 強制重新整理。");
            return;
        }

        const staff = this.state.staffList.find(s => s.uid === uid);
        if (!staff) {
            alert("找不到該人員資料");
            return;
        }
        
        const sub = this.state.submissions[uid] || {};
        
        const modalBody = document.getElementById('modal-body-content');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="p-3">
                    <div class="mb-3">
                        <h5 class="mb-0">${staff.name}</h5>
                        <div class="text-muted">員編: ${staff.staffId} | 組別: ${staff.group || '-'}</div>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label fw-bold">特殊註記</label>
                        <textarea class="form-control" rows="3" readonly>${sub.note || '無'}</textarea>
                    </div>
                    
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        此處可擴充為完整的預排編輯表單。
                    </div>
                </div>
            `;
        }
        
        this.detailModal.show();
    }
    
    saveDetail() {
        // TODO: 實作詳細內容儲存
        if (this.detailModal) {
            this.detailModal.hide();
            alert("變更已儲存");
        }
    }
    
    exportExcel() {
        alert("匯出 Excel 功能尚未實作");
    }
    
    remindUnsubmitted() {
        const unsubmitted = this.state.staffList.filter(s => {
            return !this.state.submissions[s.uid]?.isSubmitted;
        });
        
        if (unsubmitted.length === 0) {
            alert("所有人員皆已提交,無需催繳!");
            return;
        }
        
        const names = unsubmitted.map(s => s.name).join(', ');
        alert(`以下 ${unsubmitted.length} 位人員尚未提交:\n\n${names}\n\n催繳通知功能尚未實作。`);
    }
}
