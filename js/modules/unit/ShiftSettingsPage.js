import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { ShiftSettingsTemplate } from "./templates/ShiftSettingsTemplate.js"; // 引入 Template

export class ShiftSettingsPage {
    constructor() { this.shifts = []; this.targetUnitId = null; this.modal = null; }

    async render() {
        return ShiftSettingsTemplate.renderLayout() + ShiftSettingsTemplate.renderModal();
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('shift-modal'));
        const unitSelect = document.getElementById('unit-select');
        window.routerPage = this;

        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let availableUnits = [];
        if (isAdmin) {
            availableUnits = await UnitService.getAllUnits();
        } else {
            availableUnits = await UnitService.getUnitsByManager(user.uid);
            if(availableUnits.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) availableUnits.push(u);
            }
        }

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = '<option value="">無權限</option>';
            unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            if (availableUnits.length === 1) unitSelect.disabled = true;

            unitSelect.addEventListener('change', () => this.loadData(unitSelect.value));
            document.getElementById('btn-add').addEventListener('click', () => this.openModal());
            document.getElementById('btn-save').addEventListener('click', () => this.saveShift());
            this.loadData(availableUnits[0].unitId);
        }
    }

    async loadData(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        const tbody = document.getElementById('table-body');
        try {
            const unit = await UnitService.getUnitById(uid);
            if (!unit) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger">讀取錯誤</td></tr>'; return; }
            this.shifts = unit.settings?.shifts || [];
            // 使用 Template 渲染表格
            tbody.innerHTML = ShiftSettingsTemplate.renderRows(this.shifts);
        } catch (e) { console.error(e); }
    }

    openModal(idx = null) {
        document.getElementById('shift-form').reset();
        document.getElementById('edit-idx').value = idx !== null ? idx : -1;
        document.getElementById('modal-title').textContent = idx !== null ? "編輯班別" : "新增班別";
        if(idx !== null) {
            const s = this.shifts[idx];
            document.getElementById('shift-code').value = s.code;
            document.getElementById('shift-name').value = s.name;
            document.getElementById('shift-color').value = s.color;
            document.getElementById('start-time').value = s.startTime;
            document.getElementById('end-time').value = s.endTime;
            // 修正 4: 讀取時數
            document.getElementById('shift-hours').value = s.hours || 8;
        } else {
            document.getElementById('shift-hours').value = 8;
        }
        this.modal.show();
    }

    async saveShift() {
        const idx = parseInt(document.getElementById('edit-idx').value);
        const data = { 
            code: document.getElementById('shift-code').value, 
            name: document.getElementById('shift-name').value, 
            color: document.getElementById('shift-color').value, 
            startTime: document.getElementById('start-time').value, 
            endTime: document.getElementById('end-time').value,
            // 修正 4: 儲存時數
            hours: parseFloat(document.getElementById('shift-hours').value) || 8
        };
        if(idx === -1) this.shifts.push(data); else this.shifts[idx] = data;
        
        await UnitService.updateUnit(this.targetUnitId, { "settings.shifts": this.shifts });
        this.modal.hide(); 
        
        // 重新渲染表格
        document.getElementById('table-body').innerHTML = ShiftSettingsTemplate.renderRows(this.shifts);
    }
    
    async deleteShift(idx) { 
        if(confirm('刪除？')) { 
            this.shifts.splice(idx, 1); 
            await UnitService.updateUnit(this.targetUnitId, { "settings.shifts": this.shifts }); 
            document.getElementById('table-body').innerHTML = ShiftSettingsTemplate.renderRows(this.shifts);
        } 
    }
}
