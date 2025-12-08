import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class RuleSettings {
    constructor() {
        this.currentUser = null;
        this.targetUnitId = null; // 當前正在編輯的 Unit ID
        this.unitsList = []; // 供管理員選擇
    }

    async render() {
        this.currentUser = authService.getProfile();
        
        // 判斷是否為 Admin，若是則顯示下拉選單
        const isAdmin = this.currentUser.role === 'system_admin';
        let headerControl = '';

        if (isAdmin) {
            // 稍後在 afterRender 填入選項
            headerControl = `
                <select id="admin-unit-select" class="form-select form-select-sm" style="width: auto; display: inline-block;">
                    <option value="">載入單位列表...</option>
                </select>
            `;
        } else {
            // 單位主管：顯示純文字
            headerControl = `<span class="badge bg-primary fs-6" id="unit-name-display">載入中...</span>`;
        }

        return `
            <div class="container-fluid mt-4">
                <div class="d-flex align-items-center justify-content-between mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-ruler-combined"></i> 排班規則設定</h2>
                    <div class="d-flex align-items-center gap-2">
                        <label class="mb-0 fw-bold">目前設定單位：</label>
                        ${headerControl}
                    </div>
                </div>

                <div class="row">
                    <div class="col-lg-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3">
                                <h6 class="m-0 font-weight-bold text-primary">基本限制</h6>
                            </div>
                            <div class="card-body">
                                <form id="rules-form">
                                    <div class="mb-3">
                                        <label class="form-label">每週最少休假天數</label>
                                        <input type="number" id="min-off-days" class="form-control" value="2">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">連續上班上限 (天)</label>
                                        <input type="number" id="max-consecutive" class="form-control" value="6">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">夜班後必須休息 (小時)</label>
                                        <input type="number" id="rest-after-night" class="form-control" value="24">
                                    </div>
                                    <hr>
                                    <div class="form-check form-switch mb-3">
                                        <input class="form-check-input" type="checkbox" id="allow-n-to-d">
                                        <label class="form-check-label" for="allow-n-to-d">允許 大夜(N) 接 白班(D) (通常禁止)</label>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="card shadow mb-4">
                            <div class="card-header py-3">
                                <h6 class="m-0 font-weight-bold text-success">每日最低人力需求 (Min Staff)</h6>
                            </div>
                            <div class="card-body">
                                <form id="staff-req-form">
                                    <div class="row g-3">
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">白班 (D)</label>
                                            <input type="number" id="min-staff-d" class="form-control" value="5">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">小夜 (E)</label>
                                            <input type="number" id="min-staff-e" class="form-control" value="3">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">大夜 (N)</label>
                                            <input type="number" id="min-staff-n" class="form-control" value="2">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label fw-bold">組長/行政 (HN)</label>
                                            <input type="number" id="min-staff-hn" class="form-control" value="1">
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                <button id="btn-save-all" class="btn btn-primary btn-lg shadow">
                    <i class="fas fa-save"></i> 儲存所有設定
                </button>
            </div>
        `;
    }

    async afterRender() {
        if (!this.currentUser) return;
        const isAdmin = this.currentUser.role === 'system_admin';

        // 1. 決定目標 Unit ID
        if (isAdmin) {
            // 載入所有單位供選擇
            this.unitsList = await UnitService.getAllUnits();
            const select = document.getElementById('admin-unit-select');
            select.innerHTML = this.unitsList.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            // 預設選第一個
            if (this.unitsList.length > 0) {
                this.targetUnitId = this.unitsList[0].unitId;
                select.value = this.targetUnitId;
            }

            // 綁定切換事件
            select.addEventListener('change', (e) => {
                this.targetUnitId = e.target.value;
                this.loadRules();
            });
        } else {
            // 單位主管直接鎖定
            this.targetUnitId = this.currentUser.unitId;
            // 顯示單位名稱
            const unit = await UnitService.getUnitById(this.targetUnitId);
            if (unit) document.getElementById('unit-name-display').textContent = unit.unitName;
        }

        // 2. 載入資料
        if (this.targetUnitId) {
            await this.loadRules();
        }

        // 3. 綁定儲存
        document.getElementById('btn-save-all').addEventListener('click', () => this.saveRules());
    }

    async loadRules() {
        if (!this.targetUnitId) return;

        // 顯示 Loading 狀態 (簡單做)
        document.getElementById('min-off-days').parentElement.classList.add('opacity-50');

        try {
            const unitData = await UnitService.getUnitById(this.targetUnitId);
            const rules = unitData.rules || {};
            const staffReq = unitData.staffRequirements || {};

            // 填入基本規則
            document.getElementById('min-off-days').value = rules.minOffDays || 2;
            document.getElementById('max-consecutive').value = rules.maxConsecutiveWork || 6;
            document.getElementById('rest-after-night').value = rules.restAfterNight || 24;
            document.getElementById('allow-n-to-d').checked = !!rules.allowNtoD;

            // 填入人力需求
            document.getElementById('min-staff-d').value = staffReq.D || 0;
            document.getElementById('min-staff-e').value = staffReq.E || 0;
            document.getElementById('min-staff-n').value = staffReq.N || 0;
            document.getElementById('min-staff-hn').value = staffReq.HN || 0;

        } catch (error) {
            console.error(error);
            alert("讀取規則失敗");
        } finally {
            document.getElementById('min-off-days').parentElement.classList.remove('opacity-50');
        }
    }

    async saveRules() {
        if (!this.targetUnitId) {
            alert("未選擇單位");
            return;
        }

        const btn = document.getElementById('btn-save-all');
        btn.disabled = true;
        btn.innerHTML = '儲存中...';

        const rulesData = {
            minOffDays: parseInt(document.getElementById('min-off-days').value),
            maxConsecutiveWork: parseInt(document.getElementById('max-consecutive').value),
            restAfterNight: parseInt(document.getElementById('rest-after-night').value),
            allowNtoD: document.getElementById('allow-n-to-d').checked
        };

        const staffReqData = {
            D: parseInt(document.getElementById('min-staff-d').value),
            E: parseInt(document.getElementById('min-staff-e').value),
            N: parseInt(document.getElementById('min-staff-n').value),
            HN: parseInt(document.getElementById('min-staff-hn').value)
        };

        try {
            // ✅ 這裡使用 updateUnit 一次更新兩個欄位
            await UnitService.updateUnit(this.targetUnitId, {
                rules: rulesData,
                staffRequirements: staffReqData
            });

            alert("✅ 設定已儲存成功！");
        } catch (error) {
            console.error(error);
            alert("❌ 儲存失敗: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存所有設定';
        }
    }
}
