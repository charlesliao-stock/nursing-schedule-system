import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { StaffListTemplate } from "./templates/StaffListTemplate.js"; // 引入 Template

export class StaffListPage {
    constructor() {
        this.staffList = [];
        this.displayList = [];
        this.unitMap = {};
        this.currentUser = null;
        this.editModal = null;
        this.sortConfig = { key: 'staffId', direction: 'asc' };
    }

    async render() {
        this.currentUser = authService.getProfile();
        const isAdmin = this.currentUser.role === 'system_admin' || this.currentUser.originalRole === 'system_admin';
        
        let unitOptionsHtml = '<option value="">載入中...</option>';
        let isOneUnit = false;

        try {
            let units = [];
            if (isAdmin) {
                units = await UnitService.getAllUnits();
            } else {
                units = await UnitService.getUnitsByManager(this.currentUser.uid);
                if(units.length === 0 && this.currentUser.unitId) {
                    const u = await UnitService.getUnitById(this.currentUser.unitId);
                    if(u) units.push(u);
                }
            }
            
            // 建立 unitMap 供顯示用
            units.forEach(u => this.unitMap[u.unitId] = u.unitName);
            
            unitOptionsHtml = (isAdmin ? `<option value="">全部單位</option>` : '') + 
                              units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            
            if (!isAdmin && units.length <= 1) isOneUnit = true;

        } catch (e) {
            console.error("單位載入失敗:", e);
            unitOptionsHtml = '<option value="">(無法載入單位)</option>';
        }

        // 組合 Template：主畫面 + Modal
        return StaffListTemplate.renderLayout(unitOptionsHtml, isAdmin, isOneUnit) + 
               StaffListTemplate.renderModalHtml(isAdmin);
    }

    async afterRender() {
        if(!this.currentUser) return;
        window.routerPage = this;

        this.editModal = new bootstrap.Modal(document.getElementById('staff-modal'));
        const unitSelect = document.getElementById('unit-filter');
        
        unitSelect.addEventListener('change', () => this.loadData());
        document.getElementById('btn-add-staff').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save').addEventListener('click', () => this.handleSave());
        document.getElementById('keyword-search').addEventListener('input', (e) => this.filterData(e.target.value));
        
        document.getElementById('edit-unit').addEventListener('change', (e) => this.updateGroupOptions(e.target.value));

        this.loadData(); 
    }

    async loadData() {
        const unitId = document.getElementById('unit-filter').value;
        const tbody = document.getElementById('staff-tbody');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5"><span class="spinner-border spinner-border-sm"></span> 載入資料中...</td></tr>';

        try {
            let list = [];
            const isAdmin = this.currentUser.role === 'system_admin' || this.currentUser.originalRole === 'system_admin';

            if (isAdmin && !unitId) {
                list = await userService.getAllUsers();
            } else {
                const target = unitId || this.currentUser.unitId;
                if (target) {
                    list = await userService.getUsersByUnit(target);
                } else {
                    list = [];
                }
            }
            
            this.staffList = list;
            this.applySortAndFilter();

        } catch(e) {
            console.error("Load Staff Error:", e);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">載入失敗: ${e.message}</td></tr>`;
        }
    }

