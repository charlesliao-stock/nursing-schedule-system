import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;
        this.selectedStaff = [];
        this.reviewStaffList = [];
        this.currentReviewId = null;
        this.modal = null;
        this.searchModal = null;
        this.reviewModal = null;
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D': { label: 'D', color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E': { label: 'E', color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N': { label: 'N', color: '#212529', bg: '#212529', text: 'white' },
            'M_OFF': { label: 'OFF', color: '#6f42c1', bg: '#6f42c1', text: 'white' }
        };
    }

    async render() {
        // ... (HTML 結構與上一版相同，為了篇幅，此處提供完整的 render 返回)
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>預班管理</h3></div>
                <div class="card shadow-sm mb-4">
                    <div class="card-body d-flex align-items-center gap-2">
                        <label>單位：</label><select id="unit-select" class="form-select w-auto"><option value="">載入中...</option></select>
                        <button id="btn-add" class="btn btn-primary">新增預班表</button>
                    </div>
                </div>
                <div class="card shadow">
                    <div class="card-body p-0">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light"><tr><th>月份</th><th>區間</th><th>人數</th><th>狀態</th><th>操作</th></tr></thead>
                            <tbody id="table-body"></tbody>
                        </table>
                    </div>
                </div>
                
                <div id="shift-context-menu" class="list-group shadow" style="position:fixed; z-index:9999; display:none; width:120px;">
                    ${Object.entries(this.shiftTypes).filter(([k])=>k!=='M_OFF').map(([key, cfg]) => 
                        `<button class="list-group-item list-group-item-action" onclick="window.routerPage.applyShiftFromMenu('${key}')">${cfg.label}</button>`
                    ).join('')}
                    <button class="list-group-item list-group-item-action" onclick="window.routerPage.applyShiftFromMenu(null)">清除</button>
                </div>
                
                <div class="modal fade" id="review-modal" tabindex="-1"><div class="modal-dialog modal-fullscreen"><div class="modal-content"><div class="modal-header"><h5 id="review-modal-title">審核</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body p-0"><div class="table-responsive flex-grow-1"><table class="table table-bordered table-sm text-center table-hover mb-0" id="review-table"><thead class="table-light sticky-top" id="review-thead"></thead><tbody id="review-tbody"></tbody><tfoot class="table-light sticky-bottom" id="review-tfoot"></tfoot></table></div></div><div class="modal-footer"><button class="btn btn-primary" id="btn-save-review">儲存</button></div></div></div></div>

                <div class="modal fade" id="pre-modal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header bg-light"><h5 class="modal-title fw-bold" id="modal-title">新增預班表</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="pre-form-content"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="btn-save" class="btn btn-primary">儲存</button></div></div></div></div>
            </div>
        `;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        window.routerPage = this;

        const unitSelect = document.getElementById('unit-select');
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let units = [];
        if (isAdmin) units = await UnitService.getAllUnits();
        else units = await UnitService.getUnitsByManager(user.uid);
        
        unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        
        unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
        document.getElementById('btn-add').addEventListener('click', () => {
             document.getElementById('pre-form-content').innerHTML = this.getPreFormHtml();
             this.openModal(null);
        });
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
        
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('shift-context-menu');
            if(menu && !e.target.closest('#shift-context-menu')) menu.style.display = 'none';
        });

        if(unitSelect.value) this.loadList(unitSelect.value);
    }
    
    // ... 其他方法保持不變 (getPreFormHtml, loadList, openModal, renderGroupInputs 等)
    // 請複製上一版 PreScheduleManagePage.js 中的所有輔助方法
    getPreFormHtml() { return `... (完整 HTML) ...`; } // 請貼上
    async loadList(uid) { /*...*/ }
    async openReview(id) { /*...*/ }
    renderReviewBody(sch, days) { /*...*/ }
    updateFooterStats(sch, days) { /*...*/ }
    async saveReview() { /*...*/ }
    async openModal(idx) { /*...*/ }
    renderGroupInputs(g,v) { /*...*/ }
    renderStaffList(g) { /*...*/ }
    async savePreSchedule() { /*...*/ }
    async deletePreSchedule(id) { /*...*/ }
    applyShiftFromMenu(type) { /*...*/ }
    handleCellClick(e,u,d) { /*...*/ }
    handleCellRightClick(e,u,d) { /*...*/ }
    getCellStyle(v) { /*...*/ }
    getCellText(v) { /*...*/ }
    updateCellUI(u,d,v) { /*...*/ }
}
