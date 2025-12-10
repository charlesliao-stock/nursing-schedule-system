import { UnitService } from "../../services/firebase/UnitService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";

export class SchedulePage {
    constructor() {
        this.state = { currentUnitId: null, year: null, month: null, unitSettings: null, staffList: [], scheduleData: null };
        this.draggedType = null; // Drag Drop
    }

    // ... render, afterRender, loadData (同上一版，請保留)...
    // 重點在 runAutoSchedule, renderGrid, renderVersionsModal

    // ✅ 清除排班：重置回預班狀態 (Req 5)
    async clearSchedule() {
        if(!confirm("確定重置？這將清除所有排班，並重新帶入預班資料。")) return;
        
        // 1. 重新讀取預班
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
        
        // 2. 建立新 Assignments (只含預班)
        const newAssignments = {};
        this.state.staffList.forEach(s => { newAssignments[s.id] = {}; });

        if (preSchedule && preSchedule.submissions) {
            Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                if(sub.wishes && newAssignments[uid]) {
                    Object.entries(sub.wishes).forEach(([d, w]) => {
                        // 包含所有預班類型 (OFF, XD, XE...)
                        newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                    });
                }
            });
        }

        // 3. 寫入
        this.state.scheduleData.assignments = newAssignments;
        await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, newAssignments);
        this.renderGrid();
        alert("已重置為預班狀態。");
    }

    // ✅ 刪除人員 (Req 5)
    async deleteStaffFromSchedule(uid) {
        if(!confirm("從本月班表中移除此人員？")) return;
        delete this.state.scheduleData.assignments[uid];
        // 也從 UI 列表移除 (僅暫時，若要永久需去人員管理)
        this.state.staffList = this.state.staffList.filter(s => s.id !== uid);
        await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, this.state.scheduleData.assignments);
        this.renderGrid();
    }

    // ✅ AI 預覽與缺班池 (Req 6)
    renderVersionsModal() {
        const container = document.getElementById('versions-container'); // Tabs content
        // ... Tab Logic ...
        
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            // 1. 計算缺班
            const missing = this.calculateMissingShifts(v.assignments);
            
            // 2. 渲染缺班池 (Draggable Badges)
            let poolHtml = '<div class="card mt-3 border-danger"><div class="card-header bg-danger text-white py-1">缺班池 (拖曳至上方補班)</div><div class="card-body d-flex flex-wrap gap-2">';
            missing.forEach(m => {
                poolHtml += `<div class="badge bg-dark p-2 draggable-shift" draggable="true" 
                                ondragstart="window.routerPage.handleDragStart(event, '${m.shift}')">
                                ${m.day}日: ${m.shift} (${m.count})
                             </div>`;
            });
            poolHtml += '</div></div>';

            // 3. 渲染 Grid
            const gridHtml = this.generateTableHtml(v.assignments, false); // false = not editable here

            tabPane.innerHTML = `<button class="btn btn-primary w-100 mb-2" onclick="window.routerPage.applyVersion(${idx})">套用此版本</button>` + gridHtml + poolHtml;
        });
    }

    calculateMissingShifts(assignments) {
        const missing = [];
        const staffReq = this.state.unitSettings.staffRequirements || { D:{}, E:{}, N:{} };
        const days = new Date(this.state.year, this.state.month, 0).getDate();

        for(let d=1; d<=days; d++) {
            const date = new Date(this.state.year, this.state.month-1, d);
            const w = date.getDay();
            ['N', 'E', 'D'].forEach(shift => {
                const needed = staffReq[shift]?.[w] || 0;
                let count = 0;
                Object.values(assignments).forEach(row => { if(row[d] === shift) count++; });
                if(count < needed) {
                    missing.push({ day: d, shift: shift, count: needed - count });
                }
            });
        }
        return missing;
    }

    // Drag & Drop Handlers (掛載到 window.routerPage)
    handleDragStart(e, shift) { e.dataTransfer.setData("text/plain", shift); this.draggedType = shift; }
    
    // 需要在 generateTableHtml 的 td 加入 ondrop="window.routerPage.handleDrop(event, uid, day)"
    // 以及 ondragover="event.preventDefault()"
}
