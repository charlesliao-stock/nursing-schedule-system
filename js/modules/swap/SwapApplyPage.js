import { SwapService } from "../../services/firebase/SwapService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapApplyTemplate } from "./templates/SwapApplyTemplate.js"; // 引入 Template

export class SwapApplyPage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        this.currentUser = null;
        this.schedule = null;
        this.staffList = [];
        this.swapModal = null;
        this.currentDay = null;
    }

    async render() {
        return SwapApplyTemplate.renderLayout(this.year, this.month) + SwapApplyTemplate.renderModal();
    }

    async afterRender() {
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.currentUser = authService.getProfile();
        
        if (!this.currentUser) return; 

        window.routerPage = this;
        this.swapModal = new bootstrap.Modal(document.getElementById('swap-modal'));
        
        document.getElementById('swap-month').addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-');
            this.year = parseInt(y); this.month = parseInt(m);
            this.loadSchedule();
        });
        document.getElementById('modal-target').addEventListener('change', (e) => this.updateTargetShift(e.target.value));
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitRequest());

        await this.loadSchedule();
        await this.loadHistory();
    }

    async loadSchedule() {
        const container = document.getElementById('schedule-container');
        if(!this.currentUser.unitId) { container.innerHTML = '<div class="p-5 text-center text-muted">無單位資料</div>'; return; }
        
        const [schedule, staff] = await Promise.all([
            ScheduleService.getSchedule(this.currentUser.unitId, this.year, this.month),
            userService.getUnitStaff(this.currentUser.unitId)
        ]);
        this.schedule = schedule;
        this.staffList = staff;

        // 使用 Template 渲染表格
        container.innerHTML = SwapApplyTemplate.renderScheduleTable(schedule, staff, this.currentUser.uid, this.year, this.month);
    }

    openSwapModal(day, myShift) {
        if(!myShift || myShift === 'OFF' || myShift === 'M_OFF') { alert("您當天無排班，無需換班"); return; }
        
        const dateStr = `${this.year}-${String(this.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        document.getElementById('modal-date').value = dateStr;
        document.getElementById('modal-my-shift').value = myShift;
        document.getElementById('modal-reason').value = '';
        
        // 填入對象選單 (排除自己)
        const select = document.getElementById('modal-target');
        select.innerHTML = '<option value="">請選擇...</option>' + 
            this.staffList.filter(s => s.uid !== this.currentUser.uid).map(s => `<option value="${s.uid}">${s.name}</option>`).join('');
        
        this.currentDay = day;
        this.swapModal.show();
    }

    updateTargetShift(targetId) {
        if(!targetId) return;
        const shift = this.schedule.assignments?.[targetId]?.[this.currentDay] || 'OFF';
        document.getElementById('modal-target-shift').value = (shift === 'M_OFF' ? 'OFF' : shift);
    }

    async submitRequest() {
        const targetId = document.getElementById('modal-target').value;
        if(!targetId) return alert('請選擇對象');

        const btn = document.getElementById('btn-submit-swap');
        btn.disabled = true;

        const data = {
            unitId: this.currentUser.unitId,
            requestorId: this.currentUser.uid,
            requestorName: this.currentUser.name,
            targetId: targetId,
            targetName: this.staffList.find(s => s.uid === targetId).name,
            date: document.getElementById('modal-date').value,
            requestorShift: document.getElementById('modal-my-shift').value,
            targetShift: document.getElementById('modal-target-shift').value,
            reason: document.getElementById('modal-reason').value,
            // 初始狀態：待同事同意 (pending_target)
            status: 'pending_target' 
        };

        try {
            const res = await SwapService.createRequest(data);
            if (res.success) { 
                alert('申請已送出，需等待對方同意與主管核准。'); 
                this.swapModal.hide(); 
                this.loadHistory(); 
            } else { 
                alert('失敗: ' + res.error); 
            }
        } catch (e) { console.error(e); } 
        finally { btn.disabled = false; }
    }

    async loadHistory() {
        const list = await SwapService.getUserRequests(this.currentUser.uid);
        // 使用 Template 渲染
        document.getElementById('history-tbody').innerHTML = SwapApplyTemplate.renderHistoryRows(list);
    }
}
