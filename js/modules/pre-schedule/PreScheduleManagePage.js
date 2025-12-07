import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

// ... (Class 定義與 constructor 保持不變) ...
export class PreScheduleManagePage {
    constructor() { /*...*/ this.currentUnitId=null; this.year=new Date().getFullYear(); this.month=new Date().getMonth()+2; if(this.month>12){this.month=1;this.year++} this.preScheduleData=null; this.creationStaffList=[]; this.unitMap={}; }

    // ... (render 方法保持不變) ...
    async render() {
        // ... (同上一版，請確保引用完整 render HTML) ...
        // 在 Manage View 的 container.innerHTML 下方加入歷史紀錄區塊
        const user = authService.getProfile();
        if (user && user.unitId) this.currentUnitId = user.unitId;
        const units = await UnitService.getAllUnits();
        units.forEach(u => this.unitMap[u.unitId] = u.unitName);
        
        // ... (Render HTML string) ...
        // 重點：在 Manage View 的下方，加入歷史紀錄的 container
        return `
            <div class="container-fluid">
                <div class="card shadow mb-4"><div class="card-body bg-light"><form id="filter-form" class="row g-3 align-items-end"><div class="col-md-3"><label class="form-label fw-bold">單位</label><select id="unit-select" class="form-select">${units.map(u=>`<option value="${u.unitId}" ${u.unitId===this.currentUnitId?'selected':''}>${u.unitName}</option>`).join('')}</select></div><div class="col-md-3"><label class="form-label fw-bold">預班月份</label><input type="month" id="month-picker" class="form-control" value="${this.year}-${String(this.month).padStart(2,'0')}"></div><div class="col-md-2"><button type="submit" class="btn btn-primary w-100">查詢</button></div></form></div></div>
                <div id="manage-content">...</div>
                
                <div class="card shadow mt-4">
                    <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-secondary">歷史預班紀錄</h6></div>
                    <div class="card-body"><table class="table table-sm text-center"><thead><tr><th>月份</th><th>狀態</th><th>提交人數</th><th>最後更新</th></tr></thead><tbody id="history-list"><tr><td colspan="4">載入中...</td></tr></tbody></table></div>
                </div>
                
                <div id="add-staff-modal" class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">加入參與人員</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">
                    <div class="input-group mb-3"><input type="text" id="modal-search-id" class="form-control" placeholder="員工 ID"><button class="btn btn-outline-primary" id="btn-modal-search">搜尋</button></div><div id="modal-search-result"></div>
                </div></div></div></div>
            </div>
        `;
    }

    async afterRender() {
        // ... (綁定事件) ...
        document.getElementById('filter-form').addEventListener('submit', async (e) => { e.preventDefault(); await this.loadData(); });
        this.addStaffModal = new bootstrap.Modal(document.getElementById('add-staff-modal'));
        document.getElementById('btn-modal-search').addEventListener('click', () => this.searchModalStaff());
        
        if(this.currentUnitId) { 
            await this.loadData(); 
            this.loadHistory(); // Fix 5: 載入歷史
        }
    }

    // Fix 5: 預班管理的人員增減
    async searchModalStaff() {
        const id = document.getElementById('modal-search-id').value.trim();
        const resDiv = document.getElementById('modal-search-result');
        const allStaff = await userService.getAllStaff();
        const found = allStaff.find(s => s.staffId === id);
        
        if (found) {
            // 檢查是否已在 preScheduleData.submissions
            if (this.preScheduleData && this.preScheduleData.submissions[found.id]) {
                resDiv.innerHTML = '<div class="text-danger mt-2">已在名單中</div>';
            } else {
                resDiv.innerHTML = `<div class="card mt-2"><div class="card-body p-2 d-flex justify-content-between"><span>${found.name} (${found.unitId})</span> <button class="btn btn-sm btn-success" id="btn-add-confirm">加入</button></div></div>`;
                document.getElementById('btn-add-confirm').onclick = async () => {
                    await PreScheduleService.addExternalStaff(this.currentUnitId, this.year, this.month, found);
                    alert('已加入');
                    this.addStaffModal.hide();
                    this.loadData();
                };
            }
        } else {
            resDiv.innerHTML = '<div class="text-muted">找不到</div>';
        }
    }

    // Fix 5: 歷史紀錄載入
    async loadHistory() {
        // 這裡需要 PreScheduleService 提供 getHistoryByUnit
        // 暫時模擬：只顯示前 3 個月
        const tbody = document.getElementById('history-list');
        tbody.innerHTML = '';
        for(let i=1; i<=3; i++) {
            let m = this.month - i;
            let y = this.year;
            if(m<=0){m+=12; y--}
            const data = await PreScheduleService.getPreSchedule(this.currentUnitId, y, m);
            if(data) {
                const count = Object.values(data.submissions||{}).filter(s=>s.submitted).length;
                tbody.innerHTML += `<tr><td>${y}-${m}</td><td><span class="badge bg-${data.status==='open'?'success':'secondary'}">${data.status}</span></td><td>${count}</td><td>${new Date(data.updatedAt.seconds*1000).toLocaleDateString()}</td></tr>`;
            }
        }
        if(tbody.innerHTML === '') tbody.innerHTML = '<tr><td colspan="4">無近期紀錄</td></tr>';
    }
    
    // ... (loadData, renderCreateView, renderManageView 同前版) ...
    // 請確保 renderManageView 的按鈕有正確綁定加入人員 Modal
}
