import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = '';
        this.currentShifts = [];
        this.editingShiftId = null; // 追蹤正在編輯的 ID
    }

    async render() {
        const units = await unitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-clock"></i> 班別設定</h1>
                    <button id="back-btn" class="btn-secondary">返回儀表板</button>
                </div>

                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem;">
                    <div class="form-group">
                        <label>選擇單位：</label>
                        <select id="unit-select" style="padding: 0.5rem; width: 100%; max-width: 300px;">
                            <option value="">-- 請選擇單位 --</option>
                            ${unitOptions}
                        </select>
                    </div>

                    <hr style="margin: 2rem 0; border: 0; border-top: 1px solid #eee;">

                    <div id="settings-area" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3>班別列表</h3>
                            <button id="add-shift-btn" class="btn-primary"><i class="fas fa-plus"></i> 新增班別</button>
                        </div>

                        <div style="overflow-x: auto;">
                            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f8fafc; text-align: left;">
                                        <th style="padding:10px;">代號</th>
                                        <th style="padding:10px;">名稱</th>
                                        <th style="padding:10px;">時間</th>
                                        <th style="padding:10px;">工時</th>
                                        <th style="padding:10px;">顏色</th>
                                        <th style="padding:10px;">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="shifts-tbody"></tbody>
                            </table>
                        </div>

                        <div id="shift-form-card" style="margin-top: 2rem; background: #f9f9f9; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb; display: none;">
                            <h4 id="form-title" style="margin-top: 0;">新增班別</h4>
                            <form id="shift-form">
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                                    <div class="form-group">
                                        <label>代號</label>
                                        <input type="text" id="shift-code" placeholder="如: D" required style="width:100%; padding:8px;">
                                    </div>
                                    <div class="form-group">
                                        <label>名稱</label>
                                        <input type="text" id="shift-name" placeholder="如: 白班" required style="width:100%; padding:8px;">
                                    </div>
                                    <div class="form-group">
                                        <label>開始時間</label>
                                        <input type="time" id="shift-start" style="width:100%; padding:8px;">
                                    </div>
                                    <div class="form-group">
                                        <label>結束時間</label>
                                        <input type="time" id="shift-end" style="width:100%; padding:8px;">
                                    </div>
                                    <div class="form-group">
                                        <label>工時</label>
                                        <input type="number" id="shift-hours" step="0.5" style="width:100%; padding:8px;">
                                    </div>
                                    <div class="form-group">
                                        <label>顏色</label>
                                        <input type="color" id="shift-color" value="#3b82f6" style="width:100%; height:40px;">
                                    </div>
                                </div>
                                <div style="margin-top: 1rem; text-align: right;">
                                    <button type="button" id="cancel-shift-btn" class="btn-secondary">取消</button>
                                    <button type="submit" id="save-shift-btn" class="btn-primary">儲存</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        const elements = {
            unitSelect: document.getElementById('unit-select'),
            settingsArea: document.getElementById('settings-area'),
            shiftFormCard: document.getElementById('shift-form-card'),
            shiftForm: document.getElementById('shift-form'),
            formTitle: document.getElementById('form-title'),
            saveBtn: document.getElementById('save-shift-btn'),
            inputs: {
                code: document.getElementById('shift-code'),
                name: document.getElementById('shift-name'),
                start: document.getElementById('shift-start'),
                end: document.getElementById('shift-end'),
                hours: document.getElementById('shift-hours'),
                color: document.getElementById('shift-color')
            }
        };

        // 事件綁定
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));

        elements.unitSelect.addEventListener('change', async (e) => {
            if (e.target.value) {
                this.currentUnitId = e.target.value;
                await this.loadUnitShifts(this.currentUnitId);
                elements.settingsArea.style.display = 'block';
            } else {
                elements.settingsArea.style.display = 'none';
            }
        });

        document.getElementById('add-shift-btn').addEventListener('click', () => {
            this.openForm(elements, null); // 開啟新增模式
        });

        document.getElementById('cancel-shift-btn').addEventListener('click', () => {
            elements.shiftFormCard.style.display = 'none';
        });

        // 提交表單 (新增或更新)
        elements.shiftForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                id: this.editingShiftId || Date.now().toString(),
                code: elements.inputs.code.value.toUpperCase(),
                name: elements.inputs.name.value,
                startTime: elements.inputs.start.value,
                endTime: elements.inputs.end.value,
                hours: parseFloat(elements.inputs.hours.value) || 0,
                color: elements.inputs.color.value
            };

            if (this.editingShiftId) {
                // 更新模式
                const index = this.currentShifts.findIndex(s => s.id === this.editingShiftId);
                if (index !== -1) this.currentShifts[index] = formData;
            } else {
                // 新增模式
                this.currentShifts.push(formData);
            }

            const result = await unitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
            if (result.success) {
                alert('儲存成功！');
                this.renderShiftsTable();
                elements.shiftFormCard.style.display = 'none';
            } else {
                alert('儲存失敗：' + result.error);
            }
        });

        // 表格內的按鈕事件 (編輯/刪除)
        document.getElementById('shifts-tbody').addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;

            if (btn.classList.contains('delete-btn')) {
                if (confirm('確定刪除？')) {
                    this.currentShifts = this.currentShifts.filter(s => s.id !== id);
                    await unitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
                    this.renderShiftsTable();
                }
            } else if (btn.classList.contains('edit-btn')) {
                const shift = this.currentShifts.find(s => s.id === id);
                if (shift) this.openForm(elements, shift);
            }
        });
    }

    openForm(elements, shift) {
        elements.shiftFormCard.style.display = 'block';
        if (shift) {
            // 編輯模式
            this.editingShiftId = shift.id;
            elements.formTitle.textContent = "編輯班別";
            elements.saveBtn.textContent = "更新班別";
            elements.inputs.code.value = shift.code;
            elements.inputs.name.value = shift.name;
            elements.inputs.start.value = shift.startTime;
            elements.inputs.end.value = shift.endTime;
            elements.inputs.hours.value = shift.hours;
            elements.inputs.color.value = shift.color;
        } else {
            // 新增模式
            this.editingShiftId = null;
            elements.formTitle.textContent = "新增班別";
            elements.saveBtn.textContent = "儲存班別";
            elements.shiftForm.reset();
            elements.inputs.color.value = '#3b82f6';
        }
    }

    async loadUnitShifts(unitId) {
        const unit = await unitService.getUnitById(unitId);
        this.currentShifts = unit?.settings?.shifts || [];
        this.renderShiftsTable();
    }

    renderShiftsTable() {
        const tbody = document.getElementById('shifts-tbody');
        tbody.innerHTML = this.currentShifts.map(s => `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <span style="background:${s.color}; color:white; padding:2px 6px; border-radius:4px;">${s.code}</span>
                </td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${s.name}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${s.startTime}~${s.endTime}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${s.hours}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <div style="width:20px; height:20px; background:${s.color}; border-radius:50%;"></div>
                </td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <button class="edit-btn" data-id="${s.id}" style="color:blue; margin-right:8px; border:none; background:none; cursor:pointer;"><i class="fas fa-edit"></i> 編輯</button>
                    <button class="delete-btn" data-id="${s.id}" style="color:red; border:none; background:none; cursor:pointer;"><i class="fas fa-trash"></i> 刪除</button>
                </td>
            </tr>
        `).join('');
    }
}
