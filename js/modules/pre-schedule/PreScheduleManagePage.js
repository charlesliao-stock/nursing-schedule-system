import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        this.currentUnitId = null;
        // 預設為下個月
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1 + 1; 
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        this.preScheduleData = null;
        
        // 暫存建立時的人員名單
        this.creationStaffList = [];
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
                                            ${unitOptions}
                                        </select>
                                        <div id="modal-unit-staff-list" class="list-group" style="max-height: 200px; overflow-y: auto;"></div>
                                    </div>
                                    <div class="tab-pane fade" id="tab-search">
                                        <div class="input-group mb-3">
                                            <input type="text" id="modal-search-id" class="form-control" placeholder="員工 ID">
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
        document.getElementById('filter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.loadData();
        });

        // 初始化 Modal
        this.addStaffModal = new bootstrap.Modal(document.getElementById('add-staff-modal'));
        
        // 綁定 Modal 內的事件
        document.getElementById('modal-unit-select').addEventListener('change', (e) => this.loadModalUnitStaff(e.target.value));
        document.getElementById('btn-modal-search').addEventListener('click', () => this.searchModalStaff());

        if (this.currentUnitId) {
            await this.loadData();
        }
    }

    async loadData() {
        const container = document.getElementById('manage-content');
        this.currentUnitId = document.getElementById('unit-select').value;
        const [y, m] = document.getElementById('month-picker').value.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p>載入中...</p></div>';

        try {
            this.preScheduleData = await PreScheduleService.getPreSchedule(this.currentUnitId, this.year, this.month);
            
            if (!this.preScheduleData) {
                await this.renderCreateView(container);
            } else {
                this.renderManageView(container);
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger">載入失敗: ${error.message}</div>`;
        }
    }

    // --- 建立視圖 (核心修改) ---
    async renderCreateView(container) {
        // 1. 預設載入本單位人員
        this.creationStaffList = await userService.getUnitStaff(this.currentUnitId);

        // 2. 計算預設截止日 (上個月 15 號)
        // 假設預班月份是 M，通常是在 M-1 月進行作業，所以截止日設為 M-1 月的 15 號
        let prevYear = this.year;
        let prevMonth = this.month - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }
        const defaultCloseDate = `${prevYear}-${String(prevMonth).padStart(2,'0')}-15`;
        const today = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="card shadow">
                <div class="card-header py-3 bg-primary text-white">
                    <h5 class="m-0"><i class="fas fa-plus-circle"></i> 建立預班表 (${this.year}-${this.month})</h5>
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
                                <div class="form-text text-muted">預設為前月 15 日</div>
                            </div>
                            <div class="col-md-3 d-flex align-items-center mt-4">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="init-saveDefault">
                                    <label class="form-check-label">設為預設值</label>
                                </div>
                            </div>
                        </div>

                        <h6 class="text-primary fw-bold mb-3 border-bottom pb-2 mt-4">
                            每日人力需求設定 (21格)
                            <small class="text-muted fw-normal ms-2" style="font-size:0.8rem;">請輸入各班別每日最低需求人數</small>
                        </h6>
                        <div class="table-responsive mb-4">
                            <table class="table table-bordered text-center table-sm align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width:10%">班別</th>
                                        <th>週一</th><th>週二</th><th>週三</th><th>週四</th><th>週五</th>
                                        <th class="text-danger">週六</th><th class="text-danger">週日</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.renderRequirementRow('D', '白班')}
                                    ${this.renderRequirementRow('E', '小夜')}
                                    ${this.renderRequirementRow('N', '大夜')}
                                </tbody>
                            </table>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3 mt-4 border-bottom pb-2">
                            <h6 class="text-primary fw-bold m-0">參與排班人員名單</h6>
                            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-open-add-staff">
                                <i class="fas fa-user-plus"></i> 增加人員
                            </button>
                        </div>
                        
                        <div class="bg-light p-3 rounded border mb-4" style="max-height: 300px; overflow-y: auto;">
                            <div id="staff-list-container" class="row g-2">
                                </div>
                        </div>

                        <hr>
                        <div class="text-end">
                            <button type="submit" class="btn btn-primary btn-lg px-5">
                                <i class="fas fa-check"></i> 建立預班表
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.renderStaffListDOM();
        
        // 綁定事件
        document.getElementById('create-form').addEventListener('submit', (e) => this.handleCreate(e));
        document.getElementById('btn-open-add-staff').addEventListener('click', () => this.addStaffModal.show());
    }

    // 產生 7 格輸入框 HTML
    renderRequirementRow(shiftCode, label) {
        let html = `<tr><td class="fw-bold bg-light">${label} (${shiftCode})</td>`;
        // 0=Sun, 1=Mon... 但我們表格是 Mon-Sun，所以順序是 1,2,3,4,5,6,0
        const days = [1, 2, 3, 4, 5, 6, 0];
        days.forEach(d => {
            html += `
                <td>
                    <input type="number" class="form-control form-control-sm text-center req-input" 
                           data-shift="${shiftCode}" data-day="${d}" value="0" min="0">
                </td>`;
        });
        html += `</tr>`;
        return html;
    }

    // 渲染人員名單 (Tag 樣式)
    renderStaffListDOM() {
        const container = document.getElementById('staff-list-container');
        if (!container) return;

        if (this.creationStaffList.length === 0) {
            container.innerHTML = '<div class="text-muted text-center w-100">無人員</div>';
            return;
        }

        container.innerHTML = this.creationStaffList.map((staff, index) => `
            <div class="col-auto">
                <div class="border bg-white rounded px-2 py-1 d-flex align-items-center shadow-sm">
                    <span class="me-2">${staff.name}</span>
                    <span class="badge bg-light text-dark me-2 border">${staff.unitId}</span>
                    <button type="button" class="btn-close" style="width: 0.5em; height: 0.5em;" 
                            onclick="window.removeStaffFromCreation(${index})"></button>
                </div>
            </div>
        `).join('');

        // 掛載移除函式
        window.removeStaffFromCreation = (idx) => {
            this.creationStaffList.splice(idx, 1);
            this.renderStaffListDOM();
        };
    }

    // --- Modal 邏輯 ---
    async loadModalUnitStaff(unitId) {
        const listDiv = document.getElementById('modal-unit-staff-list');
        listDiv.innerHTML = '載入中...';
        if (!unitId) { listDiv.innerHTML = ''; return; }

        const staff = await userService.getUnitStaff(unitId);
        listDiv.innerHTML = staff.map(s => {
            // 檢查是否已在名單中
            const exists = this.creationStaffList.some(existing => existing.id === s.id);
            if (exists) return ''; // 已存在則不顯示

            return `
                <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                        onclick="window.addStaffToCreation('${s.id}', '${s.name}', '${s.unitId}', '${s.level}')">
                    ${s.name} (${s.staffId || '-'})
                    <span class="badge bg-primary rounded-pill"><i class="fas fa-plus"></i></span>
                </button>
            `;
        }).join('');

        // 掛載加入函式
        window.addStaffToCreation = (id, name, unitId, level) => {
            this.creationStaffList.push({ id, name, unitId, level });
            this.renderStaffListDOM(); // 更新主畫面
            // 移除該選項
            this.loadModalUnitStaff(document.getElementById('modal-unit-select').value);
        };
    }

    async searchModalStaff() {
        const id = document.getElementById('modal-search-id').value.trim();
        const resDiv = document.getElementById('modal-search-result');
        if (!id) return;

        // 模擬搜尋 (實務上需後端 API 支援 queryByStaffId)
        const allStaff = await userService.getAllStaff();
        const found = allStaff.find(s => s.staffId === id);

        if (found) {
            const exists = this.creationStaffList.some(e => e.id === found.id);
            if (exists) {
                resDiv.innerHTML = '<div class="text-danger mt-2">該人員已在名單中</div>';
            } else {
                resDiv.innerHTML = `
                    <div class="card mt-2">
                        <div class="card-body p-2 d-flex justify-content-between align-items-center">
                            <div>${found.name} (${found.unitId})</div>
                            <button class="btn btn-sm btn-success" 
                                onclick="window.addStaffToCreation('${found.id}', '${found.name}', '${found.unitId}', '${found.level || ''}'); document.getElementById('modal-search-result').innerHTML='';">
                                加入
                            </button>
                        </div>
                    </div>`;
            }
        } else {
            resDiv.innerHTML = '<div class="text-muted mt-2">找不到此員工 ID</div>';
        }
    }

    // --- 提交建立 ---
    async handleCreate(e) {
        e.preventDefault();
        
        // 1. 收集 21 格需求
        const weeklyRequirements = { D: {}, E: {}, N: {} };
        document.querySelectorAll('.req-input').forEach(input => {
            const shift = input.dataset.shift; // D, E, N
            const day = input.dataset.day;     // 0-6
            const val = parseInt(input.value) || 0;
            weeklyRequirements[shift][day] = val;
        });

        const settings = {
            maxOffDays: document.getElementById('init-maxOff').value,
            openDate: document.getElementById('init-openDate').value,
            closeDate: document.getElementById('init-closeDate').value,
            // 儲存新的結構
            weeklyRequirements: weeklyRequirements
        };

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '建立中...';

        // 呼叫 Service (傳入目前編輯好的 creationStaffList)
        const result = await PreScheduleService.createPreSchedule(
            this.currentUnitId, this.year, this.month, settings, this.creationStaffList
        );

        if (result.success) {
            alert('建立成功！');
            this.loadData();
        } else {
            alert('建立失敗: ' + result.error);
            btn.disabled = false;
        }
    }

    // --- 管理視圖 (保持原樣或微調顯示) ---
    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        
        let statusBadge = status === 'open' 
            ? '<span class="badge bg-success">開放中</span>' 
            : '<span class="badge bg-secondary">關閉/截止</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3 d-flex justify-content-between">
                            <h6 class="m-0 font-weight-bold text-primary">狀態與設定</h6>
                            ${statusBadge}
                        </div>
                        <div class="card-body">
                            <ul class="list-group list-group-flush mb-3">
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>總人數 / 提交數</span>
                                    <strong>${totalStaff} / ${submittedCount}</strong>
                                </li>
                                <li class="list-group-item d-flex justify-content-between">
                                    <span>截止日期</span>
                                    <span class="text-danger">${settings.closeDate}</span>
                                </li>
                            </ul>
                            <div class="alert alert-light border small">
                                <strong>人力需求概況 (週一範例):</strong><br>
                                D: ${settings.weeklyRequirements?.D['1'] || 0}, 
                                E: ${settings.weeklyRequirements?.E['1'] || 0}, 
                                N: ${settings.weeklyRequirements?.N['1'] || 0}
                            </div>

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
                        <div class="card-header py-3">
                            <h6 class="m-0 font-weight-bold text-primary">參與人員名單</h6>
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

    // ... (renderSubmissionList, handleStatusUpdate 保持原樣) ...
    async renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        const submissions = this.preScheduleData.submissions;
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

    async handleStatusUpdate(newStatus) {
        if (!confirm('確定變更狀態？')) return;
        const result = await PreScheduleService.updateStatus(this.currentUnitId, this.year, this.month, newStatus);
        if(result.success) this.loadData();
    }
}
