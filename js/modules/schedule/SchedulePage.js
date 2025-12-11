import { UnitService } from "../../services/firebase/UnitService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";
import { ScoringService } from "../../services/ScoringService.js"; // ✅ 引入

export class SchedulePage {
    // ... (Constructor & Render 同前，請保留) ... 
    // 這裡我們只修改 render 中的 HTML 結構，加入分數顯示區塊

    async render() {
        // ... (參數讀取同前) ...
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        return `
            <div class="schedule-container">
                <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                    <div>
                        <button class="btn btn-sm btn-outline-secondary me-2" onclick="window.location.hash='/schedule/list'"><i class="fas fa-arrow-left"></i> 回列表</button>
                        <span class="h4 align-middle fw-bold text-gray-800">
                            ${this.state.year}年 ${this.state.month}月 排班作業
                        </span>
                        <span id="schedule-status-badge" class="badge bg-secondary ms-2">載入中</span>
                    </div>
                    
                    <div class="d-flex align-items-center bg-white border rounded px-3 py-1 shadow-sm">
                        <div class="me-3 text-end">
                            <div class="small text-muted fw-bold">排班品質</div>
                            <div class="h4 mb-0 fw-bold text-primary" id="score-display">--</div>
                        </div>
                        <button class="btn btn-sm btn-outline-info rounded-circle" style="width:32px;height:32px;" onclick="window.routerPage.showScoreDetails()">
                            <i class="fas fa-info"></i>
                        </button>
                    </div>
                </div>
                
                <div class="schedule-toolbar d-flex justify-content-between mb-3">
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm shadow-sm" onclick="window.location.hash='/unit/settings/rules'"><i class="fas fa-cog"></i> 規則</button>
                        <button id="btn-clear" class="btn btn-outline-danger btn-sm shadow-sm"><i class="fas fa-undo"></i> 重置</button>
                    </div>
                    <div class="d-flex gap-2">
                        <button id="btn-auto-schedule" class="btn btn-primary shadow-sm" style="background-color: #6366f1; border:none;"><i class="fas fa-magic"></i> 智慧排班</button>
                        <button id="btn-publish" class="btn btn-success shadow-sm btn-sm"><i class="fas fa-paper-plane"></i> 發布</button>
                    </div>
                </div>

                <div id="schedule-grid-container" class="schedule-grid-wrapper border rounded"></div>

                <div class="modal fade" id="score-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white"><h5 class="modal-title">評分詳情</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body" id="score-details-body"></div>
                        </div>
                    </div>
                </div>

                <div class="modal fade" id="versions-modal" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content"><div class="modal-header bg-gradient-primary text-white"><h5 class="modal-title">AI 排班結果</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body p-0"><ul class="nav nav-tabs nav-fill bg-light" id="versionTabs" role="tablist"><li class="nav-item"><button class="nav-link active fw-bold" data-bs-toggle="tab" data-bs-target="#v1">版本 1</button></li><li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v2">版本 2</button></li><li class="nav-item"><button class="nav-link fw-bold" data-bs-toggle="tab" data-bs-target="#v3">版本 3</button></li></ul><div class="tab-content" id="versionTabsContent"><div class="tab-pane fade show active" id="v1"></div><div class="tab-pane fade" id="v2"></div><div class="tab-pane fade" id="v3"></div></div></div></div></div></div>
            </div>
        `;
    }

    async afterRender() {
        // ... (同前，綁定事件) ...
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        this.scoreModal = new bootstrap.Modal(document.getElementById('score-modal'));
        window.routerPage = this;

        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-publish').addEventListener('click', () => this.togglePublish());
        
        await this.loadData();
    }

    async loadData() {
        // ... (載入資料同前) ...
        // 在載入完成後，執行一次評分計算
        await super.loadData(); // 假設這是繼承的，若不是請複製舊代碼
        this.updateScoreDisplay();
    }

    // ✅ 新增：計算並顯示分數
    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;

        // 需要讀取 PreSchedule 以計算滿意度
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
        
        const result = ScoringService.calculate(scheduleData, staffList, unitSettings, preSchedule);
        this.state.scoreResult = result;

        const scoreEl = document.getElementById('score-display');
        scoreEl.textContent = result.totalScore;
        
        // 顏色
        if (result.totalScore >= 90) scoreEl.className = "h4 mb-0 fw-bold text-success";
        else if (result.totalScore >= 70) scoreEl.className = "h4 mb-0 fw-bold text-primary";
        else scoreEl.className = "h4 mb-0 fw-bold text-danger";
    }

    showScoreDetails() {
        const r = this.state.scoreResult;
        if (!r) return;
        
        const d = r.details;
        let html = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2 class="mb-0 ${r.totalScore>=80?'text-success':'text-danger'}">${r.totalScore}</h2>
                <span class="badge bg-secondary">總分</span>
            </div>
            <ul class="list-group">
                <li class="list-group-item d-flex justify-content-between">
                    <span>硬性約束</span> 
                    <span class="${d.hardConstraints.passed?'text-success':'text-danger'}">
                        ${d.hardConstraints.passed?'通過':'失敗'}
                    </span>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>公平性 (工時)</span> <strong>${d.fairness.score.toFixed(1)}</strong>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>員工滿意度</span> <strong>${d.satisfaction.score.toFixed(1)}</strong>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>排班效率</span> <strong>${d.efficiency.score}</strong>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>健康安全</span> <strong>${d.health.score}</strong>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>品質 (資深)</span> <strong>${d.quality.score}</strong>
                </li>
                <li class="list-group-item d-flex justify-content-between">
                    <span>成本控制</span> <strong>${d.cost.score}</strong>
                </li>
            </ul>
        `;
        document.getElementById('score-details-body').innerHTML = html;
        this.scoreModal.show();
    }

    // ... (renderGrid, runMultiVersionAI 等方法需修改以呼叫 updateScoreDisplay)
    // 在 generateTableHtml 後面不需要改，但在 applyVersion 後要呼叫 updateScoreDisplay
    async applyVersion(index) {
        // ... (同前)
        await ScheduleService.updateAllAssignments(...);
        this.versionsModal.hide();
        this.renderGrid();
        this.updateScoreDisplay(); // ✅ 更新分數
    }
}
