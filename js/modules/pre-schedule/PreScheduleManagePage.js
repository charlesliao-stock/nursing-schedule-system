import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.currentUnitId = null;
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; // 預設下個月
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        this.preScheduleData = null;
    }

    async render() {
        const user = authService.getProfile();
        if (user && user.unitId) {
            this.currentUnitId = user.unitId;
        }

        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}" ${u.unitId === this.currentUnitId ? 'selected' : ''}>${u.unitName}</option>`
        ).join('');

        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-clipboard-list"></i> 預班管理</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <form id="filter-form" class="row g-3 align-items-end">
                            <div class="col-md-3">
                                <label class="form-label fw-bold">單位</label>
                                <select id="unit-select" class="form-select">${unitOptions}</select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label fw-bold">預班月份</label>
                                <input type="month" id="month-picker" class="form-control" 
                                       value="${this.year}-${String(this.month).padStart(2,'0')}">
                            </div>
                            <div class="col-md-2">
                                <button type="submit" class="btn btn-primary w-100">
                                    <i class="fas fa-search"></i> 查詢
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="manage-content">
                    <div class="text-center p-5 text-muted">請選擇月份並查詢</div>
                </div>

                <div id="external-staff-modal" class="modal fade" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">加入支援人員 (跨單位)</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label>輸入員工 ID (Staff ID)</label>
                                    <div class="input-group">
                                        <input type="text" id="search-staff-id" class="form-control" placeholder="例如: N12345">
                                        <button class="btn btn-outline-secondary" id="btn-search-staff">搜尋</button>
                                    </div>
                                </div>
                                <div id="search-result" class="border rounded p-3 bg-light" style="display:none;">
                                    <strong>姓名：</strong> <span id="res-name"></span><br>
                                    <strong>單位：</strong> <span id="res-unit"></span><br>
                                    <button id="btn-add-external" class="btn btn-success btn-sm mt-2 w-100">加入此預班表</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('filter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.loadData();
        });

        // 搜尋外調人員
        const modalEl = document.getElementById('external-staff-modal');
        this.externalModal = new bootstrap.Modal(modalEl);
        
        document.getElementById('btn-search-staff').addEventListener('click', async (e) => {
            e.preventDefault();
            const staffId = document.getElementById('search-staff-id').value.trim();
            if(!staffId) return;
            
            // 這裡需要 UserService 提供 queryByStaffId，暫時用 getAllStaff filter 模擬
            // 實務上應新增 query 介面
            const allStaff = await userService.getAllStaff();
            const found = allStaff.find(s => s.staffId === staffId);
            
            const resDiv = document.getElementById('search-result');
            if (found) {
                resDiv.style.display = 'block';
                document.getElementById('res-name').textContent = found.name;
                document.getElementById('res-unit').textContent = found.unitId; // 可轉中文名稱
                
                // 綁定加入按鈕
                const addBtn = document.getElementById('btn-add-external');
                addBtn.onclick = async () => {
                    addBtn.disabled = true;
                    const res = await PreScheduleService.addExternalStaff(this.currentUnitId, this.year, this.month, found);
                    if(res.success) {
                        alert('已加入！');
                        this.externalModal.hide();
                        this.loadData(); // 重整列表
                    } else {
                        alert('加入失敗: ' + res.error);
                    }
                    addBtn.disabled = false;
                };
            } else {
                alert('找不到此員工 ID');
                resDiv.style.display = 'none';
            }
        });

        if (this.currentUnitId) {
            await this.loadData();
        }
    }

    async loadData() {
        const container = document.getElementById('manage-content');
        const unitSelect = document.getElementById('unit-select');
        const monthPicker = document.getElementById('month-picker');
        
        this.currentUnitId = unitSelect.value;
        const [y, m] = monthPicker.value.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p>載入中...</p></div>';

        try {
            this.preScheduleData = await PreScheduleService.getPreSchedule(this.currentUnitId, this.year, this.month);
            
            if (!this.preScheduleData) {
                this.renderCreateView(container);
            } else {
                this.renderManageView(container);
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger">載入失敗: ${error.message}</div>`;
        }
    }

    renderCreateView(container) {
        // 取得該單位總人數 (用以試算)
        // 這裡需要呼叫 UserService，為簡化先不顯示動態試算，留待 renderManageView
        container.innerHTML = `
            <div class="card shadow border-left-primary">
                <div class="card-body text-center p-5">
                    <h3>尚未建立 ${this.year}年${this.month}月 預班表</h3>
                    <div class="text-start mx-auto" style="max-width: 500px;">
                        <form id="create-form">
                            <div class="mb-3">
                                <label class="form-label">每人可預休天數</label>
                                <input type="number" id="init-maxOff" class="form-control" value="8">
                            </div>
                            <div class="row mb-3">
                                <label class="form-label">每班需求人數 (用於試算可休額度)</label>
                                <div class="col"><input type="number" id="init-req-d" class="form-control" placeholder="白班" value="5"></div>
                                <div class="col"><input type="number" id="init-req-e" class="form-control" placeholder="小夜" value="3"></div>
                                <div class="col"><input type="number" id="init-req-n" class="form-control" placeholder="大夜" value="2"></div>
                            </div>
                            
                            <div class="row mb-3">
                                <div class="col"><label>開放日期</label><input type="date" id="init-openDate" class="form-control"></div>
                                <div class="col"><label>截止日期</label><input type="date" id="init-closeDate" class="form-control"></div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100">建立預班表</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        // 設定預設日期
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('init-openDate').value = today;

        document.getElementById('create-form').addEventListener('submit', (e) => this.handleCreate(e));
    }

    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        
        // 每日可休人數試算
        const reqStaff = (parseInt(settings.minStaff?.D)||0) + (parseInt(settings.minStaff?.E)||0) + (parseInt(settings.minStaff?.N)||0);
        const dailyAvailableOff = totalStaff - reqStaff;

        let statusBadge = status === 'open' 
            ? '<span class="badge bg-success">開放中</span>' 
            : '<span class="badge bg-secondary">關閉/截止</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3 d-flex justify-content-between">
                            <h6 class="m-0 font-weight-bold text-primary">設定與狀態</h6>
                            ${statusBadge}
                        </div>
                        <div class="card-body">
                            <ul class="list-group list-group-flush mb-3">
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>總人數 / 提交數</span>
                                    <strong>${totalStaff} / ${submittedCount}</strong>
                                </li>
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>每班需求總計</span>
                                    <strong>${reqStaff} 人</strong>
                                </li>
                                <li class="list-group-item d-flex justify-content-between bg-light">
                                    <span>每日可休人數 (試算)</span>
                                    <strong class="text-success">約 ${dailyAvailableOff} 人</strong>
                                </li>
                            </ul>
                            <div class="d-grid gap-2">
                                ${status === 'open' 
                                    ? `<button class="btn btn-warning" onclick="window.updateStatus('closed')">停止收件</button>` 
                                    : `<button class="btn btn-success" onclick="window.updateStatus('open')">開放填寫</button>`
                                }
                                <button class="btn btn-outline-primary" onclick="this.parentElement.parentElement.querySelector('.modal').classList.add('show')">
                                    <i class="fas fa-user-plus"></i> 加入支援人力
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-lg-8">
                    <div class="card shadow">
                        <div class="card-header py-3 d-flex justify-content-between align-items-center">
                            <h6 class="m-0 font-weight-bold text-primary">人員名單</h6>
                            <button class="btn btn-sm btn-primary" onclick="document.getElementById('external-staff-modal').style.display='block'; new bootstrap.Modal(document.getElementById('external-staff-modal')).show();">
                                <i class="fas fa-plus"></i> 支援
                            </button>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead class="table-light">
                                        <tr>
                                            <th>姓名</th>
                                            <th>類型</th>
                                            <th>狀態</th>
                                            <th>預休</th>
                                            <th>備註</th>
                                        </tr>
                                    </thead>
                                    <tbody id="submission-tbody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.renderSubmissionList();
        window.updateStatus = (s) => this.handleStatusUpdate(s);
    }

    async renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        const submissions = this.preScheduleData.submissions;
        
        // 這裡直接用 submissions 的資料渲染，因為可能包含外調人員 (不在 getUnitStaff 裡)
        // 若要顯示詳細職級，可再做一次對照
        
        tbody.innerHTML = Object.entries(submissions).map(([id, sub]) => {
            const wishCount = Object.values(sub.wishes || {}).filter(w => w === 'OFF').length;
            const typeBadge = sub.isExternal ? '<span class="badge bg-warning text-dark">支援</span>' : '<span class="badge bg-light text-dark">本單位</span>';
            
            return `
                <tr>
                    <td>${sub.name}</td>
                    <td>${typeBadge}</td>
                    <td>${sub.submitted ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
                    <td>${wishCount}</td>
                    <td class="small text-muted text-truncate" style="max-width:150px;">${sub.notes || ''}</td>
                </tr>
            `;
        }).join('');
    }

    async handleCreate(e) {
        e.preventDefault();
        const settings = {
            maxOffDays: document.getElementById('init-maxOff').value,
            openDate: document.getElementById('init-openDate').value,
            closeDate: document.getElementById('init-closeDate').value,
            minStaff: {
                D: document.getElementById('init-req-d').value,
                E: document.getElementById('init-req-e').value,
                N: document.getElementById('init-req-n').value
            }
        };

        const staffList = await userService.getUnitStaff(this.currentUnitId);
        const result = await PreScheduleService.createPreSchedule(
            this.currentUnitId, this.year, this.month, settings, staffList
        );

        if (result.success) {
            alert('建立成功！');
            this.loadData();
        } else {
            alert('建立失敗: ' + result.error);
        }
    }

    async handleStatusUpdate(newStatus) {
        if (!confirm('確定變更狀態？')) return;
        const result = await PreScheduleService.updateStatus(this.currentUnitId, this.year, this.month, newStatus);
        if(result.success) this.loadData();
    }
}
