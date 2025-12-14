import { UnitService } from "../../services/firebase/UnitService.js";
import { userService } from "../../services/firebase/UserService.js";
import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { PreScheduleService } from "../../services/firebase/PreScheduleService.js";
import { RuleEngine } from "../ai/RuleEngine.js";
import { AutoScheduler } from "../ai/AutoScheduler.js";
import { ScoringService } from "../../services/ScoringService.js";
import { SchedulePageTemplate } from "./templates/SchedulePageTemplate.js"; 

export class SchedulePage {
    constructor() {
        this.state = {
            currentUnitId: null, 
            year: null, 
            month: null,
            unitSettings: null, 
            staffList: [], 
            scheduleData: null, 
            daysInMonth: 0,
            scoreResult: null,
            activeMenu: null // 追蹤當前開啟的選單
        };
        this.versionsModal = null; 
        this.scoreModal = null;
        this.generatedVersions = [];
        this.draggedShift = null; 
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
    }

    // ============================================================
    //  1. 初始化與生命週期
    // ============================================================

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if(!this.state.currentUnitId) return `<div class="alert alert-danger m-4">無效的參數，請從列表頁進入。</div>`;

        return SchedulePageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        // 初始化 Modal
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        this.scoreModal = new bootstrap.Modal(document.getElementById('score-modal'));
        
        // 綁定全域變數方便 HTML onclick 呼叫 (如 applyVersion)
        window.routerPage = this;

