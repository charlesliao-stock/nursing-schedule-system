export const MyScheduleTemplate = {
    renderLayout(year, month) {
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
                                   value="${year}-${String(month).padStart(2,'0')}">
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
    },

    renderHeadDate(year, month, daysInMonth) {
        let html = '';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month-1, d);
            const w = date.getDay();
            const isW = w===0 || w===6;
            html += `<th class="${isW?'text-danger':''}">${d}</th>`;
        }
        return html;
    },

    renderHeadWeek(year, month, daysInMonth) {
        const weeks = ['日','一','二','三','四','五','六'];
        let html = '';
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(year, month-1, d);
            const w = date.getDay();
            const isW = w===0 || w===6;
            html += `<th class="${isW?'text-danger':''}" style="font-size:0.8rem;">${weeks[w]}</th>`;
        }
        return html;
    },

    renderBodyRow(schedule, uid, daysInMonth) {
        if(!schedule || !schedule.assignments || !schedule.assignments[uid]) {
            return `<td colspan="${daysInMonth}" class="p-5 text-muted">本月尚無班表資料</td>`;
        }

        const myShifts = schedule.assignments[uid];
        let html = '';
        
        for(let d=1; d<=daysInMonth; d++) {
            const shift = myShifts[d] || '';
            let bg = '';
            if(shift === 'OFF' || shift === 'M_OFF') bg = 'bg-light text-muted';
            else if(shift === 'N') bg = 'bg-dark text-white';
            else if(shift === 'E') bg = 'bg-warning text-dark';
            else if(shift === 'D') bg = 'bg-primary text-white';
            
            const display = shift === 'M_OFF' ? 'OFF' : shift;
            html += `<td class="${bg} fw-bold align-middle" style="height:50px;">${display}</td>`;
        }
        return html;
    }
};
