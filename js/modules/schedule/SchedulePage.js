import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";
import { ScoringService } from "../../services/ScoringService.js";
import { SchedulePageTemplate } from "./templates/SchedulePageTemplate.js"; // 引入 Template

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null, year: null, month: null,
            unitSettings: null, staffList: [], scheduleData: null, daysInMonth: 0,
            scoreResult: null
        };
        this.versionsModal = null; 
        this.scoreModal = null;
        this.generatedVersions = [];
        this.draggedShift = null; 
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if(!this.state.currentUnitId) return `<div class="alert alert-danger m-4">無效的參數，請從列表頁進入。</div>`;

        // 直接使用 Template
        return SchedulePageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        this.scoreModal = new bootstrap.Modal(document.getElementById('score-modal'));
        window.routerPage = this;

        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-validate').addEventListener('click', () => { this.renderGrid(); alert("驗證完成"); });
        document.getElementById('btn-publish').addEventListener('click', () => this.togglePublish());

        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        await this.loadData();
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) this.closeMenu();
    }

    closeMenu() {
        if (this.state.activeMenu) { this.state.activeMenu.remove(); this.state.activeMenu = null; }
    }

    async loadData() {
        const container = document.getElementById('schedule-grid-container');
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';
        container.innerHTML = '<div class="text-center p-5">資料載入中...</div>';

        try {
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            this.state.unitSettings = unit;
            this.state.staffList = staffList;
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            if (!schedule) {
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId, year: this.state.year, month: this.state.month,
                    status: 'draft', assignments: {}
                };
                staffList.forEach(s => this.state.scheduleData.assignments[s.uid] = {});
                await this.resetToPreSchedule(false);
            } else {
                this.state.scheduleData = schedule;
                this.renderGrid();
                this.updateStatusBadge();
                this.updateScoreDisplay();
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="alert alert-danger m-3">載入失敗: ${error.message}</div>`;
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    async resetToPreSchedule(showConfirm = true) {
        if(showConfirm && !confirm("確定重置？\n這將清除所有已排的班別，並重新載入預班資料。")) return;
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            const newAssignments = {};
            this.state.staffList.forEach(s => { newAssignments[s.uid] = {}; });

            if (preSchedule && preSchedule.submissions) {
                Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                    if(sub.wishes && newAssignments[uid]) {
                        Object.entries(sub.wishes).forEach(([d, w]) => {
                            newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                        });
                    }
                });
            }
            this.state.scheduleData.assignments = newAssignments;
            await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, newAssignments);
            this.renderGrid();
            this.updateScoreDisplay();
            if(showConfirm) alert("✅ 已重置為預班初始狀態。");
        } catch(e) { console.error(e); alert("重置失敗: " + e.message); } finally { if(loading) loading.style.display = 'none'; }
    }

    // 核心渲染邏輯：先運算規則，再呼叫 Template 產生 HTML
    renderGrid() {
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, this.state.daysInMonth, this.state.staffList, this.state.unitSettings, this.state.unitSettings?.rules
        );
        const container = document.getElementById('schedule-grid-container');
        // 呼叫 Template
        container.innerHTML = SchedulePageTemplate.renderGrid(this.state, validation, { isInteractive: true });
        this.bindMenu();
    }

    bindMenu() {
        document.querySelectorAll('.shift-cell').forEach(c => c.addEventListener('click', e => { 
            e.stopPropagation(); 
            this.openShiftMenu(c, this.state.unitSettings?.settings?.shifts||[]); 
        }));
    }

    openShiftMenu(target, shifts) {
        this.closeMenu();
        const menu = document.createElement('div');
        menu.className = 'shift-menu shadow rounded border bg-white';
        menu.style.position = 'absolute'; menu.style.zIndex = '1000'; menu.style.padding = '5px';
        const opts = [{ code: '', name: '清除', color: 'transparent' }, { code: 'OFF', name: '休假', color: '#e5e7eb' }, ...shifts];
        opts.forEach(s => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item p-1'; item.style.cursor = 'pointer';
            item.innerHTML = `<span style="display:inline-block;width:15px;height:15px;background:${s.color};margin-right:5px;"></span> ${s.code}`;
            item.onclick = () => this.handleShiftSelect(target, s.code);
            menu.appendChild(item);
        });
        const rect = target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`; menu.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    async handleShiftSelect(cell, code) {
        this.closeMenu();
        const uid = cell.dataset.staffId;
        const day = cell.dataset.day;
        if (!this.state.scheduleData.assignments[uid]) this.state.scheduleData.assignments[uid] = {};
        this.state.scheduleData.assignments[uid][day] = code;
        this.renderGrid();
        await ScheduleService.updateShift(this.state.currentUnitId, this.state.year, this.state.month, uid, day, code);
        this.updateScoreDisplay();
    }

    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
        const result = ScoringService.calculate(scheduleData, staffList, unitSettings, preSchedule);
        this.state.scoreResult = result;
        const el = document.getElementById('score-display');
        el.textContent = result.totalScore;
        el.className = `h4 mb-0 fw-bold ${result.totalScore>=90?'text-success':(result.totalScore>=70?'text-primary':'text-danger')}`;
    }

    showScoreDetails() {
        if (!this.state.scoreResult) return alert("尚未計算分數");
        document.getElementById('score-details-body').innerHTML = SchedulePageTemplate.renderScoreDetails(this.state.scoreResult);
        this.scoreModal.show();
    }

    async runMultiVersionAI() {
        if (!confirm("確定執行智慧排班？\n這將計算 3 個版本供您選擇。")) return;
        const loading = document.getElementById('loading-indicator');
        loading.style.display = 'block';
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            const currentData = { ...this.state.scheduleData };
            this.generatedVersions = [];
            for (let i = 1; i <= 3; i++) {
                const result = AutoScheduler.run(currentData, this.state.staffList, this.state.unitSettings, preSchedule);
                const scoreRes = ScoringService.calculate({ assignments: result.assignments, year: this.state.year, month: this.state.month }, this.state.staffList, this.state.unitSettings, preSchedule);
                this.generatedVersions.push({ id: i, assignments: result.assignments, logs: result.logs, score: scoreRes });
            }
            this.renderVersionsModal();
            this.versionsModal.show();
        } catch (e) { alert("演算失敗: " + e.message); } finally { loading.style.display = 'none'; }
    }

    renderVersionsModal() {
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;
            
            // 計算缺班
            const missing = this.calculateMissingShifts(v.assignments);
            
            // 驗證規則
            const validation = RuleEngine.validateAll(
                { year: this.state.year, month: this.state.month, assignments: v.assignments },
                this.state.daysInMonth, this.state.staffList, this.state.unitSettings, this.state.unitSettings?.rules
            );

            // 組合 UI
            const scoreBadge = v.score.passed ? `<span class="badge bg-success fs-5">${v.score.totalScore} 分</span>` : `<span class="badge bg-danger fs-5">不合格</span>`;
            const infoHtml = `<div class="alert alert-light border d-flex justify-content-between align-items-center mb-2"><div class="d-flex align-items-center gap-3">${scoreBadge}<div class="small text-muted border-start ps-3"><div>公平性: ${v.score.details.fairness.score.toFixed(0)}</div><div>滿意度: ${v.score.details.satisfaction.score.toFixed(0)}</div></div></div><button class="btn btn-primary" onclick="window.routerPage.applyVersion(${idx})">套用此版本</button></div>`;
            const poolHtml = SchedulePageTemplate.renderMissingPool(missing);
            
            // 呼叫 Template 的 Grid 渲染 (isDropZone = true)
            // 這裡需要造一個 fake Context 給 Template
            const fakeCtx = { ...this.state, scheduleData: { assignments: v.assignments } };
            const gridHtml = `<div style="max-height:60vh; overflow:auto;">${SchedulePageTemplate.renderGrid(fakeCtx, validation, { isInteractive: false, isDropZone: true, versionIdx: idx })}</div>`;
            
            tabPane.innerHTML = infoHtml + poolHtml + gridHtml;
        });
    }

    calculateMissingShifts(assignments) {
        const missing = [];
        const staffReq = this.state.unitSettings.staffRequirements || { D:{}, E:{}, N:{} };
        for(let d=1; d<=this.state.daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month-1, d);
            const w = date.getDay();
            ['N', 'E', 'D'].forEach(shift => {
                const needed = staffReq[shift]?.[w] || 0;
                let count = 0;
                Object.values(assignments).forEach(row => { if(row[d] === shift) count++; });
                if(count < needed) missing.push({ day: d, shift: shift, count: needed - count });
            });
        }
        return missing;
    }

    handleDragStart(e, shift) { e.dataTransfer.setData("text/plain", shift); this.draggedShift = shift; }
    
    handleDrop(e, uid, day, versionIdx) {
        e.preventDefault();
        const shift = e.dataTransfer.getData("text/plain") || this.draggedShift;
        if(!shift) return;
        const targetVersion = this.generatedVersions[versionIdx];
        if(!targetVersion.assignments[uid]) targetVersion.assignments[uid] = {};
        targetVersion.assignments[uid][day] = shift;
        this.renderVersionsModal(); 
    }