    handleSort(key) {
        if (this.sortConfig.key === key) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.key = key;
            this.sortConfig.direction = 'asc';
        }
        this.updateHeaderIcons();
        this.applySortAndFilter();
    }

    updateHeaderIcons() {
        document.querySelectorAll('.sortable-th i').forEach(icon => {
            icon.className = 'fas fa-sort text-muted small opacity-25';
        });
        const activeTh = document.querySelector(`.sortable-th[onclick*="'${this.sortConfig.key}'"] i`);
        if (activeTh) {
            activeTh.className = this.sortConfig.direction === 'asc' ? 'fas fa-sort-up text-dark' : 'fas fa-sort-down text-dark';
            activeTh.classList.remove('opacity-25');
        }
    }

    applySortAndFilter() {
        const keyword = document.getElementById('keyword-search').value.toLowerCase();
        
        let filtered = this.staffList;
        if (keyword) {
            filtered = this.staffList.filter(u => 
                (u.name && u.name.toLowerCase().includes(keyword)) ||
                (u.staffId && u.staffId.includes(keyword)) ||
                (u.email && u.email.toLowerCase().includes(keyword))
            );
        }

        const key = this.sortConfig.key;
        const dir = this.sortConfig.direction === 'asc' ? 1 : -1;

        filtered.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            if (key === 'unitId') {
                valA = this.unitMap[valA] || valA;
                valB = this.unitMap[valB] || valB;
            }

            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            
            if (!isNaN(numA) && !isNaN(numB) && String(numA) === String(valA)) {
                return (numA - numB) * dir;
            }
            
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        this.displayList = filtered;
        // 使用 Template 渲染
        document.getElementById('staff-tbody').innerHTML = StaffListTemplate.renderRows(this.displayList, this.unitMap);
    }

    async updateGroupOptions(unitId, selectedGroup = '') {
        const groupSelect = document.getElementById('edit-group');
        groupSelect.innerHTML = '<option value="">载入中...</option>';
        if (!unitId) { groupSelect.innerHTML = '<option value="">請先選擇單位</option>'; return; }

        try {
            const unit = await UnitService.getUnitById(unitId);
            const groups = unit.groups || [];
            let html = '<option value="">(無組別)</option>';
            html += groups.map(g => `<option value="${g}">${g}</option>`).join('');
            groupSelect.innerHTML = html;
            if (selectedGroup) groupSelect.value = selectedGroup;
        } catch(e) { groupSelect.innerHTML = '<option value="">讀取失敗</option>'; }
    }

    async openModal(uid = null) {
        document.getElementById('staff-form').reset();
        
        // 同步單位選單
        const editUnit = document.getElementById('edit-unit');
        const filterUnit = document.getElementById('unit-filter');
        // 複製 Filter 的 Options 到 Edit，但如果 Filter 有 "全部單位" (value="") 要拿掉
        editUnit.innerHTML = filterUnit.innerHTML;
        if(editUnit.options.length > 0 && editUnit.options[0].value === "") {
            editUnit.remove(0); // 移除 "全部單位" 或 "請選擇"
        }

        if(uid) {
            document.getElementById('modal-title').textContent = "編輯人員";
            const u = this.staffList.find(x => x.uid === uid);
            document.getElementById('edit-uid').value = uid;
            document.getElementById('edit-unit').value = u.unitId;
            document.getElementById('edit-staffId').value = u.staffId;
            document.getElementById('edit-name').value = u.name;
            document.getElementById('edit-email').value = u.email;
            document.getElementById('edit-email').disabled = true;
            document.getElementById('edit-level').value = u.rank;
            document.getElementById('edit-hireDate').value = u.hireDate || '';

            await this.updateGroupOptions(u.unitId, u.group);

            document.getElementById('edit-isPregnant').checked = !!u.constraints?.isPregnant;
            document.getElementById('edit-canBatch').checked = !!u.constraints?.canBatch;
            document.getElementById('edit-maxConsecutive').value = u.constraints?.maxConsecutive || 6;
            document.getElementById('edit-maxConsecutiveNights').value = u.constraints?.maxConsecutiveNights || 4;
            
            document.getElementById('edit-is-manager').checked = u.role === 'unit_manager';
            document.getElementById('edit-is-scheduler').checked = u.role === 'unit_scheduler';
        } else {
            document.getElementById('modal-title').textContent = "新增人員";
            document.getElementById('edit-uid').value = "";
            document.getElementById('edit-email').disabled = false;
            
            // 預設選取當前 Filter 的單位
            const currentFilter = filterUnit.value;
            if (currentFilter) {
                editUnit.value = currentFilter;
                await this.updateGroupOptions(currentFilter);
            } else if (editUnit.options.length > 0) {
                await this.updateGroupOptions(editUnit.value);
            }
        }
        this.editModal.show();
    }

    async handleSave() {
        const uid = document.getElementById('edit-uid').value;
        const isManager = document.getElementById('edit-is-manager').checked;
        const isScheduler = document.getElementById('edit-is-scheduler').checked;
        
        let newRole = 'user';
        if(isManager) newRole = 'unit_manager';
        else if(isScheduler) newRole = 'unit_scheduler';

        const data = {
            name: document.getElementById('edit-name').value,
            unitId: document.getElementById('edit-unit').value,
            staffId: document.getElementById('edit-staffId').value,
            rank: document.getElementById('edit-level').value,
            group: document.getElementById('edit-group').value,
            hireDate: document.getElementById('edit-hireDate').value || null,
            role: newRole,
            permissions: { canManageUnit: isManager, canEditSchedule: isScheduler || isManager, canViewSchedule: true },
            constraints: {
                isPregnant: document.getElementById('edit-isPregnant').checked,
                canBatch: document.getElementById('edit-canBatch').checked,
                maxConsecutive: parseInt(document.getElementById('edit-maxConsecutive').value) || 6,
                maxConsecutiveNights: parseInt(document.getElementById('edit-maxConsecutiveNights').value) || 4
            }
        };
        
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            if(uid) {
                await userService.updateUser(uid, data);
                alert("✅ 修改成功");
            } else {
                const email = document.getElementById('edit-email').value;
                const res = await userService.createStaff({ ...data, email }, "123456");
                if(res.success) alert("✅ 新增成功 (預設密碼: 123456)");
                else alert("新增失敗: " + res.error);
            }
            this.editModal.hide();
            this.loadData();
        } catch(e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '儲存';
        }
    }

    filterData(keyword) { this.applySortAndFilter(); }
    async deleteStaff(uid) { if(confirm("確定刪除此人員？")) { await userService.deleteStaff(uid); this.loadData(); } }
}
