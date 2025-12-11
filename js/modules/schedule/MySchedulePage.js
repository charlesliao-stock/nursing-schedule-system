import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class MySchedulePage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        this.currentUser = null;
    }

    async render() {
        this.currentUser = authService.getProfile();
        return `
            <div class="container-fluid mt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-calendar-check"></i> 我的班表</h3>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3">
                            <label class="fw-bold">月份：</label>
                            <input type="month" id="my-month" class="form-control w-auto" 
                                   value="${this.year}-${String(this.month).padStart(2,'0')}">
                            <button id="btn-query" class="btn btn-primary">查詢</button>
                        </div>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-bordered text-center mb-0" id="my-schedule-table">
                                <thead class="table-primary">
                                    <tr id="table-head-date"></tr>
                                    <tr id="table-head-week"></tr>
                                </thead>
                                <tbody>
                                    <tr id="table-body-shift">
                                        <td colspan="31" class="p-5 text-muted">請點選查詢</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('btn-query').addEventListener('click', () => this.loadSchedule());
        
        // 自動載入當月
        if(this.currentUser && this.currentUser.unitId) {
            this.loadSchedule();
        }
    }

    async loadSchedule() {
        const val = document.getElementById('my-month').value;
        if(!val) return;
        const [y, m] = val.split('-');
        this.year = parseInt(y);
        this.month = parseInt(m);

        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        
        // 1. 渲染表頭
        let headDate = '';
        let headWeek = '';
        const weeks = ['日','一','二','三','四','五','六'];
        
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(this.year, this.month-1, d);
            const w = date.getDay();
            const isW = w===0 || w===6;
            headDate += `<th class="${isW?'text-danger':''}">${d}</th>`;
            headWeek += `<th class="${isW?'text-danger':''}" style="font-size:0.8rem;">${weeks[w]}</th>`;
        }
        document.getElementById('table-head-date').innerHTML = headDate;
        document.getElementById('table-head-week').innerHTML = headWeek;

        // 2. 查詢資料
        const unitId = this.currentUser.unitId;
        if(!unitId) {
            document.getElementById('table-body-shift').innerHTML = `<td colspan="${daysInMonth}" class="p-5 text-muted">您尚未綁定單位</td>`;
            return;
        }

        const schedule = await ScheduleService.getSchedule(unitId, this.year, this.month);
        
        // 3. 渲染班表
        let bodyHtml = '';
        if(schedule && schedule.assignments && schedule.assignments[this.currentUser.uid]) {
            const myShifts = schedule.assignments[this.currentUser.uid];
            
            for(let d=1; d<=daysInMonth; d++) {
                const shift = myShifts[d] || '';
                let bg = '';
                if(shift === 'OFF' || shift === 'M_OFF') bg = 'bg-light text-muted';
                else if(shift === 'N') bg = 'bg-dark text-white';
                else if(shift === 'E') bg = 'bg-warning text-dark';
                else if(shift === 'D') bg = 'bg-primary text-white';
                
                // M_OFF 顯示為 OFF
                const display = shift === 'M_OFF' ? 'OFF' : shift;
                
                bodyHtml += `<td class="${bg} fw-bold align-middle" style="height:50px;">${display}</td>`;
            }
        } else {
            bodyHtml = `<td colspan="${daysInMonth}" class="p-5 text-muted">本月尚無班表資料</td>`;
        }
        
        document.getElementById('table-body-shift').innerHTML = bodyHtml;
    }
}
