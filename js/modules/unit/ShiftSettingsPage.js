import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
        this.currentShifts = [];
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        let unitOptions = '';

        if (isSystemAdmin) {
            unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            // 單位管理者：鎖定自己
            const myUnit = units.find(u => u.unitId === user.unitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
                this.currentUnitId = myUnit.unitId; // Fix 7: 預先設定 ID
            }
        }

        // ... (HTML 與之前相同，略) ...
        return `
            <div class="container">
                <h2>班別設定</h2>
                <div class="toolbar mb-3">
                    <label>單位：</label>
                    <select id="shift-settings-unit" style="padding:5px;" ${!isSystemAdmin?'disabled':''}>
                        ${isSystemAdmin ? '<option value="">請選擇...</option>' : ''}
                        ${unitOptions}
                    </select>
                </div>
                <div id="shifts-container" style="display:none;">
                    <div id="shifts-content">載入中...</div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('shift-settings-unit');
        
        // 綁定變更
        unitSelect.addEventListener('change', (e) => {
            this.currentUnitId = e.target.value;
            this.loadShifts();
        });

        // Fix 7: 若已有單位 ID (管理者)，自動觸發載入
        if (this.currentUnitId) {
            this.loadShifts();
        }
        
        // ... 其他邏輯 ...
    }

    async loadShifts() {
        if(!this.currentUnitId) return;
        const unit = await UnitService.getUnitById(this.currentUnitId);
        this.currentShifts = unit?.settings?.shifts || [];
        this.renderTable();
        document.getElementById('shifts-container').style.display = 'block';
    }

    renderTable() {
        const container = document.getElementById('shifts-content');
        // ... 渲染表格 HTML (同前版) ...
        container.innerHTML = `
            <table class="table table-bordered">
                <thead><tr><th>代號</th><th>名稱</th><th>時間</th><th>顏色</th></tr></thead>
                <tbody>
                    ${this.currentShifts.map(s => `<tr><td>${s.code}</td><td>${s.name}</td><td>${s.startTime}-${s.endTime}</td><td style="background:${s.color}"></td></tr>`).join('')}
                </tbody>
            </table>
            `;
    }
}
