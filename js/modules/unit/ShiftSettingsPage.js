// 【修正】引入 UnitService (大寫)
import { UnitService } from "../../services/firebase/UnitService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
    }

    async render() {
        // 載入單位列表供選擇
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}">${u.unitName}</option>`
        ).join('');

        return `
            <div class="container">
                <h2>班別設定 (Shift Settings)</h2>
                
                <div class="toolbar">
                    <label>選擇單位：</label>
                    <select id="shift-settings-unit">
                        <option value="">請選擇...</option>
                        ${unitOptions}
                    </select>
                </div>

                <div id="shifts-container" style="display:none; margin-top: 20px;">
                    <h3>現有班別列表</h3>
                    <table class="shift-table">
                        <thead>
                            <tr>
                                <th>代號</th>
                                <th>名稱</th>
                                <th>時間</th>
                                <th>顏色</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="shifts-tbody"></tbody>
                    </table>
                    
                    <h3 style="margin-top:20px;">新增/編輯班別</h3>
                    <form id="shift-form" style="background:#f9f9f9; padding:15px; border-radius:5px;">
                        <input type="hidden" id="shift-index" value="-1"> <div class="form-row">
                            <input type="text" id="shift-code" placeholder="代號 (如 D)" required style="width:80px">
                            <input type="text" id="shift-name" placeholder="名稱 (如 白班)" required>
                            <input type="text" id="shift-time" placeholder="時間 (如 08-16)">
                            <input type="color" id="shift-color" value="#ffffff">
                            <button type="submit" class="btn-primary">儲存班別</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('shift-settings-unit');
        const container = document.getElementById('shifts-container');
        const tbody = document.getElementById('shifts-tbody');
        const form = document.getElementById('shift-form');
        
        let currentShifts = [];

        // 監聽單位選擇變更
        unitSelect.addEventListener('change', async (e) => {
            this.currentUnitId = e.target.value;
            if (!this.currentUnitId) {
                container.style.display = 'none';
                return;
            }
            
            // 【修正】呼叫 UnitService.getUnitById
            const unit = await UnitService.getUnitById(this.currentUnitId);
            if (unit) {
                currentShifts = unit.settings?.shifts || [];
                renderShifts();
                container.style.display = 'block';
            }
        });

        // 渲染班別列表函數
        const renderShifts = () => {
            tbody.innerHTML = currentShifts.map((s, index) => `
                <tr>
                    <td>${s.code}</td>
                    <td>${s.name}</td>
                    <td>${s.time}</td>
                    <td><span style="display:inline-block;width:20px;height:20px;background:${s.color};border:1px solid #ccc;"></span></td>
                    <td>
                        <button type="button" onclick="window.editShift(${index})">編輯</button>
                        <button type="button" onclick="window.deleteShift(${index})">刪除</button>
                    </td>
                </tr>
            `).join('');
        };

        // 處理表單提交 (新增/修改)
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const index = parseInt(document.getElementById('shift-index').value);
            const newShift = {
                code: document.getElementById('shift-code').value,
                name: document.getElementById('shift-name').value,
                time: document.getElementById('shift-time').value,
                color: document.getElementById('shift-color').value
            };

            if (index === -1) {
                currentShifts.push(newShift);
            } else {
                currentShifts[index] = newShift;
            }

            // 【修正】呼叫 UnitService.updateUnitShifts
            const result = await UnitService.updateUnitShifts(this.currentUnitId, currentShifts);
            if (result.success) {
                renderShifts();
                form.reset();
                document.getElementById('shift-index').value = "-1";
            } else {
                alert("儲存失敗: " + result.error);
            }
        });

        // 將 helper function 綁定到 window 以便 onclick 呼叫 (SPA 常見暫時解法)
        window.deleteShift = async (index) => {
            if (confirm("確定刪除此班別？")) {
                currentShifts.splice(index, 1);
                await UnitService.updateUnitShifts(this.currentUnitId, currentShifts);
                renderShifts();
            }
        };

        window.editShift = (index) => {
            const s = currentShifts[index];
            document.getElementById('shift-index').value = index;
            document.getElementById('shift-code').value = s.code;
            document.getElementById('shift-name').value = s.name;
            document.getElementById('shift-time').value = s.time;
            document.getElementById('shift-color').value = s.color;
        };
    }
}
