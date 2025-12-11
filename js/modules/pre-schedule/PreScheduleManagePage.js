import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.targetUnitId = null;
        this.preSchedules = [];
        this.unitData = null;
        this.shiftTypes = {
            'OFF': { label: 'OFF', color: '#dc3545', bg: '#dc3545', text: 'white' },
            'D':   { label: 'D',   color: '#0d6efd', bg: '#0d6efd', text: 'white' },
            'E':   { label: 'E',   color: '#ffc107', bg: '#ffc107', text: 'black' },
            'N':   { label: 'N',   color: '#212529', bg: '#212529', text: 'white' },
            'M_OFF': { label: 'OFF', color: '#6f42c1', bg: '#6f42c1', text: 'white' }
        };
        // Modals
        this.modal = null;
        this.reviewModal = null;
    }

    async render() {
        // ... (Base Layout + Modals - 使用完整 HTML) ...
        const user = authService.getProfile();
        let unitOptions = '<option value="">載入中...</option>';
        // 省略 Option 生成邏輯 (同前)

        return `
            <div class="container-fluid mt-4">
                <div class="mb-3"><h3>預班管理</h3></div>
                <div class="card shadow-sm mb-4">
                    <div class="card-body d-flex align-items-center gap-2">
                        <label>單位：</label><select id="unit-select" class="form-select w-auto"></select>
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
                    <button class="list-group-item list-group-item-action" onclick="window.routerPage.applyShift(null)">清除</button>
                </div>
                
                <div class="modal fade" id="review-modal" tabindex="-1">
                    <div class="modal-dialog modal-fullscreen">
                        <div class="modal-content">
                            <div class="modal-header"><h5 id="review-modal-title">審核</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body p-0"><div id="review-container"></div></div>
                            <div class="modal-footer"><button class="btn btn-primary" id="btn-save-review">儲存</button></div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="pre-modal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header"><h5 id="modal-title">設定</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="pre-form-content"></div></div><div class="modal-footer"><button class="btn btn-primary" id="btn-save">儲存</button></div></div></div></div>
            </div>
        `;
    }

    async afterRender() {
        this.reviewModal = new bootstrap.Modal(document.getElementById('review-modal'));
        this.modal = new bootstrap.Modal(document.getElementById('pre-modal'));
        window.routerPage = this;

        // ✅ 修復：增加檢查，避免 null 錯誤
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('shift-context-menu');
            if(menu && !e.target.closest('#shift-context-menu')) {
                menu.style.display = 'none';
            }
        });

        // 載入單位與列表
        const unitSelect = document.getElementById('unit-select');
        const user = authService.getProfile();
        // ... (填入 options)
        const units = await UnitService.getAllUnits(); // 簡化
        unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        
        unitSelect.addEventListener('change', () => this.loadList(unitSelect.value));
        if(unitSelect.value) this.loadList(unitSelect.value);

        document.getElementById('btn-add').addEventListener('click', () => this.openModal(null));
        document.getElementById('btn-save').addEventListener('click', () => this.savePreSchedule());
        document.getElementById('btn-save-review').addEventListener('click', () => this.saveReview());
    }

    async loadList(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        const tbody = document.getElementById('table-body');
        const list = await PreScheduleService.getPreSchedulesList(uid);
        this.preSchedules = list;

        const now = new Date().toISOString().split('T')[0];

        tbody.innerHTML = list.map((p, idx) => {
            const open = p.settings?.openDate || '';
            const close = p.settings?.closeDate || '';
            
            // ✅ 狀態判斷邏輯
            let statusBadge = '<span class="badge bg-warning text-dark">未開放</span>';
            if (now >= open && now <= close) {
                statusBadge = '<span class="badge bg-success">開放中</span>';
            } else if (now > close) {
                statusBadge = '<span class="badge bg-secondary">已關閉</span>';
            }

            return `
                <tr>
                    <td>${p.year}-${String(p.month).padStart(2,'0')}</td>
                    <td><small>${open} ~ ${close}</small></td>
                    <td>${p.staffIds?.length || 0}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="window.routerPage.openReview('${p.id}')">審核</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.routerPage.openModal(${idx})">設定</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.routerPage.deletePreSchedule('${p.id}')">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ... (OpenReview, OpenModal, Save 等邏輯保持不變，請從上一版複製) ...
    async openReview(id) { /*...*/ this.reviewModal.show(); }
    async openModal(idx) { /*...*/ this.modal.show(); }
    async savePreSchedule() { /*...*/ }
    async saveReview() { /*...*/ }
    async deletePreSchedule(id) {
        if(confirm("確定刪除？")) {
            await PreScheduleService.deletePreSchedule(id);
            this.loadList(this.targetUnitId);
        }
    }
}