async applyVersion(index) {
    const selected = this.generatedVersions[index];
    
    // 1. ✅ 關鍵！必須更新本地狀態
    // 確保 assignments 是完整物件
    this.state.scheduleData.assignments = JSON.parse(JSON.stringify(selected.assignments));

    // 2. 更新資料庫
    await ScheduleService.updateAllAssignments(
        this.state.currentUnitId, 
        this.state.year, 
        this.state.month, 
        selected.assignments
    );

    this.versionsModal.hide();
    
    // 3. 重新渲染 (這時候才會讀到新資料)
    this.renderGrid();
    this.updateScoreDisplay();
    
    alert(`✅ 已成功套用版本 ${selected.id}。`);
}

    async deleteStaff(uid) {
        if(!confirm("從本月班表中移除此人員？")) return;
        delete this.state.scheduleData.assignments[uid];
        // 這裡僅從前端 List 移除顯示，並更新 DB (不刪除 User)
        this.state.staffList = this.state.staffList.filter(s => s.uid !== uid);
        await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, this.state.scheduleData.assignments);
        this.renderGrid();
        this.updateScoreDisplay();
    }
    
    async togglePublish() {
        if(!this.state.scheduleData) return;
        const currentStatus = this.state.scheduleData.status;
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        if(confirm(`確定要 ${newStatus==='published'?'發布':'撤回'} 嗎？`)) {
            await ScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, newStatus);
            this.state.scheduleData.status = newStatus;
            this.updateStatusBadge();
            alert(`班表已${newStatus==='published'?'發布':'撤回'}`);
        }
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        const btn = document.getElementById('btn-publish');
        if(!badge || !this.state.scheduleData) return;
        const status = this.state.scheduleData.status;
        if (status === 'published') {
            badge.className = 'badge bg-success ms-2'; badge.textContent = '已發布';
            if(btn) { btn.textContent = '撤回班表'; btn.classList.replace('btn-success', 'btn-warning'); }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2'; badge.textContent = '草稿';
            if(btn) { btn.textContent = '發布班表'; btn.classList.replace('btn-warning', 'btn-success'); }
        }
    }
}
