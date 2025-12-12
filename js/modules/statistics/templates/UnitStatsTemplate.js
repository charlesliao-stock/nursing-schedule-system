export const UnitStatsTemplate = {
    renderLayout(startMonth, endMonth) {
        return `
            <div class="container-fluid mt-4">
                <h2 class="mb-4"><i class="fas fa-chart-bar"></i> 單位區間統計</h2>
                
                <div class="card shadow mb-4 border-left-primary">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3 flex-wrap">
                            <div class="d-flex align-items-center gap-2">
                                <label class="fw-bold text-nowrap">單位：</label>
                                <select id="stats-unit-select" class="form-select w-auto">
                                    <option value="">載入中...</option>
                                </select>
                            </div>
                            <div class="vr mx-2"></div>
                            <div class="d-flex align-items-center gap-2">
                                <label class="fw-bold text-nowrap">區間：</label>
                                <input type="month" id="start-month" class="form-control w-auto" value="${startMonth}">
                                <span>~</span>
                                <input type="month" id="end-month" class="form-control w-auto" value="${endMonth}">
                                <button id="btn-unit-query" class="btn btn-primary ms-2"><i class="fas fa-search"></i> 查詢</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card shadow">
                    <div class="card-header py-3 bg-white"><h6 class="m-0 font-weight-bold text-primary">統計結果</h6></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-bordered table-striped mb-0 text-center">
                                <thead class="table-dark">
                                    <tr>
                                        <th>日期</th>
                                        <th class="bg-primary text-white">白班 (D)</th>
                                        <th class="bg-warning text-dark">小夜 (E)</th>
                                        <th class="bg-danger text-white">大夜 (N)</th>
                                        <th class="bg-secondary text-white">休假 (OFF)</th>
                                        <th>總上班數</th>
                                    </tr>
                                </thead>
                                <tbody id="unit-stats-tbody">
                                    <tr><td colspan="6" class="p-5 text-muted">請選擇區間並查詢</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderRows(sortedKeys, aggregate) {
        if(sortedKeys.length === 0) return '<tr><td colspan="6" class="p-5 text-muted">該區間無班表資料</td></tr>';

        return sortedKeys.map(date => {
            const d = aggregate[date];
            return `
                <tr>
                    <td class="fw-bold">${date}</td>
                    <td>${d.D}</td>
                    <td>${d.E}</td>
                    <td>${d.N}</td>
                    <td class="text-muted">${d.OFF}</td>
                    <td class="fw-bold">${d.Total}</td>
                </tr>`;
        }).join('');
    }
};
