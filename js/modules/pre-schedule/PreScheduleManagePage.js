import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.currentUnitId = null;
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; 
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        this.preScheduleData = null;
        this.creationStaffList = [];
        this.unitMap = {}; // 用於將 ID 轉為名稱
    }

    async render() {
        // 1. 權限與單位初始化
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        
        if (user && user.unitId) {
            this.currentUnitId = user.unitId;
        }

        // 2. 準備單位選單 (管理者可選全部，其他人鎖定自己)
        const units = await UnitService.getAllUnits();
        // 建立 UnitMap 供後續顯示名稱使用
        units.forEach(u => this.unitMap[u.unitId] = u.unitName);

        let unitOptions = '';
        if (isSystemAdmin) {
            unitOptions = units.map(u => 
                `<option value="${u.unitId}" ${u.unitId === this.currentUnitId ? 'selected' : ''}>${u.unitName}</option>`
            ).join('');
        } else {
            // 非管理員，只能看到自己單位 (如果沒有單位則為空)
            const myUnit = units.find(u => u.unitId === this.currentUnitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
            }
        }

        // 格式化月份值 (YYYY-MM)
        const monthValue = `${this.year}-${String(this.month).padStart(2,'0')}`;

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
                                <select id="unit-select" class="form-select" ${!isSystemAdmin ? 'disabled' : ''}>
                                    ${unitOptions}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label fw-bold">預班月份</label>
                                <input type="month" id="month-picker" class="form-control" value="${monthValue}">
                            </div>
                            <div class="col-md-2">
                                <button type="submit" class="btn btn-primary w-100">
                                    <i class="fas fa-search"></i> 查詢狀態
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="manage-content">
                    <div class="text-center p-5 text-muted">請選擇月份並查詢</div>
                </div>

                <div id="add-staff-modal" class="modal fade" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">加入參與人員</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <ul class="nav nav-tabs mb-3" id="addStaffTab" role="tablist">
                                    <li class="nav-item">
                                        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-unit">依單位選擇</button>
                                    </li>
                                    <li class="nav-item">
                                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-search">搜尋 ID</button>
                                    </li>
                                </ul>
                                <div class="tab-content">
                                    <div class="tab-pane fade show active" id="tab-unit">
                                        <select id="modal-unit-select" class="form-select mb-3">
                                            <option value="">請選擇單位...</option>
                                            ${unitOptions.replace('disabled', '')} </select>
                                        <div id="modal-unit-staff-list" class="list-group" style="max-height: 200px; overflow-y: auto;"></div>
                                    </div>
                                    <div class="tab-pane fade" id="tab-search">
                                        <div class="input-group mb-3">
                                            <input type="text" id="modal-search-id" class="form-control" placeholder="員工 ID (如 N12345)">
                                            <button class="btn btn-outline-primary" id="btn-modal-search">搜尋</button>
                                        </div>
                                        <div id="modal-search-result"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // 綁定查詢
        document.getElementById('filter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            this.currentUnitId = document.getElementById('unit-select').value;
            // 確保月份有正確讀取
            const monthVal = document.getElementById('month-picker').value;
            if(monthVal) {
                const [y, m] = monthVal.split('-');
                this.year = parseInt(y);
                this.month = parseInt(m);
            }
            await this.loadData();
        });

        this.addStaffModal = new bootstrap.Modal(document.getElementById('add-staff-modal'));
        
        document.getElementById('modal-unit-select').addEventListener('change', (e) => this.loadModalUnitStaff(e.target.value));
        document.getElementById('btn-modal-search').addEventListener('click', () => this.searchModalStaff());

        // 如果單位已確定，自動載入
        if (this.currentUnitId) {
            await this.loadData();
        }
    }

    // ... (loadData 保持不變，略) ...
    async loadData() {
        const container = document.getElementById('manage-content');
        container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p>載入中...</p></div>';
        try {
            this.preScheduleData = await PreScheduleService.getPreSchedule(this.currentUnitId, this.year, this.month);
            if (!this.preScheduleData) await this.renderCreateView(container);
            else this.renderManageView(container);
        } catch (error) {
            container.innerHTML = `<div class="alert alert-danger">載入失敗: ${error.message}</div>`;
        }
    }

    // ... (renderCreateView, handleCreate 保持不變，除了 renderStaffListDOM) ...
    async renderCreateView(container) {
        this.creationStaffList = await userService.getUnitStaff(this.currentUnitId);
        
        let prevYear = this.year;
        let prevMonth = this.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        const defaultCloseDate = `${prevYear}-${String(prevMonth).padStart(2,'0')}-15`;
        const today = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="card shadow">
                <div class="card-header py-3 bg-primary text-white">
                    <h5 class="m-0">建立預班表 (${this.year}-${this.month})</h5>
                </div>
                <div class="card-body">
                    <form id="create-form">
                        <h6 class="text-primary fw-bold mb-3 border-bottom pb-2">基本參數</h6>
                        <div class="row mb-3">
                            <div class="col-md-3">
                                <label class="form-label">每人可預休天數</label>
                                <input type="number" id="init-maxOff" class="form-control" value="8">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">開放日期</label>
                                <input type="date" id="init-openDate" class="form-control" value="${today}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">截止日期</label>
                                <input type="date" id="init-closeDate" class="form-control" value="${defaultCloseDate}">
                            </div>
                        </div>

                        <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">每日人力需求 (21格)</h6>
                        <div class="table-responsive mb-4">
                            <table class="table table-bordered text-center table-sm align-middle">
                                <thead class="table-light">
                                    <tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr>
                                </thead>
                                <tbody>
                                    ${this.renderRequirementRow('D', '白班')}
                                    ${this.renderRequirementRow('E', '小夜')}
                                    ${this.renderRequirementRow('N', '大夜')}
                                </tbody>
                            </table>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3 mt-4 border-bottom pb-2">
                            <h6 class="text-primary fw-bold m-0">參與人員名單</h6>
                            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-open-add-staff">
                                <i class="fas fa-user-plus"></i> 增加人員
                            </button>
                        </div>
                        
                        <div class="bg-light p-3 rounded border mb-4" style="max-height: 300px; overflow-y: auto;">
                            <div id="staff-list-container" class="row g-2"></div>
                        </div>

                        <hr>
                        <div class="text-end">
                            <button type="submit" class="btn btn-primary btn-lg px-5">建立預班表</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.renderStaffListDOM();
        document.getElementById('create-form').addEventListener('submit', (e) => this.handleCreate(e));
        document.getElementById('btn-open-add-staff').addEventListener('click', () => this.addStaffModal.show());
    }

    renderRequirementRow(shiftCode, label) {
        let html = `<tr><td class="fw-bold bg-light">${label}</td>`;
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            html += `<td><input type="number" class="form-control form-control-sm text-center req-input" data-shift="${shiftCode}" data-day="${d}" value="0" min="0"></td>`;
        });
        return html + '</tr>';
    }

    // 【修正重點】優化人員標籤顯示
    renderStaffListDOM() {
        const container = document.getElementById('staff-list-container');
        if (!container) return;
        if (this.creationStaffList.length === 0) {
            container.innerHTML = '<div class="text-muted text-center w-100">無人員</div>';
            return;
        }

        container.innerHTML = this.creationStaffList.map((staff, index) => {
            // 嘗試將 unitId 轉為中文名稱
            const unitName = this.unitMap[staff.unitId] || staff.unitId || '未知';
            return `
            <div class="col-auto">
                <div class="border bg-white rounded px-2 py-1 d-flex align-items-center shadow-sm">
                    <span class="me-2 fw-bold">${staff.name}</span>
                    <span class="badge bg-light text-secondary border me-2">${staff.staffId || unitName}</span>
                    <button type="button" class="btn-close" style="width: 0.5em; height: 0.5em;" 
                            onclick="window.removeStaffFromCreation(${index})"></button>
                </div>
            </div>
        `}).join('');

        window.removeStaffFromCreation = (idx) => {
            this.creationStaffList.splice(idx, 1);
            this.renderStaffListDOM();
        };
    }

    // ... (handleCreate, renderManageView, renderSubmissionList, handleStatusUpdate 保持不變) ...
    // 為了節省篇幅，這部分邏輯與前一版相同，重點在於上方的 renderStaffListDOM 修正
    // 但為了完整性，以下提供 handleCreate
    async handleCreate(e) {
        e.preventDefault();
        const weeklyRequirements = { D: {}, E: {}, N: {} };
        document.querySelectorAll('.req-input').forEach(input => {
            weeklyRequirements[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
        });

        const settings = {
            maxOffDays: document.getElementById('init-maxOff').value,
            openDate: document.getElementById('init-openDate').value,
            closeDate: document.getElementById('init-closeDate').value,
            weeklyRequirements: weeklyRequirements
        };

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '建立中...';

        const result = await PreScheduleService.createPreSchedule(
            this.currentUnitId, this.year, this.month, settings, this.creationStaffList
        );

        if (result.success) { alert('建立成功！'); this.loadData(); } 
        else { alert('建立失敗: ' + result.error); btn.disabled = false; }
    }

    // renderManageView 略... (請沿用上一版，確保顯示正確)
    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        const statusBadge = status === 'open' ? '<span class="badge bg-success">開放中</span>' : '<span class="badge bg-secondary">關閉</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow">
                        <div class="card-header py-3 d-flex justify-content-between"><h6 class="m-0 font-weight-bold text-primary">設定</h6>${statusBadge}</div>
                        <div class="card-body">
                            <ul class="list-group list-group-flush mb-3">
                                <li class="list-group-item d-flex justify-content-between"><span>提交進度</span><strong>${submittedCount}/${totalStaff}</strong></li>
                                <li class="list-group-item d-flex justify-content-between"><span>截止</span><span class="text-danger">${settings.closeDate}</span></li>
                            </ul>
                            <div class="d-grid gap-2">
                                ${status === 'open' ? `<button class="btn btn-warning" onclick="window.updateStatus('closed')">停止收件</button>` : `<button class="btn btn-success" onclick="window.updateStatus('open')">開放填寫</button>`}
                                <button class="btn btn-primary" onclick="window.location.hash='/schedule/manual'">前往排班</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-8">
                    <div class="card shadow">
                        <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">人員名單</h6></div>
                        <div class="card-body"><div class="table-responsive"><table class="table table-hover"><thead class="table-light"><tr><th>姓名</th><th>類型</th><th>狀態</th><th>預休</th><th>備註</th></tr></thead><tbody id="submission-tbody"></tbody></table></div></div>
                    </div>
                </div>
            </div>
        `;
        this.renderSubmissionList();
        window.updateStatus = (s) => this.handleStatusUpdate(s);
    }

    async renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        tbody.innerHTML = Object.entries(this.preScheduleData.submissions).map(([id, sub]) => `
            <tr><td>${sub.name}</td><td>${sub.isExternal?'支援':'本單位'}</td><td>${sub.submitted?'<i class="fas fa-check text-success"></i>':'-'}</td><td>${Object.values(sub.wishes||{}).filter(w=>w==='OFF').length}</td><td class="small text-muted text-truncate" style="max-width:150px;">${sub.notes||''}</td></tr>
        `).join('');
    }

    async handleStatusUpdate(s) {
        if(confirm('確定變更？')) { await PreScheduleService.updateStatus(this.currentUnitId, this.year, this.month, s); this.loadData(); }
    }

    async loadModalUnitStaff(unitId) {
        const listDiv = document.getElementById('modal-unit-staff-list');
        listDiv.innerHTML = '載入中...';
        if (!unitId) { listDiv.innerHTML = ''; return; }
        const staff = await userService.getUnitStaff(unitId);
        listDiv.innerHTML = staff.map(s => {
            if (this.creationStaffList.some(e => e.id === s.id)) return '';
            return `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick="window.addStaffToCreation('${s.id}', '${s.name}', '${s.unitId}', '${s.level}')">${s.name} (${s.staffId||'-'}) <span class="badge bg-primary rounded-pill"><i class="fas fa-plus"></i></span></button>`;
        }).join('');
        window.addStaffToCreation = (id, name, unitId, level) => {
            this.creationStaffList.push({ id, name, unitId, level });
            this.renderStaffListDOM();
            this.loadModalUnitStaff(document.getElementById('modal-unit-select').value);
        };
    }

    async searchModalStaff() {
        // ... (同前一版)
        const id = document.getElementById('modal-search-id').value.trim();
        const resDiv = document.getElementById('modal-search-result');
        if (!id) return;
        const allStaff = await userService.getAllStaff();
        const found = allStaff.find(s => s.staffId === id);
        if (found) {
            const exists = this.creationStaffList.some(e => e.id === found.id);
            resDiv.innerHTML = exists ? '<div class="text-danger mt-2">已在名單中</div>' : `<div class="card mt-2"><div class="card-body p-2 d-flex justify-content-between align-items-center"><div>${found.name} (${found.unitId})</div><button class="btn btn-sm btn-success" onclick="window.addStaffToCreation('${found.id}', '${found.name}', '${found.unitId}', '${found.level||''}'); document.getElementById('modal-search-result').innerHTML='';">加入</button></div></div>`;
        } else { resDiv.innerHTML = '<div class="text-muted mt-2">找不到</div>'; }
    }
}
