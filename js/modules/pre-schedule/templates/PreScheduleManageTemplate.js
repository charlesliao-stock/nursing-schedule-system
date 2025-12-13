// js/modules/preschedule/templates/PreScheduleManageTemplate.js

export const PreScheduleManageTemplate = {
    // ... (renderLayout 保持不變) ...

    renderReviewTable(staffList, submissions, year, month, options = {}) {
        const { sortKey = 'staffId', sortDir = 'asc' } = options;
        
        // 輔助函式：產生排序圖示
        const getSortIcon = (key) => {
            if (sortKey !== key) return '<i class="fas fa-sort text-muted opacity-25"></i>';
            return sortDir === 'asc' 
                ? '<i class="fas fa-sort-up text-dark"></i>' 
                : '<i class="fas fa-sort-down text-dark"></i>';
        };

        // 1. 表頭：新增 "員編" 與 "組別"
        // 注意：員編加入 onclick 事件以支援排序
        let html = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover align-middle" id="review-table">
                <thead class="table-light sticky-top">
                    <tr>
                        <th style="width: 40px;">#</th> <th style="width: 100px; cursor: pointer;" onclick="window.routerPage.handleSort('staffId')">
                            員編 ${getSortIcon('staffId')}
                        </th>
                        <th style="width: 120px;">姓名</th>
                        <th style="width: 80px; cursor: pointer;" onclick="window.routerPage.handleSort('group')">
                            組別 ${getSortIcon('group')}
                        </th>
                        <th>預班內容 (含上月月底班別)</th>
                        <th style="width: 250px;">特註 / 偏好</th> <th style="width: 100px;">狀態</th>
                        <th style="width: 80px;">操作</th>
                    </tr>
                </thead>
                <tbody id="review-table-body">
        `;

        // 2. 表格內容
        if (staffList.length === 0) {
            html += `<tr><td colspan="8" class="text-center py-4 text-muted">無資料</td></tr>`;
        } else {
            staffList.forEach((staff, index) => {
                const sub = submissions[staff.uid] || {};
                const wishes = sub.wishes || {};
                const updated = sub.updatedAt ? new Date(sub.updatedAt.seconds * 1000).toLocaleString() : '未提交';
                const statusBadge = sub.isSubmitted 
                    ? '<span class="badge bg-success">已送出</span>' 
                    : '<span class="badge bg-secondary">未填寫</span>';

                // 處理特註顯示 (包含包班者的偏好)
                let noteContent = sub.note || '';
                // 即使是包班 (canBatch)，也要顯示 wishes 摘要，避免資訊遺漏
                const wishSummary = this.getWishSummary(wishes, year, month); 
                if (wishSummary) {
                    noteContent += noteContent ? `<br><small class="text-primary">${wishSummary}</small>` : `<small class="text-primary">${wishSummary}</small>`;
                }
                if (!noteContent) noteContent = '<span class="text-muted small">-</span>';

                // 產生上一月月底 + 本月預班的視覺化格子 (簡化版)
                const gridHtml = this.renderReviewGrid(staff, wishes, year, month);

                // Row 加入 draggable 屬性
                html += `
                    <tr draggable="true" 
                        data-uid="${staff.uid}" 
                        class="review-row"
                        ondragstart="window.routerPage.handleDragStart(event)" 
                        ondragover="window.routerPage.handleDragOver(event)" 
                        ondrop="window.routerPage.handleDrop(event)">
                        
                        <td class="text-center text-muted cursor-grab" title="拖曳以排序">
                            <i class="fas fa-grip-vertical"></i>
                        </td>
                        <td class="fw-bold text-secondary">${staff.staffId || ''}</td>
                        <td>
                            <div class="fw-bold">${staff.name}</div>
                            <div class="small text-muted">${staff.rank || ''}</div>
                        </td>
                        <td><span class="badge bg-light text-dark border">${staff.group || '無'}</span></td>
                        <td class="p-1">${gridHtml}</td>
                        <td class="text-start" style="white-space: pre-wrap; font-size: 0.9em;">${noteContent}</td>
                        <td class="text-center">${statusBadge}<br><small class="text-muted" style="font-size:0.7em">${updated}</small></td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-primary" onclick="window.routerPage.openDetailModal('${staff.uid}')">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table></div>`;
        return html;
    },

    // 輔助：產生預班格子 (包含前一個月月底 6 天)
    renderReviewGrid(staff, wishes, year, month) {
        // 這裡需要 routerPage 提供的上個月資料 (prevMonthData)
        // 假設資料已經合併在 staff 物件或全域變數中，這裡先做 UI 結構
        // 為了簡單起見，我們畫一條橫向 scroll 的容器
        
        let html = '<div class="d-flex overflow-auto" style="max-width: 400px; gap: 2px;">';
        
        // 1. 渲染上個月月底 6 天 (假如有資料)
        // 這部分需要 Logic 層傳入資料，這裡先用 placeholder 邏輯
        const prevData = staff.prevMonthShifts || {}; // 預期格式: { 25: 'D', 26: 'N'... }
        const prevDays = staff.prevMonthDays || []; // [25, 26, 27, 28, 29, 30]

        prevDays.forEach(d => {
            const shift = prevData[d] || '';
            const style = shift ? 'bg-secondary text-white opacity-50' : 'bg-light text-muted border-dashed';
            // 如果是空的，允許點擊輸入 (邏輯在 Page 處理)
            const clickAttr = !shift ? `onclick="window.routerPage.editPrevShift('${staff.uid}', ${d})"` : '';
            html += `
                <div class="text-center border rounded" style="min-width: 24px; font-size: 0.75rem; ${clickAttr ? 'cursor:pointer' : ''}" title="上月 ${d} 日">
                    <div class="bg-light text-muted border-bottom" style="font-size:0.6rem">${d}</div>
                    <div class="${style}" style="height:20px; line-height:20px;">${shift || '?'}</div>
                </div>
            `;
        });

        if(prevDays.length > 0) {
            html += '<div class="border-start mx-1"></div>'; // 分隔線
        }

        // 2. 渲染本月預班 (只顯示有填的)
        let hasWish = false;
        for(let d=1; d<=31; d++) {
            if(wishes[d]) {
                hasWish = true;
                const w = wishes[d];
                let colorClass = 'bg-primary text-white';
                if(w==='OFF') colorClass = 'bg-secondary text-white';
                html += `
                    <div class="text-center border rounded" style="min-width: 24px; font-size: 0.75rem;">
                        <div class="bg-light border-bottom" style="font-size:0.6rem">${d}</div>
                        <div class="${colorClass}" style="height:20px; line-height:20px;">${w}</div>
                    </div>
                `;
            }
        }
        if(!hasWish) html += '<span class="text-muted small my-auto ps-2">無預班需求</span>';

        html += '</div>';
        return html;
    },

    getWishSummary(wishes, year, month) {
        // 簡單統計： N:3, OFF:5
        const counts = {};
        Object.values(wishes).forEach(w => counts[w] = (counts[w]||0)+1);
        const parts = [];
        Object.entries(counts).forEach(([k, v]) => parts.push(`${k}:${v}`));
        return parts.join(', ');
    }
};
