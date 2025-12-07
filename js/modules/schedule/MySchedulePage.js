import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { userService } from "../../services/firebase/UserService.js";

export class MySchedulePage {
    constructor() {
        this.year = new Date().getFullYear();
        this.month = new Date().getMonth() + 1;
        this.currentUser = null;
        this.targetUnitId = null;
    }

    async render() {
        // 取得使用者單位，做為預設
        const profile = authService.getProfile();
        this.currentUser = profile;
        if (!this.targetUnitId && profile) this.targetUnitId = profile.unitId;

        // 單位選單 (供查詢被排班的其他單位)
        const units = await UnitService.getAllUnits();
        const unitOptions = units.map(u => 
            `<option value="${u.unitId}" ${u.unitId === this.targetUnitId ? 'selected' : ''}>${u.unitName}</option>`
        ).join('');

        return `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="h3 mb-0 text-gray-800"><i class="fas fa-calendar-check"></i> 我的班表</h2>
                </div>

                <div class="card shadow mb-4">
                    <div class="card-body bg-light">
                        <div class="d-flex flex-wrap gap-3 align-items-center">
                            <div>
                                <label class="fw-bold">單位：</label>
                                <select id="my-unit-select" class="form-select d-inline-block w-auto">${unitOptions}</select>
                            </div>
                            <div>
                                <label class="fw-bold">月份：</label>
                                <input type="month" id="my-month-picker" class="form-control d-inline-block w-auto" 
                                       value="${this.year}-${String(this.month).padStart(2,'0')}">
                            </div>
                            <button id="btn-query-my" class="btn btn-primary"><i class="fas fa-search"></i> 查詢</button>
                        </div>
                    </div>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3">
                        <h6 class="m-0 font-weight-bold text-primary">班表內容</h6>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover text-nowrap text-center" id="my-schedule-table">
                                <thead class="table-light">
                                    <tr id="my-table-head"></tr>
                                </thead>
                                <tbody id="my-table-body">
                                    <tr><td class="p-5 text-muted">載入中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('btn-query-my').addEventListener('click', () => this.loadData());
        this.loadData();
    }

    async loadData() {
        const unitId = document.getElementById('my-unit-select').value;
        const [y, m] = document.getElementById('my-month-picker').value.split('-');
        this.targetUnitId = unitId;
        this.year = parseInt(y);
        this.month = parseInt(m);

        const thead = document.getElementById('my-table-head');
        const tbody = document.getElementById('my-table-body');
        
        // 1. 產生表頭 (日期)
        const daysInMonth = new Date(this.year, this.month, 0).getDate();
        let headHtml = '<th class="bg-light sticky-col" style="min-width:100px;">人員</th>';
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(this.year, this.month - 1, d);
            const weekDay = ['日','一','二','三','四','五','六'][date.getDay()];
            const color = (date.getDay() === 0 || date.getDay() === 6) ? 'text-danger' : '';
            headHtml += `<th class="${color}">${d}<br><small>${weekDay}</small></th>`;
        }
        thead.innerHTML = headHtml;

        // 2. 載入資料
        const schedule = await ScheduleService.getSchedule(unitId, this.year, this.month);
        if (!schedule || !schedule.assignments) {
            tbody.innerHTML = `<tr><td colspan="${daysInMonth+1}" class="p-5 text-muted">尚無班表資料</td></tr>`;
            return;
        }

        // 3. 取得該單位所有人員 (為了顯示全部門的大表，讓使用者看整體)
        // 需求：顯示的內容為當月所在的單位及班表
        const staffList = await userService.getUnitStaff(unitId);
        
        // 排序：自己排第一個
        staffList.sort((a, b) => {
            if (a.id === this.currentUser.uid) return -1;
            if (b.id === this.currentUser.uid) return 1;
            return 0;
        });

        let bodyHtml = '';
        staffList.forEach(staff => {
            const isMe = staff.id === this.currentUser.uid;
            const rowClass = isMe ? 'table-warning fw-bold' : ''; // 自己那一行高亮
            
            let rowHtml = `<tr class="${rowClass}"><td class="sticky-col text-start">${staff.name}</td>`;
            
            const shifts = schedule.assignments[staff.id] || {};
            for (let d = 1; d <= daysInMonth; d++) {
                const shift = shifts[d] || '';
                rowHtml += `<td>${shift}</td>`;
            }
            rowHtml += '</tr>';
            bodyHtml += rowHtml;
        });

        tbody.innerHTML = bodyHtml;
    }
}