        // 綁定按鈕事件
        document.getElementById('btn-auto-schedule').addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear').addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-validate').addEventListener('click', () => { this.renderGrid(); alert("驗證與刷新完成"); });
        document.getElementById('btn-publish').addEventListener('click', () => this.togglePublish());

        // 綁定全域點擊 (關閉選單用)
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);

        await this.loadData();
    }

    handleGlobalClick(e) {
        // 如果點擊的不是 shift-cell 且目前有開啟選單，就關閉它
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) {
            this.closeMenu();
        }
    }

    closeMenu() {
        if (this.state.activeMenu) { 
            this.state.activeMenu.remove(); 
            this.state.activeMenu = null; 
        }
    }

    // ============================================================
    //  2. 資料載入
    // ============================================================

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
                // 若無資料，初始化為草稿
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId, 
                    year: this.state.year, 
                    month: this.state.month,
                    status: 'draft', 
                    assignments: {}
                };
                staffList.forEach(s => this.state.scheduleData.assignments[s.uid] = {});
                // 自動載入預班資料
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
                            // M_OFF 轉為 OFF (或保留，視貴單位邏輯)
                            newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                        });
                    }
                });
            }
            this.state.scheduleData.assignments = newAssignments;
            
            // 立即儲存重置狀態
            await ScheduleService.updateAllAssignments(this.state.currentUnitId, this.state.year, this.state.month, newAssignments);
            
            this.renderGrid();
            this.updateScoreDisplay();
            if(showConfirm) alert("✅ 已重置為預班初始狀態。");
        } catch(e) { 
            console.error(e); 
            alert("重置失敗: " + e.message); 
        } finally { 
            if(loading) loading.style.display = 'none'; 
        }
    }

    // ============================================================
    //  3. 渲染與互動 (Grid & Menu)
    // ============================================================

    renderGrid() {
        // 呼叫規則引擎驗證當前狀態
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, 
            this.state.daysInMonth, 
            this.state.staffList, 
            this.state.unitSettings, 
            this.state.unitSettings?.rules
        );

        const container = document.getElementById('schedule-grid-container');
        // 傳入 isInteractive: true 代表這是主編輯區
        container.innerHTML = SchedulePageTemplate.renderGrid(this.state, validation, { isInteractive: true });
        
        this.bindMenu();
    }

    bindMenu() {
        document.querySelectorAll('.shift-cell').forEach(c => c.addEventListener('click', e => { 
            e.stopPropagation(); 
            // 傳入單位設定的班別列表
            this.openShiftMenu(c, this.state.unitSettings?.settings?.shifts || []); 
        }));
    }

    openShiftMenu(target, shifts) {
        this.closeMenu(); // 關閉舊的
        
        const menu = document.createElement('div');
        menu.className = 'shift-menu shadow rounded border bg-white';
        menu.style.position = 'absolute'; 
        menu.style.zIndex = '1000'; 
        menu.style.padding = '5px';
        
        const opts = [
            { code: '', name: '清除', color: 'transparent' }, 
            { code: 'OFF', name: '休假', color: '#e5e7eb' }, 
            ...shifts
        ];
        
        opts.forEach(s => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item p-1'; 
            item.style.cursor = 'pointer';
            item.innerHTML = `<span style="display:inline-block;width:15px;height:15px;background:${s.color};margin-right:5px;"></span> ${s.code}`;
            item.onclick = () => this.handleShiftSelect(target, s.code);
            menu.appendChild(item);
        });

        // 定位
        const rect = target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`; 
        menu.style.left = `${rect.left + window.scrollX}px`;
        
        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    async handleShiftSelect(cell, code) {
        this.closeMenu();
        const uid = cell.dataset.staffId;
        const day = cell.dataset.day;
        
        if (!this.state.scheduleData.assignments[uid]) this.state.scheduleData.assignments[uid] = {};
        
        // 更新本地狀態
        this.state.scheduleData.assignments[uid][day] = code;
        
        // 重新渲染與即時儲存
        this.renderGrid();
        await ScheduleService.updateShift(this.state.currentUnitId, this.state.year, this.state.month, uid, day, code);
        this.updateScoreDisplay();
    }

    // ============================================================
    //  4. 評分系統
    // ============================================================

    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;
        
        // 獲取預班需求以計算滿意度
        const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
        
        const result = ScoringService.calculate(scheduleData, staffList, unitSettings, preSchedule);
        this.state.scoreResult = result;
        
        const el = document.getElementById('score-display');
        if (el) {
            el.textContent = result.totalScore;
            el.className = `h4 mb-0 fw-bold ${result.totalScore>=90?'text-success':(result.totalScore>=70?'text-primary':'text-danger')}`;
        }
    }

    showScoreDetails() {
        if (!this.state.scoreResult) return alert("尚未計算分數");
        document.getElementById('score-details-body').innerHTML = SchedulePageTemplate.renderScoreDetails(this.state.scoreResult);
        this.scoreModal.show();
    }

    // ============================================================
    //  5. AI 智慧排班 (核心修正部分)
    // ============================================================

    async runMultiVersionAI() {
        if (!confirm("確定執行智慧排班？\n系統將計算 3 個版本供您選擇 (約需 5-10 秒)。")) return;
        
        const loading = document.getElementById('loading-indicator');
        if (loading) loading.style.display = 'block';
        
        // 讓 UI 有時間渲染 Loading 遮罩
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            
            // 深拷貝當前狀態作為 AI 起點 (保留已鎖定的預班)
            // 這裡非常重要：確保 currentData 是乾淨的，不會被後續的運算修改到原始 state
            const currentData = JSON.parse(JSON.stringify(this.state.scheduleData));
            
            this.generatedVersions = [];

            for (let i = 1; i <= 3; i++) {
                console.log(`正在計算版本 ${i}...`);
                
                // 每次跑都使用 currentData 的副本，確保三個版本是平行宇宙，互不影響
                const inputData = JSON.parse(JSON.stringify(currentData));
                
                // 呼叫 AI (AutoScheduler)
                const result = await AutoScheduler.run(
                    { year: this.state.year, month: this.state.month }, 
                    this.state.staffList, 
                    this.state.unitSettings, 
                    preSchedule
                );
                
                if (result && result.assignments) {
                    // 計算該版本的評分
                    const scoreRes = ScoringService.calculate(
                        { assignments: result.assignments, year: this.state.year, month: this.state.month }, 
                        this.state.staffList, 
                        this.state.unitSettings, 
                        preSchedule
                    );
                    this.generatedVersions.push({ 
                        id: i, 
                        assignments: result.assignments, 
                        logs: result.logs, 
                        score: scoreRes 
                    });
                }
                
                // 每個版本計算間稍作休息，釋放 UI 執行緒
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (this.generatedVersions.length === 0) {
                throw new Error("AI 無法產生有效的排班結果，請檢查規則設定是否過於嚴苛。");
            }

            this.renderVersionsModal();
            this.versionsModal.show();

        } catch (e) { 
            console.error("AI Schedule Error:", e);
            alert("演算失敗: " + e.message); 
        } finally { 
            if (loading) loading.style.display = 'none'; 
        }
    }

    renderVersionsModal() {
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;
            
            const missing = this.calculateMissingShifts(v.assignments);
            
            // 驗證該版本
            const validation = RuleEngine.validateAll(
                { year: this.state.year, month: this.state.month, assignments: v.assignments },
                this.state.daysInMonth, 
                this.state.staffList, 
                this.state.unitSettings, 
                this.state.unitSettings?.rules
            );

            // 建立 UI HTML
            const scoreBadge = v.score.passed 
                ? `<span class="badge bg-success fs-5">${v.score.totalScore} 分</span>` 
                : `<span class="badge bg-danger fs-5">不合格 (${v.score.totalScore})</span>`;
            
            const infoHtml = `
                <div class="alert alert-light border d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center gap-3">
                        ${scoreBadge}
                        <div class="small text-muted border-start ps-3">
                            <div>公平性: ${v.score.details.fairness.score.toFixed(0)}</div>
                            <div>滿意度: ${v.score.details.satisfaction.score.toFixed(0)}</div>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="window.routerPage.applyVersion(${idx})">套用此版本</button>
                </div>`;
            
            const poolHtml = SchedulePageTemplate.renderMissingPool(missing);
            
            // 渲染唯讀 Grid，但允許 Drop (isDropZone: true)
            const fakeCtx = { ...this.state, scheduleData: { assignments: v.assignments } };
            const gridHtml = `<div style="max-height:60vh; overflow:auto;">
                ${SchedulePageTemplate.renderGrid(fakeCtx, validation, { isInteractive: false, isDropZone: true, versionIdx: idx })}
            </div>`;
            
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

    // ============================================================
    //  6. 版本選用與拖放
    // ============================================================

    handleDragStart(e, shift) { 
        e.dataTransfer.setData("text/plain", shift); 
        this.draggedShift = shift; 
    }
    
    handleDrop(e, uid, day, versionIdx) {
        e.preventDefault();
        const shift = e.dataTransfer.getData("text/plain") || this.draggedShift;
        if(!shift) return;
        
        const targetVersion = this.generatedVersions[versionIdx];
        if(!targetVersion.assignments[uid]) targetVersion.assignments[uid] = {};
        
        // 修改暫存版本
        targetVersion.assignments[uid][day] = shift;
        
        // 重新渲染該版本的 Modal 內容
        this.renderVersionsModal(); 
    }

    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        if (!selected) return;

        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            // 1. 更新本地狀態 (深拷貝)
            this.state.scheduleData.assignments = JSON.parse(JSON.stringify(selected.assignments));

            // 2. 寫入資料庫
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                selected.assignments
            );

            this.versionsModal.hide();
            this.renderGrid();
            this.updateScoreDisplay();
            
            alert(`✅ 已成功套用版本 ${selected.id} 並儲存至資料庫。`);
        } catch(e) {
            console.error(e);
            alert("套用失敗: " + e.message);
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // ============================================================
    //  7. 其他功能 (刪除/發布)
    // ============================================================

    async deleteStaff(uid) {
        if(!confirm("從本月班表中移除此人員？")) return;
        
        delete this.state.scheduleData.assignments[uid];
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
            badge.className = 'badge bg-success ms-2'; 
            badge.textContent = '已發布';
            if(btn) { 
                btn.textContent = '撤回班表'; 
                btn.classList.replace('btn-success', 'btn-warning'); 
            }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2'; 
            badge.textContent = '草稿';
            if(btn) { 
                btn.textContent = '發布班表'; 
                btn.classList.replace('btn-warning', 'btn-success'); 
            }
        }
    }
}
