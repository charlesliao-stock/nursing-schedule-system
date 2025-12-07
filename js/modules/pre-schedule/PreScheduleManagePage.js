import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

// ... (constructor, render 方法保持不變) ...
export class PreScheduleManagePage {
    // ... constructor ...
    // ... render ... 
    // 請確保 renderManageView 有「更新設定」的按鈕

    async afterRender() {
        // ... (綁定 filter, search modal) ...
        document.getElementById('filter-form').addEventListener('submit', async (e) => { e.preventDefault(); await this.loadData(); });
        this.addStaffModal = new bootstrap.Modal(document.getElementById('add-staff-modal'));
        document.getElementById('btn-modal-search').addEventListener('click', () => this.searchModalStaff());
        
        // 綁定更新設定按鈕 (Fix: 新增)
        window.updateSettings = async () => {
            const settings = {
                maxOffDays: document.getElementById('setting-maxOff').value,
                openDate: document.getElementById('setting-openDate').value,
                closeDate: document.getElementById('setting-closeDate').value
            };
            const res = await PreScheduleService.updateSettings(this.currentUnitId, this.year, this.month, settings);
            if(res.success) alert('設定已更新');
            else alert('更新失敗');
        };

        if(this.currentUnitId) { 
            await this.loadData(); 
            this.loadHistory(); 
        }
    }

    // renderCreateView 略...

    // Fix: renderManageView 加入可編輯的設定欄位
    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        const statusBadge = status === 'open' ? '<span class="badge bg-success">開放中</span>' : '<span class="badge bg-secondary">關閉</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow">
                        <div class="card-header py-3 d-flex justify-content-between"><h6 class="m-0 font-weight-bold text-primary">設定與狀態</h6>${statusBadge}</div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">每人可休天數</label>
                                <input type="number" id="setting-maxOff" class="form-control form-control-sm" value="${settings.maxOffDays}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">開放日期</label>
                                <input type="date" id="setting-openDate" class="form-control form-control-sm" value="${settings.openDate}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">截止日期</label>
                                <input type="date" id="setting-closeDate" class="form-control form-control-sm" value="${settings.closeDate}">
                            </div>
                            <button class="btn btn-sm btn-outline-primary w-100 mb-3" onclick="window.updateSettings()">更新設定</button>

                            <ul class="list-group list-group-flush mb-3">
                                <li class="list-group-item d-flex justify-content-between"><span>提交進度</span><strong>${submittedCount}/${totalStaff}</strong></li>
                            </ul>
                            <div class="d-grid gap-2">
                                ${status === 'open' 
                                    ? `<button class="btn btn-warning" onclick="window.updateStatus('closed')">停止收件</button>` 
                                    : `<button class="btn btn-success" onclick="window.updateStatus('open')">開放填寫</button>`
                                }
                                <button class="btn btn-primary" onclick="window.location.hash='/schedule/manual'">前往排班</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-8">
                    <div class="card shadow">
                        <div class="card-header py-3 d-flex justify-content-between">
                            <h6 class="m-0 font-weight-bold text-primary">人員名單</h6>
                            <button class="btn btn-sm btn-primary" onclick="new bootstrap.Modal(document.getElementById('add-staff-modal')).show()">+ 支援</button>
                        </div>
                        <div class="card-body"><div class="table-responsive"><table class="table table-hover"><thead class="table-light"><tr><th>姓名</th><th>類型</th><th>狀態</th><th>預休</th><th>操作</th></tr></thead><tbody id="submission-tbody"></tbody></table></div></div>
                    </div>
                </div>
            </div>
        `;
        this.renderSubmissionList();
        window.updateStatus = (s) => this.handleStatusUpdate(s);
        
        // Fix: 加入移除人員功能
        window.removeStaffFromPre = async (staffId) => {
            if(!confirm('確定移除此人員？')) return;
            await PreScheduleService.removeExternalStaff(this.currentUnitId, this.year, this.month, staffId);
            this.loadData();
        };
    }

    async renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        tbody.innerHTML = Object.entries(this.preScheduleData.submissions).map(([id, sub]) => `
            <tr>
                <td>${sub.name}</td>
                <td>${sub.isExternal?'<span class="badge bg-warning text-dark">支援</span>':'本單位'}</td>
                <td>${sub.submitted?'<i class="fas fa-check text-success"></i>':'-'}</td>
                <td>${Object.values(sub.wishes||{}).filter(w=>w==='OFF').length}</td>
                <td>
                    ${sub.isExternal ? `<button class="btn btn-sm btn-outline-danger" onclick="window.removeStaffFromPre('${id}')"><i class="fas fa-times"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    }
    
    // ... (其他方法同前版) ...
    async handleStatusUpdate(s) { /*...*/ }
    async searchModalStaff() { /*...*/ }
    async loadHistory() { /*...*/ }
}
