import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";

export class PreScheduleSubmitPage {
    // ... (constructor 同上，保持不變) ...
    // 請複製上一則 PreScheduleSubmitPage.js 的 constructor 與 render 內容
    // 這裡為了確保完整，我再次列出，但重點是 afterRender 的修改

    constructor() {
        const today = new Date();
        let targetMonth = today.getMonth() + 1 + 1; 
        let targetYear = today.getFullYear();
        if (targetMonth > 12) { targetMonth = 1; targetYear++; }

        this.year = targetYear;
        this.month = targetMonth;
        this.currentUser = null;
        this.currentUnit = null; 
        this.unitStaffMap = {}; 
        this.preSchedulesList = []; 
        this.currentSchedule = null; 
        this.myWishes = {};
        this.myPreferences = {}; 
        this.unitAggregate = {}; 
        this.unitNames = {}; 
        this.isReadOnly = false; 
    }

    async render() {
        // ... (同上一則回覆的 render HTML) ...
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-edit"></i> 提交預班</h3>
                    <p class="text-muted small mb-0">檢視可用的預班表，並在開放時間內提交您的休假需求與偏好。</p>
                </div>

                <div id="filter-section" class="card shadow-sm mb-4 border-left-primary">
                    <div class="card-body py-2 d-flex align-items-center gap-3">
                        <label class="fw-bold">預班月份：</label>
                        <select id="schedule-select" class="form-select w-auto">
                            <option value="">載入中...</option>
                        </select>
                        <button id="btn-load" class="btn btn-primary">讀取</button>
                    </div>
                </div>

                <div id="main-content" style="display:none;">
                    <div class="alert alert-info py-2 small">開放時間：<strong id="open-date"></strong> ~ <strong id="close-date"></strong></div>
                    <div class="row">
                        <div class="col-lg-8"><div class="card shadow mb-4"><div class="card-body p-0"><div id="calendar-container" class="calendar-grid"></div></div></div></div>
                        <div class="col-lg-4">
                            <div class="card shadow mb-4 border-left-info">
                                <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-info">排班偏好</h6></div>
                                <div class="card-body">
                                    <div id="batch-pref-section" class="mb-3" style="display:none;">
                                        <label class="fw-bold d-block mb-2">包班意願</label>
                                        <div class="btn-group w-100"><input type="radio" class="btn-check" name="batchPref" id="batch-none" value="" checked><label class="btn btn-outline-secondary" for="batch-none">無</label><input type="radio" class="btn-check" name="batchPref" id="batch-e" value="E"><label class="btn btn-outline-warning text-dark" for="batch-e">小夜</label><input type="radio" class="btn-check" name="batchPref" id="batch-n" value="N"><label class="btn btn-outline-dark" for="batch-n">大夜</label></div>
                                    </div>
                                    <div class="mb-3"><label class="fw-bold d-block mb-2">優先班別(限2)</label><div class="d-flex gap-2"><div class="form-check"><input class="form-check-input pref-check" type="checkbox" value="D" id="pref-d"><label class="form-check-label" for="pref-d">D</label></div><div class="form-check"><input class="form-check-input pref-check" type="checkbox" value="E" id="pref-e"><label class="form-check-label" for="pref-e">E</label></div><div class="form-check"><input class="form-check-input pref-check" type="checkbox" value="N" id="pref-n"><label class="form-check-label" for="pref-n">N</label></div></div></div>
                                    <hr><textarea class="form-control" id="wish-notes" rows="3" placeholder="備註..."></textarea>
                                </div>
                            </div>
                            <button id="btn-submit" class="btn btn-success btn-lg w-100 shadow">提交預班</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // ✅ 修正：確保 Profile 載入
        let retries = 0;
        while (!authService.getProfile() && retries < 10) {
            await new Promise(r => setTimeout(r, 200));
            retries++;
        }
        this.currentUser = authService.getProfile();
        
        if(!this.currentUser || !this.currentUser.unitId) {
            alert("無法讀取使用者資訊或單位，請重新登入");
            return;
        }

        // 綁定 Checkbox 限制
        const prefChecks = document.querySelectorAll('.pref-check');
        prefChecks.forEach(chk => {
            chk.addEventListener('change', () => {
                if (document.querySelectorAll('.pref-check:checked').length > 2) {
                    chk.checked = false; alert("最多選 2 項");
                }
            });
        });

        // 載入資料
        try {
            const userFull = await userService.getUserData(this.currentUser.uid);
            this.currentUser = userFull; 
            
            // 處理包班顯示
            if (this.currentUser.constraints?.canBatch) {
                document.getElementById('batch-pref-section').style.display = 'block';
            }

            const staff = await userService.getUnitStaff(this.currentUser.unitId);
            staff.forEach(s => this.unitStaffMap[s.uid] = s.name);

            // ✅ 關鍵：確保用 unitId 查詢
            await this.loadList(this.currentUser.unitId);

        } catch(e) { console.error(e); }

        document.getElementById('btn-load').addEventListener('click', () => {
            const val = document.getElementById('schedule-select').value;
            if(val) this.loadScheduleData(val);
        });

        document.getElementById('btn-submit').addEventListener('click', () => this.handleSubmit());
    }

    // ... (其餘方法 loadList, loadScheduleData, renderCalendar, handleSubmit 等，請使用上一則回覆的完整版代碼) ...
    // 請務必將上一則回覆的 PreScheduleSubmitPage.js 的其餘方法複製過來，這裡不再重複以避免混亂
    // (loadList, loadScheduleData, calculateAggregate, renderCalendar, toggleDay, updateCounts, handleSubmit)
    async loadList(unitId) { const list = await PreScheduleService.getPreSchedulesList(unitId); this.preSchedulesList = list; const select = document.getElementById('schedule-select'); if (list.length === 0) { select.innerHTML = '<option value="">無開放的預班</option>'; return; } select.innerHTML = list.map((s, index) => `<option value="${index}">${s.year}-${s.month} (${s.status})</option>`).join(''); const openIdx = list.findIndex(s => s.status === 'open'); if(openIdx >= 0) { select.selectedIndex = openIdx; this.loadScheduleData(openIdx); } }
    loadScheduleData(index) { /* 請複製 */ }
    calculateAggregate(schedule) { /* 請複製 */ }
    renderCalendar() { /* 請複製 */ }
    toggleDay(d,c) { /* 請複製 */ }
    updateCounts() { /* 請複製 */ }
    async handleSubmit() { /* 請複製 */ }
}
