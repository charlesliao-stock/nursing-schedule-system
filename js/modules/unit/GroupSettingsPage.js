import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { GroupSettingsTemplate } from "./templates/GroupSettingsTemplate.js"; // 引入 Template

export class GroupSettingsPage {
    constructor() { 
        this.groups = []; 
        this.staffList = []; 
        this.targetUnitId = null; 
        this.modal = null; 
    }

    async render() {
        return GroupSettingsTemplate.renderLayout() + GroupSettingsTemplate.renderModal();
    }

    async afterRender() {
        this.modal = new bootstrap.Modal(document.getElementById('group-modal'));
        const unitSelect = document.getElementById('unit-select');
        window.routerPage = this; 
        
        const user = authService.getProfile();
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';
        
        let units = [];
        if (isAdmin) {
            units = await UnitService.getAllUnits();
        } else {
            units = await UnitService.getUnitsByManager(user.uid);
            if(units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if(u) units.push(u);
            }
        }

        if (units.length === 0) { 
            unitSelect.innerHTML = '<option value="">無權限</option>'; unitSelect.disabled = true; 
        } else {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            if (units.length === 1) unitSelect.disabled = true;

            unitSelect.addEventListener('change', () => this.loadData(unitSelect.value));
            document.getElementById('btn-add').addEventListener('click', () => { document.getElementById('new-group-name').value = ''; this.modal.show(); });
            document.getElementById('btn-save-group').addEventListener('click', () => this.addGroup());
            document.getElementById('btn-save-assign').addEventListener('click', () => this.saveAssignments());
            this.loadData(units[0].unitId);
        }
    }

    async loadData(uid) {
        if(!uid) return;
        this.targetUnitId = uid;
        try {
            const [unit, staff] = await Promise.all([UnitService.getUnitById(uid), userService.getUsersByUnit(uid)]);
            if (!unit) { alert("無法讀取"); return; }
            this.groups = unit.groups || [];
            this.staffList = staff.sort((a, b) => (a.staffId || '').localeCompare(b.staffId || ''));
            
            // 使用 Template 渲染
            document.getElementById('group-list').innerHTML = GroupSettingsTemplate.renderGroupList(this.groups);
            document.getElementById('staff-tbody').innerHTML = GroupSettingsTemplate.renderStaffRows(this.staffList, this.groups);
        } catch (e) { console.error(e); }
    }

    async addGroup() {
        const name = document.getElementById('new-group-name').value.trim();
        if(!name) return;
        this.groups.push(name);
        await UnitService.updateUnit(this.targetUnitId, { groups: this.groups });
        this.modal.hide(); 
        this.loadData(this.targetUnitId); // Reload
    }

    async deleteGroup(idx) { 
        if(confirm('刪除組別？(該組別的人員將變為未分組)')) { 
            this.groups.splice(idx, 1); 
            await UnitService.updateUnit(this.targetUnitId, { groups: this.groups }); 
            this.loadData(this.targetUnitId);
        } 
    }
    
    async saveAssignments() {
        const updates = [];
        document.querySelectorAll('.group-select').forEach(sel => {
            const uid = sel.dataset.uid;
            const val = sel.value;
            const original = this.staffList.find(x => x.uid === uid);
            if((original.group || '') !== val) { 
                updates.push(userService.updateUser(uid, { group: val })); 
                original.group = val; 
            }
        });
        await Promise.all(updates);
        alert('✅ 儲存成功');
    }
}
