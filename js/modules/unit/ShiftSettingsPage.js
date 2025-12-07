import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js"; // 引入 Auth

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
        this.currentShifts = [];
        this.isEditing = false;
    }

    async render() {
        const user = authService.getProfile();
        const isSystemAdmin = user.role === 'system_admin';
        
        const units = await UnitService.getAllUnits();
        let unitOptions = '';

        if (isSystemAdmin) {
            unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } else {
            const myUnit = units.find(u => u.unitId === user.unitId);
            if (myUnit) {
                unitOptions = `<option value="${myUnit.unitId}" selected>${myUnit.unitName}</option>`;
                this.currentUnitId = myUnit.unitId; // 預設
            }
        }

        const hourOptions = Array.from({length: 24}, (_, i) => `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`).join('');
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container">
                <h2>班別設定 (Shift Settings)</h2>
                
                <div class="toolbar">
                    <label>選擇單位：</label>
                    <select id="shift-settings-unit" style="padding: 5px; font-size: 1rem;" ${!isSystemAdmin ? 'disabled' : ''}>
                        ${isSystemAdmin ? '<option value="">請選擇...</option>' : ''}
                        ${unitOptions}
                    </select>
                </div>

                <div id="shifts-container" style="display:none; margin-top: 20px;">
                    <h3>現有班別列表</h3>
                    <table class="shift-table" style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead><tr style="background:#f3f4f6"><th style="padding:10px">代號</th><th>名稱</th><th>時間</th><th>顏色</th><th>操作</th></tr></thead>
                        <tbody id="shifts-tbody"></tbody>
                    </table>
                    
                    <h3 id="form-title" style="margin-top:20px; border-top:1px solid #eee; padding-top:20px;">新增班別</h3>
                    <form id="shift-form" style="background:#f9f9f9; padding:20px; border-radius:8px; display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end;">
                        <input type="hidden" id="shift-index" value="-1">
                        <div style="flex:1"><label>代號</label><input type="text" id="shift-code" placeholder="如 D" required style="width:100%"></div>
                        <div style="flex:2"><label>名稱</label><input type="text" id="shift-name" placeholder="如 白班" required style="width:100%"></div>
                        <div style="flex:3; display:flex; gap:5px; align-items:center;">
                            <div><label>開始</label><div style="display:flex"><select id="start-hour">${hourOptions}</select>:<select id="start-min">${minOptions}</select></div></div>
                            <span>~</span>
                            <div><label>結束</label><div style="display:flex"><select id="end-hour">${hourOptions}</select>:<select id="end-min">${minOptions}</select></div></div>
                        </div>
                        <div style="flex:0 0 60px"><label>顏色</label><input type="color" id="shift-color" value="#3b82f6" style="width:100%; height:38px;"></div>
                        <div style="flex:100%; display:flex; gap:10px; margin-top:10px;">
                            <button type="submit" class="btn-primary" style="padding:8px 20px;"><i class="fas fa-save"></i> 儲存</button>
                            <button type="button" id="btn-cancel" class="btn-secondary" style="display:none; padding:8px 20px;">取消</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('shift-settings-unit');
        
        unitSelect.addEventListener('change', async (e) => {
            this.currentUnitId = e.target.value;
            this.loadShifts();
        });

        // 綁定其他事件 (loadShifts, renderTable, saveShift... 同前版)
        document.getElementById('shift-form').addEventListener('submit', async (e) => { e.preventDefault(); await this.saveShift(); });
        document.getElementById('btn-cancel').addEventListener('click', () => this.resetForm());
        window.handleEditShift = (idx) => this.loadShiftToForm(idx);
        window.handleDeleteShift = (idx) => this.deleteShift(idx);

        // 自動載入
        if (this.currentUnitId) {
            await this.loadShifts();
            document.getElementById('shifts-container').style.display = 'block';
        }
    }

    // ... (loadShifts, renderTable, saveShift, deleteShift, resetForm 保持不變) ...
    async loadShifts() {
        if(!this.currentUnitId) return;
        const unit = await UnitService.getUnitById(this.currentUnitId);
        this.currentShifts = unit?.settings?.shifts || [];
        this.renderTable();
        document.getElementById('shifts-container').style.display = 'block';
    }
    renderTable() {
        document.getElementById('shifts-tbody').innerHTML = this.currentShifts.map((s, idx) => `
            <tr style="border-bottom:1px solid #eee"><td style="padding:10px">${s.code}</td><td>${s.name}</td><td>${s.startTime}-${s.endTime}</td><td><span style="display:inline-block;width:20px;height:20px;background:${s.color}"></span></td><td><button class="btn-secondary" onclick="window.handleEditShift(${idx})">編輯</button> <button class="btn-secondary" style="color:red" onclick="window.handleDeleteShift(${idx})">刪除</button></td></tr>
        `).join('');
    }
    async saveShift() { /*...*/ }
    async deleteShift(idx) { /*...*/ }
    resetForm() { /*...*/ }
    loadShiftToForm(idx) { /*...*/ }
}
