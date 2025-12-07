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
        // 1. 取得當前使用者的單位
        const user = authService.getProfile();
        if (user && user.unitId) {
            this.currentUnitId = user.unitId;
        }

        // 單位選單 (若為 admin 或有多單位權限可選，這裡簡化為讀取當前單位)
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
            </div>
        `;
    }

    async afterRender() {
        // 綁定查詢事件
        document.getElementById('filter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.loadData();
        });

        // 初始載入
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

    /**
     * 視圖：尚未建立，顯示建立表單
     */
    renderCreateView(container) {
        container.innerHTML = `
            <div class="card shadow border-left-primary">
                <div class="card-body text-center p-5">
                    <div class="mb-4">
                        <i class="fas fa-calendar-plus fa-4x text-gray-300"></i>
                    </div>
                    <h3>尚未建立 ${this.year}年${this.month}月 預班表</h3>
                    <p class="text-muted mb-4">建立後，同仁即可開始提交休假需求。</p>
                    
                    <div class="text-start mx-auto" style="max-width: 500px;">
                        <h5 class="border-bottom pb-2">初始化設定</h5>
                        <form id="create-form">
                            <div class="mb-3">
                                <label class="form-label">每人可預休天數 (含假日)</label>
                                <input type="number" id="init-maxOff" class="form-control" value="8">
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <label class="form-label">開放日期</label>
                                    <input type="date" id="init-openDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="col">
                                    <label class="form-label">截止日期</label>
                                    <input type="date" id="init-closeDate" class="form-control">
                                </div>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="init-canChooseShift">
                                <label class="form-check-label">允許同仁指定班別 (不只是畫 OFF)</label>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 btn-lg">
                                <i class="fas fa-plus-circle"></i> 建立預班表
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('create-form').addEventListener('submit', (e) => this.handleCreate(e));
    }

    /**
     * 視圖：已建立，顯示管理介面
     */
    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        const progress = totalStaff > 0 ? Math.round((submittedCount / totalStaff) * 100) : 0;

        // 狀態標籤
        let statusBadge = '';
        if (status === 'draft') statusBadge = '<span class="badge bg-secondary">草稿</span>';
        else if (status === 'open') statusBadge = '<span class="badge bg-success">開放填寫中</span>';
        else if (status === 'closed') statusBadge = '<span class="badge bg-danger">已截止</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3 d-flex justify-content-between align-items-center">
                            <h6 class="m-0 font-weight-bold text-primary">預班狀態</h6>
                            ${statusBadge}
                        </div>
                        <div class="card-body">
                            <h4 class="small font-weight-bold">提交進度 <span class="float-end">${submittedCount}/${totalStaff} 人</span></h4>
                            <div class="progress mb-4">
                                <div class="progress-bar bg-info" role="progressbar" style="width: ${progress}%"></div>
                            </div>

                            <ul class="list-group list-group-flush mb-4">
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>每人可休上限</span>
                                    <strong>${settings.maxOffDays} 天</strong>
                                </li>
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>開放日期</span>
                                    <span>${settings.openDate || '-'}</span>
                                </li>
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>截止日期</span>
                                    <span class="text-danger">${settings.closeDate || '-'}</span>
                                </li>
                            </ul>

                            <div class="d-grid gap-2">
                                ${status === 'open' 
                                    ? `<button class="btn btn-warning" onclick="window.updateStatus('closed')"><i class="fas fa-lock"></i> 停止收件 (截止)</button>` 
                                    : `<button class="btn btn-success" onclick="window.updateStatus('open')"><i class="fas fa-lock-open"></i> 開放填寫</button>`
                                }
                                <button class="btn btn-primary" onclick="window.location.hash='/schedule/manual'"><i class="fas fa-arrow-right"></i> 前往排班</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-lg-8">
                    <div class="card shadow">
                        <div class="card-header py-3">
                            <h6 class="m-0 font-weight-bold text-primary">人員提交狀況</h6>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead class="table-light">
                                        <tr>
                                            <th>姓名</th>
                                            <th>狀態</th>
                                            <th>預休天數</th>
                                            <th>最後更新</th>
                                            <th>備註</th>
                                        </tr>
                                    </thead>
                                    <tbody id="submission-tbody">
                                        </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.renderSubmissionList();
        
        // 把 updateStatus 掛載到 window 以便 onclick 呼叫 (或是改用 addEventListener 綁定)
        window.updateStatus = (status) => this.handleStatusUpdate(status);
    }

    async renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        const submissions = this.preScheduleData.submissions;
        
        // 取得所有人員資料以顯示姓名
        const staffList = await userService.getUnitStaff(this.currentUnitId);
        
        tbody.innerHTML = staffList.map(staff => {
            const sub = submissions[staff.id] || { submitted: false, wishes: {} };
            const wishCount = Object.values(sub.wishes).filter(w => w === 'OFF').length;
            const updatedTime = sub.updatedAt ? new Date(sub.updatedAt.seconds * 1000).toLocaleString() : '-';
            
            return `
                <tr>
                    <td>${staff.name} <span class="small text-muted">(${staff.level})</span></td>
                    <td>
                        ${sub.submitted 
                            ? '<span class="badge bg-success">已提交</span>' 
                            : '<span class="badge bg-light text-dark border">未提交</span>'}
                    </td>
                    <td>${wishCount}</td>
                    <td class="small">${updatedTime}</td>
                    <td class="small text-muted text-truncate" style="max-width: 150px;">${sub.notes || ''}</td>
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
            canChooseShift: document.getElementById('init-canChooseShift').checked
        };

        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.innerHTML = '建立中...';

        // 取得該單位目前所有員工，初始化名單
        const staffList = await userService.getUnitStaff(this.currentUnitId);

        const result = await PreScheduleService.createPreSchedule(
            this.currentUnitId, this.year, this.month, settings, staffList
        );

        if (result.success) {
            alert('建立成功！');
            this.loadData();
        } else {
            alert('建立失敗: ' + result.error);
            btn.disabled = false;
        }
    }

    async handleStatusUpdate(newStatus) {
        if (!confirm(`確定要將狀態變更為 ${newStatus} 嗎？`)) return;

        const result = await PreScheduleService.updateStatus(
            this.currentUnitId, this.year, this.month, newStatus
        );

        if (result.success) {
            this.loadData();
        } else {
            alert('更新失敗');
        }
    }
}
