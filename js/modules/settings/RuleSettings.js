import { SheetsService } from "../../services/sheets/SheetsService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class RuleSettings {
    constructor() {
        // 預設結構改為 21 格
        this.currentRules = {
            // D, E, N 各自 0-6 (週日~週六)
            minStaff: { D: {}, E: {}, N: {} },
            constraints: { maxWorkDays: 6 } // 移除 noNtoD (勞基法)
        };
        this.userUnitId = null;
        this.unitName = '';
    }

    async render() {
        const user = authService.getProfile();
        if (user) {
            this.userUnitId = user.unitId;
            const unit = await UnitService.getUnitById(this.userUnitId);
            if (unit) this.unitName = unit.unitName;
        }

        if (!this.userUnitId) return `<div class="p-5 text-danger">無單位權限</div>`;

        // 載入設定
        const savedRules = await SheetsService.getLatestRules(this.userUnitId);
        if (savedRules) {
            // 合併設定
            this.currentRules = { ...this.currentRules, ...savedRules };
            // 確保 minStaff 結構存在
            if(!this.currentRules.minStaff.D) this.currentRules.minStaff = { D:{}, E:{}, N:{} };
        }

        return `
            <div class="container">
                <h2><i class="fas fa-cogs"></i> 排班規則設定</h2>
                <span class="badge bg-info text-dark mb-3">設定對象：${this.unitName}</span>
                
                <div class="card shadow-sm">
                    <div class="card-body">
                        <form id="rules-form">
                            <div class="alert alert-secondary border-left-warning">
                                <h6 class="fw-bold"><i class="fas fa-balance-scale"></i> 勞基法與系統強制規範 (不可修改)</h6>
                                <ul class="mb-0 small">
                                    <li>禁止大夜班 (N) 接白班 (D)</li>
                                    <li>禁止小夜班 (E) 接白班 (D)</li>
                                    <li>每七日應有一日之休息 (原則上)</li>
                                </ul>
                            </div>

                            <h5 class="text-primary fw-bold mt-4 mb-3 border-bottom pb-2">每日人力最低需求</h5>
                            <div class="table-responsive mb-4">
                                <table class="table table-bordered text-center table-sm align-middle">
                                    <thead class="table-light">
                                        <tr><th style="width:10%">班別</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th class="text-danger">六</th><th class="text-danger">日</th></tr>
                                    </thead>
                                    <tbody>
                                        ${this.renderRow('D', '白班')}
                                        ${this.renderRow('E', '小夜')}
                                        ${this.renderRow('N', '大夜')}
                                    </tbody>
                                </table>
                            </div>

                            <h5 class="text-primary fw-bold mt-4 mb-3 border-bottom pb-2">其他限制</h5>
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <label class="col-form-label">最大連續上班天數 (含加班)</label>
                                </div>
                                <div class="col-auto">
                                    <input type="number" id="maxConsecutiveDays" class="form-control" 
                                           value="${this.currentRules.constraints.maxWorkDays || 6}" style="width:100px;">
                                </div>
                            </div>

                            <div class="text-end mt-4 pt-3 border-top">
                                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> 儲存設定</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    renderRow(shift, label) {
        let html = `<tr><td class="fw-bold bg-light">${label}</td>`;
        // 1=Mon ... 6=Sat, 0=Sun
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            const val = this.currentRules.minStaff[shift]?.[d] || 0;
            html += `<td><input type="number" class="form-control form-control-sm text-center req-input" 
                       data-shift="${shift}" data-day="${d}" value="${val}" min="0"></td>`;
        });
        return html + '</tr>';
    }

    async afterRender() {
        document.getElementById('rules-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const minStaff = { D:{}, E:{}, N:{} };
            
            document.querySelectorAll('.req-input').forEach(input => {
                minStaff[input.dataset.shift][input.dataset.day] = parseInt(input.value) || 0;
            });

            const newRules = {
                minStaff: minStaff,
                constraints: {
                    maxWorkDays: parseInt(document.getElementById('maxConsecutiveDays').value) || 6,
                    // 隱含勞基法設定 (後端驗證用)
                    noNtoD: true,
                    noEtoD: true
                }
            };

            const res = await SheetsService.saveRules(newRules, this.userUnitId);
            if (res.success) alert('設定已儲存');
            else alert('儲存失敗');
        });
    }
}
