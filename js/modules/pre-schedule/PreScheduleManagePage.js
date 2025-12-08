import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class PreScheduleManagePage {
    constructor() {
        // 預設為下個月
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1;
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth = 1; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        this.currentUnitId = null;
        this.preScheduleData = null; // 存放載入的預班資料
        this.addStaffModal = null;   // Bootstrap Modal 實例
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-tasks"></i> 預班管理 (管理者)</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light py-2">
                        <form id="filter-form" class="row align-items-center g-2">
                            <div class="col-auto">
                                <label class="col-form-label fw-bold">管理月份：</label>
                            </div>
                            <div class="col-auto">
                                <input type="month" id="manage-month" class="form-control" 
                                       value="${this.year}-${String(this.month).padStart(2,'0')}">
                            </div>
                            <div class="col-auto">
                                <button type="submit" class="btn btn-primary"><i class="fas fa-sync-alt"></i> 載入</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="manage-content">
                    <div class="text-center p-5"><span class="spinner-border text-primary"></span> 載入中...</div>
                </div>

                <div class="modal fade" id="add-staff-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">新增支援人員 (External Staff)</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="input-group mb-3">
                                    <input type="text" id="search-keyword" class="form-control" placeholder="輸入姓名或 Email 搜尋...">
                                    <button class="btn btn-outline-secondary" type="button" id="btn-modal-search">搜尋</button>
                                </div>
                                <div id="search-results" class="list-group">
                                    </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const user = authService.getCurrentUser();
        if (!user) {
            window.location.hash = '/login';
            return;
        }

        // 1. 獲取 Unit ID
        const userData = await userService.getUserData(user.uid);
        if (!userData.unitId) {
            document.getElementById('manage-content').innerHTML = '<div class="alert alert-danger">您尚未綁定單位，無法管理預班。</div>';
            return;
        }
        this.currentUnitId = userData.unitId;

        // 2. 初始化 Modal
        const modalEl = document.getElementById('add-staff-modal');
        if (modalEl) {
            this.addStaffModal = new bootstrap.Modal(modalEl);
        }

        // 3. 綁定主要事件
        document.getElementById('filter-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const val = document.getElementById('manage-month').value;
            if (val) {
                const [y, m] = val.split('-');
                this.year = parseInt(y);
                this.month = parseInt(m);
                await this.loadData();
            }
        });

        document.getElementById('btn-modal-search').addEventListener('click', () => this.searchModalStaff());

        // 4. 初始載入
        await this.loadData();
    }

    async loadData() {
        const container = document.getElementById('manage-content');
        container.innerHTML = `<div class="text-center p-5"><span class="spinner-border text-primary"></span> 資料讀取中...</div>`;

        try {
            this.preScheduleData = await PreScheduleService.getPreSchedule(this.currentUnitId, this.year, this.month);

            if (!this.preScheduleData) {
                // 情境 A: 資料不存在 -> 顯示「建立預班表」畫面
                this.renderCreateView(container);
            } else {
                // 情境 B: 資料存在 -> 顯示「管理介面」
                this.renderManageView(container);
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger">載入失敗: ${error.message}</div>`;
        }
    }

    /**
     * 渲染 A: 建立新預班表視圖
     */
    renderCreateView(container) {
        // 計算預設日期
        const defaultOpen = new Date().toISOString().split('T')[0]; // 今天
        // 預設下個月5號截止
        let nextMonth = this.month + 1;
        let nextYear = this.year;
        if(nextMonth > 12) { nextMonth = 1; nextYear++; }
        const defaultClose = `${nextYear}-${String(nextMonth).padStart(2,'0')}-05`;

        container.innerHTML = `
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card shadow border-left-primary">
                        <div class="card-body text-center p-5">
                            <i class="fas fa-calendar-plus fa-4x text-gray-300 mb-3"></i>
                            <h3>${this.year} 年 ${this.month} 月 預班表尚未建立</h3>
                            <p class="text-muted mb-4">建立後，單位同仁即可開始填寫休假需求。</p>
                            
                            <div class="text-start bg-light p-4 rounded mb-3">
                                <h6 class="fw-bold">初始化設定：</h6>
                                <div class="mb-2">
                                    <label class="small">每人可預休上限 (天)</label>
                                    <input type="number" id="init-maxOff" class="form-control" value="8">
                                </div>
                                <div class="row g-2">
                                    <div class="col">
                                        <label class="small">開放日期</label>
                                        <input type="date" id="init-openDate" class="form-control" value="${defaultOpen}">
                                    </div>
                                    <div class="col">
                                        <label class="small">截止日期</label>
                                        <input type="date" id="init-closeDate" class="form-control" value="${defaultClose}">
                                    </div>
                                </div>
                            </div>

                            <button id="btn-create" class="btn btn-primary btn-lg w-100 shadow">
                                <i class="fas fa-plus-circle"></i> 立即建立預班表
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-create').addEventListener('click', () => this.handleCreate());
    }

    async handleCreate() {
        if(!confirm(`確定要建立 ${this.year}-${this.month} 的預班表嗎？`)) return;

        const settings = {
            maxOffDays: parseInt(document.getElementById('init-maxOff').value) || 8,
            openDate: document.getElementById('init-openDate').value,
            closeDate: document.getElementById('init-closeDate').value
        };

        try {
            await PreScheduleService.createPreSchedule(this.currentUnitId, this.year, this.month, settings);
            alert("✅ 建立成功！");
            await this.loadData(); // 重新載入變成管理介面
        } catch (e) {
            alert("建立失敗: " + e.message);
        }
    }

    /**
     * 渲染 B: 管理既有預班表視圖
     */
    renderManageView(container) {
        const { status, settings, submissions } = this.preScheduleData;
        const totalStaff = Object.keys(submissions || {}).length;
        const submittedCount = Object.values(submissions || {}).filter(s => s.submitted).length;
        
        // 狀態 Badge
        const statusBadge = status === 'open' 
            ? '<span class="badge bg-success">開放填寫中</span>' 
            : '<span class="badge bg-secondary">已關閉 / 鎖定</span>';

        container.innerHTML = `
            <div class="row">
                <div class="col-lg-4 mb-4">
                    <div class="card shadow h-100">
                        <div class="card-header py-3 d-flex justify-content-between align-items-center">
                            <h6 class="m-0 font-weight-bold text-primary">設定與狀態</h6>
                            ${statusBadge}
                        </div>
                        <div class="card-body">
                            <h6 class="text-gray-800 fw-bold mb-3">參數設定</h6>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">每人可休天數</label>
                                <input type="number" id="setting-maxOff" class="form-control form-control-sm" value="${settings.maxOffDays}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">開放日期</label>
                                <input type="date" id="setting-openDate" class="form-control form-control-sm" value="${settings.openDate}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">截止日期</label>
                                <input type="date" id="setting-closeDate" class="form-control form-control-sm" value="${settings.closeDate}">
                            </div>
                            <button id="btn-update-settings" class="btn btn-sm btn-outline-primary w-100 mb-4">
                                <i class="fas fa-save"></i> 更新設定
                            </button>

                            <hr>

                            <h6 class="text-gray-800 fw-bold mb-3">流程控制</h6>
                            <ul class="list-group list-group-flush mb-3 small">
                                <li class="list-group-item d-flex justify-content-between"><span>提交進度</span><strong>${submittedCount} / ${totalStaff}</strong></li>
                            </ul>
                            
                            <div class="d-grid gap-2">
                                ${status === 'open' 
                                    ? `<button id="btn-close-status" class="btn btn-warning"><i class="fas fa-lock"></i> 停止收件 (關閉)</button>` 
                                    : `<button id="btn-open-status" class="btn btn-success"><i class="fas fa-lock-open"></i> 開放填寫</button>`
                                }
                                <button class="btn btn-primary mt-2" onclick="window.location.hash='/schedule/manual'">
                                    <i class="fas fa-calendar-alt"></i> 前往正式排班
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-lg-8">
                    <div class="card shadow">
                        <div class="card-header py-3 d-flex justify-content-between align-items-center">
                            <h6 class="m-0 font-weight-bold text-primary">人員提交名單</h6>
                            <button class="btn btn-sm btn-primary shadow-sm" id="btn-open-add-modal">
                                <i class="fas fa-user-plus"></i> + 支援人員
                            </button>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-4">姓名</th>
                                            <th>類型</th>
                                            <th class="text-center">狀態</th>
                                            <th class="text-center">預休天數</th>
                                            <th>備註</th>
                                            <th class="text-end pe-4">操作</th>
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

        // 渲染列表
        this.renderSubmissionList();

        // 綁定事件
        document.getElementById('btn-update-settings').addEventListener('click', () => this.handleUpdateSettings());
        
        const btnClose = document.getElementById('btn-close-status');
        if(btnClose) btnClose.addEventListener('click', () => this.handleStatusUpdate('closed'));
        
        const btnOpen = document.getElementById('btn-open-status');
        if(btnOpen) btnOpen.addEventListener('click', () => this.handleStatusUpdate('open'));

        document.getElementById('btn-open-add-modal').addEventListener('click', () => {
             this.addStaffModal.show();
        });

        // 處理動態表格內的移除按鈕
        document.getElementById('submission-tbody').addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-staff');
            if (btn) {
                const staffId = btn.dataset.id;
                this.handleRemoveStaff(staffId);
            }
        });
    }

    renderSubmissionList() {
        const tbody = document.getElementById('submission-tbody');
        if (!this.preScheduleData.submissions) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">尚無人員資料</td></tr>';
            return;
        }

        const list = Object.entries(this.preScheduleData.submissions).map(([id, sub]) => {
            const submittedIcon = sub.submitted 
                ? '<span class="badge bg-success">已提交</span>' 
                : '<span class="badge bg-light text-secondary border">未提交</span>';
            
            const wishCount = Object.values(sub.wishes || {}).filter(w => w === 'OFF').length;

            return `
                <tr>
                    <td class="ps-4 fw-bold">${sub.name}</td>
                    <td>${sub.isExternal ? '<span class="badge bg-warning text-dark">支援</span>' : '<span class="text-muted small">本單位</span>'}</td>
                    <td class="text-center">${submittedIcon}</td>
                    <td class="text-center"><span class="badge bg-info text-white rounded-pill">${wishCount}</span></td>
                    <td class="small text-muted text-truncate" style="max-width: 150px;">${sub.notes || '-'}</td>
                    <td class="text-end pe-4">
                        ${sub.isExternal 
                            ? `<button class="btn btn-sm btn-outline-danger btn-remove-staff" data-id="${id}" title="移除"><i class="fas fa-trash-alt"></i></button>` 
                            : ''}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = list.join('');
    }

    async handleUpdateSettings() {
        const settings = {
            maxOffDays: parseInt(document.getElementById('setting-maxOff').value),
            openDate: document.getElementById('setting-openDate').value,
            closeDate: document.getElementById('setting-closeDate').value
        };
        try {
            const res = await PreScheduleService.updateSettings(this.currentUnitId, this.year, this.month, settings);
            if (res.success) alert('✅ 設定已更新');
            else throw new Error('更新失敗');
        } catch (e) {
            alert(e.message);
        }
    }

    async handleStatusUpdate(newStatus) {
        if (!confirm(`確定要將狀態改為 ${newStatus} 嗎？`)) return;
        try {
            await PreScheduleService.updateSettings(this.currentUnitId, this.year, this.month, { status: newStatus }); 
            alert('狀態已更新');
            this.loadData();
        } catch (e) {
            console.error(e);
            alert("更新狀態失敗");
        }
    }

    async searchModalStaff() {
        const keyword = document.getElementById('search-keyword').value;
        const resultDiv = document.getElementById('search-results');
        resultDiv.innerHTML = '<div class="text-center text-muted">搜尋中...</div>';

        try {
            // 呼叫 UserService 搜尋
            const users = await userService.searchUsers(keyword); 
            if (users.length === 0) {
                resultDiv.innerHTML = '<div class="text-center text-muted">無符合結果</div>';
                return;
            }

            resultDiv.innerHTML = users.map(u => `
                <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onclick="window.addStaffToPre('${u.uid}', '${u.name}')">
                    <div>
                        <strong>${u.name}</strong> <small class="text-muted">(${u.email})</small>
                        <br><small class="text-muted">${u.unitId || '無單位'}</small>
                    </div>
                    <span class="badge bg-primary rounded-pill">+</span>
                </button>
            `).join('');

            // 臨時綁定事件到 window 讓 onclick 生效 (因為 innerHTML 限制)
            window.addStaffToPre = (uid, name) => this.handleAddExternalStaff(uid, name);

        } catch (e) {
            resultDiv.innerHTML = `<div class="text-danger">搜尋錯誤: ${e.message}</div>`;
        }
    }

    async handleAddExternalStaff(uid, name) {
        if (!confirm(`確定要加入 ${name} 到本月預班名單嗎？`)) return;
        try {
            await PreScheduleService.addExternalStaff(this.currentUnitId, this.year, this.month, { uid, name });
            this.addStaffModal.hide();
            this.loadData(); // 重整列表
            alert(`✅ ${name} 已加入`);
        } catch (e) {
            alert("加入失敗: " + e.message);
        }
    }

    async handleRemoveStaff(staffId) {
        if (!confirm('確定移除此支援人員？')) return;
        try {
            await PreScheduleService.removeExternalStaff(this.currentUnitId, this.year, this.month, staffId);
            this.loadData();
        } catch (e) {
            alert("移除失敗: " + e.message);
        }
    }
}
