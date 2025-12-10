import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.reviewStaffList = []; 
        this.currentReviewId = null; 
        this.modal = null;
        this.reviewModal = null;
        // 定義支援的預班類型與樣式
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' }, // 紅
            'D':   { label: 'D',   color: '#0d6efd', bg: '#0d6efd', text: 'white' }, // 藍
            'E':   { label: 'E',   color: '#ffc107', bg: '#ffc107', text: 'black' }, // 黃
            'N':   { label: 'N',   color: '#212529', bg: '#212529', text: 'white' }, // 黑
            'XD':  { label: 'x白', color: '#adb5bd', bg: '#f8f9fa', text: '#0d6efd', border: '1px solid #0d6efd' },
            'XE':  { label: 'x小', color: '#adb5bd', bg: '#f8f9fa', text: '#ffc107', border: '1px solid #ffc107' },
            'XN':  { label: 'x大', color: '#adb5bd', bg: '#f8f9fa', text: '#212529', border: '1px solid #212529' },
            'M_OFF': { label: 'OFF', color: '#6f42c1', bg: '#6f42c1', text: 'white' } // 管理者強制
        };
    }

    async render() {
        // ... (Unit Select UI 代碼省略，同前)
        const baseHtml = await this.getBaseLayout(); // 假設封裝了基本的 Unit Select HTML
        
        // Context Menu HTML (隱藏)
        const contextMenu = `
            <div id="shift-context-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                ${Object.entries(this.shiftTypes).filter(([k])=>k!=='M_OFF').map(([key, cfg]) => 
                    `<button class="list-group-item list-group-item-action py-1 text-center small fw-bold" 
                        style="color:${cfg.bg=== '#f8f9fa'?cfg.text:'white'}; background:${cfg.bg==='#f8f9fa'?'white':cfg.bg};"
                        onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                ).join('')}
                <button class="list-group-item list-group-item-action py-1 text-center text-secondary small" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
            </div>
        `;

        return baseHtml + contextMenu + this.getReviewModalHtml();
    }

    // 模擬 Base Layout (請整合)
    async getBaseLayout() { /* ... 同上一版 render 開頭 ... */ return `<div class="container-fluid mt-4">...</div>`; }
    
    getReviewModalHtml() {
        return `
            <div class="modal fade" id="review-modal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-fullscreen">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white py-2">
                            <h6 class="modal-title"><i class="fas fa-th"></i> 預班總表審核</h6>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0 d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
                                <div class="small">
                                    <span class="badge bg-danger me-1">OFF</span>
                                    <span class="badge bg-primary me-1">D</span>
                                    <span class="badge bg-warning text-dark me-1">E</span>
                                    <span class="badge bg-dark me-1">N</span>
                                    <span class="badge bg-light text-primary border me-1">x白</span>
                                    <span class="badge" style="background:#6f42c1;">紫:管理者</span>
                                    <span class="ms-2 text-muted"><i class="fas fa-mouse-pointer"></i> 左鍵: OFF/清除 | <i class="fas fa-mouse-pointer"></i> 右鍵: 選單</span>
                                </div>
                                <button class="btn btn-primary btn-sm" id="btn-save-review"><i class="fas fa-save"></i> 儲存</button>
                            </div>
                            <div class="table-responsive flex-grow-1">
                                <table class="table table-bordered table-sm text-center table-hover mb-0 user-select-none" style="font-size: 0.85rem;" id="review-table">
                                    <thead class="table-light sticky-top" style="z-index: 1020;" id="review-thead"></thead>
                                    <tbody id="review-tbody"></tbody>
                                    <tfoot class="table-light sticky-bottom fw-bold" style="z-index: 1020;" id="review-tfoot"></tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        window.routerPage = this;
        // 綁定全域點擊關閉 Context Menu
        document.addEventListener('click', (e) => {
            if(!e.target.closest('#shift-context-menu')) document.getElementById('shift-context-menu').style.display = 'none';
        });
        
        // ... (其他綁定同前) ...
    }

    // =========================================================
    //  審核邏輯 (支援 Context Menu & Immediate Count)
    // =========================================================
    async openReview(scheduleId) {
        this.currentReviewId = scheduleId;
        const schedule = this.preSchedules.find(s => s.id === scheduleId);
        
        // 1. 準備資料
        const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
        const allStaff = await userService.getUsersByUnit(this.targetUnitId);
        this.reviewStaffList = allStaff.filter(s => schedule.staffIds.includes(s.uid)).sort(/*...*/);

        // 2. 表頭
        let thead = '<tr><th class="sticky-col bg-light" style="min-width:150px; left:0;">人員</th>';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(schedule.year, schedule.month-1, d);
            const isW = date.getDay()===0 || date.getDay()===6;
            thead += `<th class="${isW?'text-danger':''}" style="min-width:35px;">${d}</th>`;
        }
        thead += '</tr>';
        document.getElementById('review-thead').innerHTML = thead;

        // 3. 內容
        this.renderReviewBody(schedule, daysInMonth);
        this.updateFooterStats(schedule, daysInMonth); // 初始計算
        
        this.reviewModal.show();
    }

    renderReviewBody(schedule, daysInMonth) {
        const tbody = document.getElementById('review-tbody');
        let html = '';
        const subs = schedule.submissions || {};

        this.reviewStaffList.forEach(staff => {
            const wishes = subs[staff.uid]?.wishes || {};
            html += `<tr><td class="sticky-col bg-white text-start ps-2" style="left:0;">${staff.name}</td>`;
            
            for(let d=1; d<=daysInMonth; d++) {
                const val = wishes[d];
                const style = this.getCellStyle(val);
                
                // 左鍵切換 (OFF/M_OFF), 右鍵開啟選單
                html += `<td class="review-cell" 
                            style="${style} cursor:pointer;"
                            onclick="window.routerPage.handleCellClick(event, '${staff.uid}', ${d})"
                            oncontextmenu="window.routerPage.handleCellRightClick(event, '${staff.uid}', ${d})"
                            id="cell-${staff.uid}-${d}">
                            ${this.getCellText(val)}
                         </td>`;
            }
            html += '</tr>';
        });
        tbody.innerHTML = html;
    }

    getCellStyle(val) {
        if(!val) return '';
        const cfg = this.shiftTypes[val];
        if(!cfg) return '';
        if(cfg.border) return `background:${cfg.bg}; color:${cfg.text}; border:${cfg.border}; font-weight:bold;`;
        return `background:${cfg.bg}; color:${cfg.text}; font-weight:bold;`;
    }
    
    getCellText(val) {
        return val === 'M_OFF' ? 'OFF' : (val || '');
    }

    // 左鍵：快速切換 OFF (User) / M_OFF (Manager)
    handleCellClick(e, uid, day) {
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule.submissions[uid]) schedule.submissions[uid] = { wishes: {} };
        const wishes = schedule.submissions[uid].wishes;

        if (wishes[day]) { delete wishes[day]; } 
        else { wishes[day] = 'M_OFF'; } // 管理者預設填入 M_OFF

        this.updateCellUI(uid, day, wishes[day]);
        this.updateFooterStats(schedule, new Date(schedule.year, schedule.month, 0).getDate());
    }

    // 右鍵：開啟選單
    handleCellRightClick(e, uid, day) {
        e.preventDefault();
        this.tempTarget = { uid, day }; // 暫存目標
        const menu = document.getElementById('shift-context-menu');
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    applyShiftFromMenu(type) {
        if(!this.tempTarget) return;
        const { uid, day } = this.tempTarget;
        const schedule = this.preSchedules.find(s => s.id === this.currentReviewId);
        if(!schedule.submissions[uid]) schedule.submissions[uid] = { wishes: {} };
        
        if(type) schedule.submissions[uid].wishes[day] = type;
        else delete schedule.submissions[uid].wishes[day];

        this.updateCellUI(uid, day, type);
        this.updateFooterStats(schedule, new Date(schedule.year, schedule.month, 0).getDate());
        document.getElementById('shift-context-menu').style.display = 'none';
    }

    updateCellUI(uid, day, val) {
        const cell = document.getElementById(`cell-${uid}-${day}`);
        cell.style = this.getCellStyle(val) + "cursor:pointer;";
        cell.innerText = this.getCellText(val);
    }

    // ✅ 即時更新底部計數器 (Req 4)
    updateFooterStats(schedule, daysInMonth) {
        const tfoot = document.getElementById('review-tfoot');
        let html = '<tr><td class="sticky-col bg-light text-end pe-2" style="left:0;">休假數</td>';
        
        // 假設每日上限 (可改為動態)
        const limit = Math.ceil(this.reviewStaffList.length * 0.4); 

        for(let d=1; d<=daysInMonth; d++) {
            let count = 0;
            this.reviewStaffList.forEach(s => {
                const w = schedule.submissions[s.uid]?.wishes?.[d];
                if(w === 'OFF' || w === 'M_OFF') count++;
            });
            const color = count > limit ? 'text-danger' : '';
            html += `<td class="${color}">${count}</td>`;
        }
        html += '</tr>';
        tfoot.innerHTML = html;
    }
}
