import { UnitService } from "../../services/firebase/UnitService.js";

export class ShiftSettingsPage {
    constructor() {
        this.currentUnitId = ''; 
        this.currentShifts = [];
        this.isEditing = false;
    }

    async render() {
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}">${u.unitName}</option>`
        ).join('');

        // 產生時間選項 (00-23)
        const hourOptions = Array.from({length: 24}, (_, i) => {
            const val = String(i).padStart(2, '0');
            return `<option value="${val}">${val}</option>`;
        }).join('');

        // 產生分鐘選項 (00, 30)
        const minOptions = `<option value="00">00</option><option value="30">30</option>`;

        return `
            <div class="container">
                <h2>班別設定 (Shift Settings)</h2>
                
                <div class="toolbar">
                    <label>選擇單位：</label>
                    <select id="shift-settings-unit" style="padding: 5px; font-size: 1rem;">
                        <option value="">請選擇...</option>
                        ${unitOptions}
                    </select>
                </div>

                <div id="shifts-container" style="display:none; margin-top: 20px;">
                    <h3>現有班別列表</h3>
                    <table class="shift-table" style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead>
                            <tr style="background-color: #f3f4f6; text-align: left;">
                                <th style="padding: 10px; border-bottom: 2px solid #ddd;">代號</th>
                                <th style="padding: 10px; border-bottom: 2px solid #ddd;">名稱</th>
                                <th style="padding: 10px; border-bottom: 2px solid #ddd;">時間 (起-迄)</th>
                                <th style="padding: 10px; border-bottom: 2px solid #ddd;">顏色</th>
                                <th style="padding: 10px; border-bottom: 2px solid #ddd;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="shifts-tbody"></tbody>
                    </table>
                    
                    <h3 id="form-title" style="margin-top:20px; border-top: 1px solid #eee; padding-top: 20px;">新增班別</h3>
                    <form id="shift-form" style="background:#f9f9f9; padding:20px; border-radius:8px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end;">
                        <input type="hidden" id="shift-index" value="-1">
                        
                        <div style="flex: 1; min-width: 80px;">
                            <label style="display:block; font-size:0.9rem; margin-bottom:5px;">代號</label>
                            <input type="text" id="shift-code" placeholder="如 D" required style="width:100%; padding:8px;">
                        </div>

                        <div style="flex: 2; min-width: 120px;">
                            <label style="display:block; font-size:0.9rem; margin-bottom:5px;">名稱</label>
                            <input type="text" id="shift-name" placeholder="如 白班" required style="width:100%; padding:8px;">
                        </div>

                        <div style="flex: 3; min-width: 250px; display: flex; gap: 5px; align-items: center;">
                            <div>
                                <label style="display:block; font-size:0.9rem; margin-bottom:5px;">開始時間</label>
                                <div style="display:flex;">
                                    <select id="start-hour" style="padding:8px;">${hourOptions}</select>
                                    <span style="padding:5px;">:</span>
                                    <select id="start-min" style="padding:8px;">${minOptions}</select>
                                </div>
                            </div>
                            <span style="padding-top: 20px;">~</span>
                            <div>
                                <label style="display:block; font-size:0.9rem; margin-bottom:5px;">結束時間</label>
                                <div style="display:flex;">
                                    <select id="end-hour" style="padding:8px;">${hourOptions}</select>
                                    <span style="padding:5px;">:</span>
                                    <select id="end-min" style="padding:8px;">${minOptions}</select>
                                </div>
                            </div>
                        </div>

                        <div style="flex: 0 0 60px;">
                            <label style="display:block; font-size:0.9rem; margin-bottom:5px;">顏色</label>
                            <input type="color" id="shift-color" value="#3b82f6" style="width:100%; height:38px; padding:0; border:none;">
                        </div>

                        <div style="flex: 100%; display: flex; gap: 10px; margin-top: 10px;">
                            <button type="submit" class="btn-primary" style="padding: 8px 20px;">
                                <i class="fas fa-save"></i> 儲存
                            </button>
                            <button type="button" id="btn-cancel" class="btn-secondary" style="padding: 8px 20px; display:none;">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    async afterRender() {
        const unitSelect = document.getElementById('shift-settings-unit');
        const container = document.getElementById('shifts-container');
        const form = document.getElementById('shift-form');
        const cancelBtn = document.getElementById('btn-cancel');
        const formTitle = document.getElementById('form-title');

        // 綁定單位變更事件
        unitSelect.addEventListener('change', async (e) => {
            this.currentUnitId = e.target.value;
            if (!this.currentUnitId) {
                container.style.display = 'none';
                return;
            }
            this.resetForm();
            await this.loadShifts();
            container.style.display = 'block';
        });

        // 綁定表單送出
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveShift();
        });

        // 綁定取消按鈕
        cancelBtn.addEventListener('click', () => {
            this.resetForm();
        });

        // 綁定全域編輯/刪除事件 (因為是 innerHTML 產生的)
        window.handleEditShift = (index) => this.loadShiftToForm(index);
        window.handleDeleteShift = (index) => this.deleteShift(index);
    }

    async loadShifts() {
        const unit = await UnitService.getUnitById(this.currentUnitId);
        this.currentShifts = unit?.settings?.shifts || [];
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('shifts-tbody');
        if (this.currentShifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">尚無班別設定</td></tr>';
            return;
        }

        tbody.innerHTML = this.currentShifts.map((s, index) => {
            // 相容舊資料：如果沒有 startTime，嘗試顯示舊的 time 字串
            const timeDisplay = (s.startTime && s.endTime) 
                ? `${s.startTime} - ${s.endTime}` 
                : (s.time || '未設定');

            return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:10px;">${s.code}</td>
                <td style="padding:10px;">${s.name}</td>
                <td style="padding:10px;">${timeDisplay}</td>
                <td style="padding:10px;">
                    <span style="display:inline-block;width:20px;height:20px;background:${s.color};border:1px solid #ccc;border-radius:4px;"></span>
                </td>
                <td style="padding:10px;">
                    <button class="btn-secondary" onclick="window.handleEditShift(${index})" style="padding:4px 8px; font-size:0.8rem;">編輯</button>
                    <button class="btn-secondary" onclick="window.handleDeleteShift(${index})" style="padding:4px 8px; font-size:0.8rem; color:red;">刪除</button>
                </td>
            </tr>
            `;
        }).join('');
    }

    loadShiftToForm(index) {
        const s = this.currentShifts[index];
        if (!s) return;

        document.getElementById('shift-index').value = index;
        document.getElementById('shift-code').value = s.code;
        document.getElementById('shift-name').value = s.name;
        document.getElementById('shift-color').value = s.color;
        
        // 處理時間回填
        if (s.startTime) {
            const [sh, sm] = s.startTime.split(':');
            document.getElementById('start-hour').value = sh;
            document.getElementById('start-min').value = sm;
        }
        if (s.endTime) {
            const [eh, em] = s.endTime.split(':');
            document.getElementById('end-hour').value = eh;
            document.getElementById('end-min').value = em;
        }

        // 切換 UI 狀態
        document.getElementById('form-title').textContent = '編輯班別';
        document.getElementById('btn-cancel').style.display = 'inline-block';
        
        // 滾動到表單
        document.getElementById('shift-form').scrollIntoView({ behavior: 'smooth' });
    }

    async saveShift() {
        const index = parseInt(document.getElementById('shift-index').value);
        const code = document.getElementById('shift-code').value.toUpperCase(); // 強制大寫
        
        const sh = document.getElementById('start-hour').value;
        const sm = document.getElementById('start-min').value;
        const eh = document.getElementById('end-hour').value;
        const em = document.getElementById('end-min').value;

        const startTime = `${sh}:${sm}`;
        const endTime = `${eh}:${em}`;

        const newShift = {
            code: code,
            name: document.getElementById('shift-name').value,
            color: document.getElementById('shift-color').value,
            startTime: startTime,
            endTime: endTime,
            // 為了向下相容，保留一個 time 字串
            time: `${startTime}-${endTime}` 
        };

        if (index === -1) {
            // 新增
            this.currentShifts.push(newShift);
        } else {
            // 更新
            this.currentShifts[index] = newShift;
        }

        const result = await UnitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
        if (result.success) {
            this.resetForm();
            this.renderTable();
            alert('儲存成功');
        } else {
            alert('儲存失敗: ' + result.error);
        }
    }

    async deleteShift(index) {
        if (!confirm('確定要刪除此班別嗎？')) return;
        
        this.currentShifts.splice(index, 1);
        const result = await UnitService.updateUnitShifts(this.currentUnitId, this.currentShifts);
        if (result.success) {
            this.renderTable();
        } else {
            alert('刪除失敗: ' + result.error);
        }
    }

    resetForm() {
        document.getElementById('shift-form').reset();
        document.getElementById('shift-index').value = "-1";
        document.getElementById('form-title').textContent = '新增班別';
        document.getElementById('btn-cancel').style.display = 'none';
        
        // 預設時間
        document.getElementById('start-hour').value = "08";
        document.getElementById('start-min').value = "00";
        document.getElementById('end-hour').value = "16";
        document.getElementById('end-min').value = "00";
    }
}
