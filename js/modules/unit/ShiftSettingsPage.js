import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = '';
        this.currentShifts = [];
    }

    async render() {
        // 載入單位列表供選擇
        const units = await unitService.getAllUnits();
        const unitOptions = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');

        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-clock"></i> 班別設定 (Shift Settings)</h1>
                    <button id="back-btn" class="btn-secondary">返回儀表板</button>
                </div>

                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem;">
                    <div class="form-group">
                        <label>選擇要設定的單位：</label>
                        <select id="unit-select" style="padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 300px;">
                            <option value="">-- 請選擇單位 --</option>
                            ${unitOptions}
                        </select>
                    </div>

                    <hr style="margin: 2rem 0; border: 0; border-top: 1px solid #eee;">

                    <div id="settings-area" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3>現有班別列表</h3>
                            <button id="add-shift-btn" class="btn-primary" style="font-size: 0.9rem;">
                                <i class="fas fa-plus"></i> 新增班別
                            </button>
                        </div>

                        <div style="overflow-x: auto;">
                            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f8fafc; text-align: left;">
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">代號</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">名稱</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">時間</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">工時</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">顏色</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="shifts-tbody">
                                    </tbody>
                            </table>
                        </div>

                        <div id="shift-form-card" style="margin-top: 2rem; background: #f9f9f9; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb; display: none;">
                            <h4 style="margin-top: 0;">新增/編輯班別</h4>
                            <form id="shift-form">
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                                    <div class="form-group">
                                        <label>班別代號 (Code)</label>
                                        <input type="text" id="shift-code" placeholder="如: D, N, OFF" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                    <div class="form-group">
                                        <label>班別名稱</label>
                                        <input type="text" id="shift-name" placeholder="如: 白班, 休假" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                    <div class="form-group">
                                        <label>開始時間</label>
                                        <input type="time" id="shift-start" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                    <div class="form-group">
                                        <label>結束時間</label>
                                        <input type="time" id="shift-end" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                    <div class="form-group">
                                        <label>工時 (小時)</label>
                                        <input type="number" id="shift-hours" step="0.5" placeholder="8" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                    <div class="form-group">
                                        <label>顯示顏色</label>
                                        <input type="color" id="shift-color" value="#3b82f6" style="width: 100%; height: 40px; padding: 2px; border: 1px solid #ccc; border-radius: 4px;">
                                    </div>
                                </div>
                                <div style="margin-top: 1rem; text-align: right;">
                                    <button type="button" id="cancel-shift-btn" class="btn-secondary" style="margin-right: 10px;">取消</button>
                                    <button type="submit" class="btn-primary">儲存班別</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        const unitSelect = document.getElementById('unit-select');
        const settingsArea = document.getElementById('settings-area');
        const shiftsTbody = document.getElementById('shifts-tbody');
        const addShiftBtn = document.getElementById('add-shift-btn');
        const shiftFormCard = document.getElementById('shift-form-card');
        const shiftForm = document.getElementById('shift-form');
        const cancelShiftBtn = document.getElementById('cancel-shift-btn');

        // 返回按鈕
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));

        // 1. 選擇單位變更時
        unitSelect.addEventListener('change', async (e) => {
            const unitId = e.target.value;
            if (unitId) {
                this.currentUnitId = unitId;
                await this.loadUnitShifts(unitId);
                settingsArea.style.display = 'block';
            } else {
                settingsArea.style.display = 'none';
                this.currentUnitId = '';
            }
        });

        // 2. 顯示/隱藏表單
        addShiftBtn.addEventListener('click', () => {
            shiftForm.reset();
            shiftFormCard.style.display = 'block';
            // 預設顏色
            document.getElementById('shift-color').value = '#3b82f6'; 
        });

        cancelShiftBtn.addEventListener('click', () => {
            shiftFormCard.style.display = 'none';
        });

        // 3. 提交新班別
        shiftForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.currentUnitId) return;

            const newShift = {
                id: Date.now().toString(), // 簡單 ID
                code: document.getElementById('shift-code').value.toUpperCase(),
                name: document.getElementById('shift-name').value,
                startTime: document.getElementById('shift-start').value,
                endTime: document.getElementById('shift-end').value,
                hours: parseFloat(document.getElementById('shift-hours').value) || 0,
                color: document.getElementById('shift-color').value
            };

            // 加入現有陣列
            this.currentShifts.push(newShift);

            // 儲存到 Firestore
            const result = await unitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
            
            if (result.success) {
                alert('班別儲存成功！');
                this.renderShiftsTable(); // 重新渲染表格
                shiftFormCard.style.display = 'none';
                shiftForm.reset();
            } else {
                alert('儲存失敗：' + result.error);
            }
        });

        // 初始委派刪除按鈕事件
        shiftsTbody.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-btn')) {
                const btn = e.target.closest('.delete-btn');
                const shiftId = btn.dataset.id;
                
                if (confirm('確定要刪除此班別嗎？')) {
                    this.currentShifts = this.currentShifts.filter(s => s.id !== shiftId);
                    const result = await unitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
                    if (result.success) {
                        this.renderShiftsTable();
                    } else {
                        alert('刪除失敗');
                    }
                }
            }
        });
    }

    async loadUnitShifts(unitId) {
        const unit = await unitService.getUnitById(unitId);
        // 確保 settings.shifts 存在
        if (unit && unit.settings && unit.settings.shifts) {
            this.currentShifts = unit.settings.shifts;
        } else {
            this.currentShifts = [];
        }
        this.renderShiftsTable();
    }

    renderShiftsTable() {
        const tbody = document.getElementById('shifts-tbody');
        tbody.innerHTML = '';

        if (this.currentShifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">尚未設定任何班別</td></tr>';
            return;
        }

        this.currentShifts.forEach(shift => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <span style="background:${shift.color}; color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">
                        ${shift.code}
                    </span>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${shift.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${shift.startTime || '-'} ~ ${shift.endTime || '-'}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${shift.hours}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <div style="width:20px; height:20px; background:${shift.color}; border-radius:50%;"></div>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <button class="delete-btn" data-id="${shift.id}" style="color:red; background:none; border:none; cursor:pointer;">
                        <i class="fas fa-trash"></i> 刪除
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}
