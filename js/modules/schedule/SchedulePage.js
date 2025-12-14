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
            usersData: {}, // ✅ 新增：員工對照表 (Map) 避免讀取 undefined 錯誤
            scheduleData: null, 
            daysInMonth: 0,
            scoreResult: null,
            isLoading: false,
            isSaving: false
        };
        
        this.versionsModal = null; 
        this.scoreModal = null;
        this.generatedVersions = [];
        this.draggedShift = null; 
        
        // 綁定方法
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
        this.handleKeyboardShortcuts = this.handleKeyboardShortcuts.bind(this);
        
        // 排班控制
        this.shouldStopScheduling = false;
        this.progressBar = null;
        
        // 效能優化: 防抖
        this.saveDebounceTimer = null;
        this.scoreDebounceTimer = null;
    }

    async render() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.state.currentUnitId = params.get('unitId');
        this.state.year = parseInt(params.get('year'));
        this.state.month = parseInt(params.get('month'));

        if(!this.state.currentUnitId || !this.state.year || !this.state.month) {
            return `<div class="alert alert-danger m-4">
                <i class="fas fa-exclamation-triangle"></i> 無效的參數，請從列表頁進入。
            </div>`;
        }

        return SchedulePageTemplate.renderLayout(this.state.year, this.state.month);
    }

    async afterRender() {
        // 初始化 Modal
        const vModalEl = document.getElementById('versions-modal');
        if (vModalEl) this.versionsModal = new bootstrap.Modal(vModalEl);
        
        const sModalEl = document.getElementById('score-modal');
        if (sModalEl) this.scoreModal = new bootstrap.Modal(sModalEl);
        
        // 全局引用
        window.routerPage = this;

        // 綁定事件
        this.bindEvents();
        
        // 載入數據
        await this.loadData();
    }

    // ============================================================
    //  事件綁定
    // ============================================================
    
    bindEvents() {
        document.getElementById('btn-auto-schedule')?.addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear')?.addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-validate')?.addEventListener('click', () => this.validateSchedule());
        document.getElementById('btn-publish')?.addEventListener('click', () => this.togglePublish());
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportSchedule());
        
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);
        
        document.removeEventListener('keydown', this.handleKeyboardShortcuts);
        document.addEventListener('keydown', this.handleKeyboardShortcuts);
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) {
            this.closeMenu();
        }
    }

    handleKeyboardShortcuts(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.quickSave();
        }
        if (e.key === 'Escape') {
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
    //  數據載入 (核心修正區)
    // ============================================================
    
    async loadData() {
        if (this.state.isLoading) return;
        
        this.state.isLoading = true;
        const container = document.getElementById('schedule-grid-container');
        const loading = document.getElementById('loading-indicator');
        
        if(loading) loading.style.display = 'block';
        container.innerHTML = `
            <div class="text-center p-5">
                <div class="spinner-border text-primary mb-3" role="status"></div>
                <p>資料載入中...</p>
            </div>
        `;

        try {
            // 並行載入數據
            const [unit, staffList, schedule] = await Promise.all([
                UnitService.getUnitById(this.state.currentUnitId),
                userService.getUnitStaff(this.state.currentUnitId),
                ScheduleService.getSchedule(this.state.currentUnitId, this.state.year, this.state.month)
            ]);

            if (!unit) throw new Error('找不到該單位資料');

            this.state.unitSettings = unit;
            this.state.staffList = staffList || [];
            
            // ✅ 修正 1: 建立 UID 對照表 (Users Map)
            // 這是避免 Cannot read properties of undefined 的關鍵
            this.state.usersData = {};
            this.state.staffList.forEach(s => {
                if(s.uid) this.state.usersData[s.uid] = s;
            });

            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            // 處理班表數據
            if (!schedule) {
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId, 
                    year: this.state.year, 
                    month: this.state.month,
                    status: 'draft', 
                    assignments: {},
                    metadata: { createdAt: new Date().toISOString() }
                };
                staffList.forEach(s => this.state.scheduleData.assignments[s.uid] = {});
                await this.resetToPreSchedule(false);
            } else {
                this.state.scheduleData = schedule;
                
                // ✅ 修正 2: 清理幽靈資料 (Ghost Data Cleanup)
                // 移除 assignments 中存在，但 staffList 中不存在的 ID
                if (this.state.scheduleData.assignments) {
                    const validUids = new Set(this.state.staffList.map(s => s.uid));
                    Object.keys(this.state.scheduleData.assignments).forEach(uid => {
                        if (!validUids.has(uid)) {
                            console.warn(`⚠️ 移除無效員工 ID: ${uid}`);
                            // 不直接刪除資料庫，但在前端渲染時忽略它，避免崩潰
                            delete this.state.scheduleData.assignments[uid];
                        }
                    });
                }
                
                this.renderGrid();
                this.updateStatusBadge();
                await this.updateScoreDisplay();
            }
            
            this.updateStatistics();
            
        } catch (error) {
            console.error('載入失敗:', error);
            container.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="fas fa-exclamation-circle"></i> 載入失敗: ${error.message}
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="location.reload()">重新載入</button>
                </div>
            `;
        } finally {
            this.state.isLoading = false;
            if(loading) loading.style.display = 'none';
        }
    }

    // ============================================================
    //  重置為預班
    // ============================================================
    
    async resetToPreSchedule(showConfirm = true) {
        if(showConfirm && !confirm("確定重置？\n這將清除所有已排的班別，並重新載入預班資料。")) return;
        
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            const preSchedule = await PreScheduleService.getPreSchedule(
                this.state.currentUnitId, this.state.year, this.state.month
            );
            
            const newAssignments = {};
            this.state.staffList.forEach(s => { newAssignments[s.uid] = {}; });

            if (preSchedule && preSchedule.submissions) {
                Object.entries(preSchedule.submissions).forEach(([uid, sub]) => {
                    // 只處理仍在職的員工
                    if(sub.wishes && newAssignments[uid]) {
                        Object.entries(sub.wishes).forEach(([d, w]) => {
                            newAssignments[uid][d] = (w === 'M_OFF' ? 'OFF' : w);
                        });
                    }
                });
            }
            
            this.state.scheduleData.assignments = newAssignments;
            if (!this.state.scheduleData.metadata) this.state.scheduleData.metadata = {};
            this.state.scheduleData.metadata.lastModified = new Date().toISOString();
            
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, this.state.year, this.state.month, newAssignments
            );
            
            this.renderGrid();
            await this.updateScoreDisplay();
            this.updateStatistics();
            
            if(showConfirm) this.showNotification('✅ 已重置為預班初始狀態', 'success');
        } catch(e) { 
            console.error(e); 
            // 忽略無效預班表 ID 的錯誤，因為那不影響重置 (如果沒預班就只是全空)
            if (!e.message.includes('無效的預班表 ID')) {
                this.showNotification('❌ 重置失敗: ' + e.message, 'danger');
            } else {
                this.renderGrid(); // 即使失敗也要重繪空的
            }
        } finally { 
            if(loading) loading.style.display = 'none'; 
        }
    }

    // ============================================================
    //  渲染班表
    // ============================================================
    
    renderGrid() {
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, 
            this.state.daysInMonth, 
            this.state.staffList, 
            this.state.unitSettings, 
            this.state.unitSettings?.rules
        );
        
        const container = document.getElementById('schedule-grid-container');
        
        // ✅ 修正 3: 將 usersData 傳入 Template (假設 Template 有支援，或者透過 state 存取)
        // 為了相容性，我們確保 this.state 裡面的 usersData 是完整的
        container.innerHTML = SchedulePageTemplate.renderGrid(
            this.state, // 這裡包含了 usersData
            validation, 
            { isInteractive: true }
        );
        
        this.bindMenu();
        this.updateStatistics();
    }

    bindMenu() {
        document.querySelectorAll('.shift-cell').forEach(cell => {
            cell.addEventListener('click', e => { 
                e.stopPropagation(); 
                this.openShiftMenu(cell, this.state.unitSettings?.settings?.shifts || []); 
            });
        });
    }

    openShiftMenu(target, shifts) {
        this.closeMenu();
        const menu = document.createElement('div');
        menu.className = 'shift-menu shadow-lg rounded border bg-white';
        menu.style.cssText = 'position: absolute; z-index: 1000; padding: 8px; min-width: 150px;';
        
        const opts = [
            { code: '', name: '清除', color: 'transparent', icon: 'fa-eraser' }, 
            { code: 'OFF', name: '休假', color: '#e5e7eb', icon: 'fa-calendar-times' }, 
            ...shifts.map(s => ({ ...s, icon: 'fa-briefcase' }))
        ];
        
        opts.forEach(s => {
            const item = document.createElement('div');
            item.className = 'shift-menu-item p-2 rounded';
            item.style.cssText = 'cursor: pointer; transition: background 0.2s;';
            item.innerHTML = `
                <span style="display:inline-block;width:20px;height:20px;background:${s.color};margin-right:8px;border-radius:3px;border:1px solid #ddd;"></span>
                <strong class="me-2">${s.code || '清除'}</strong>
                ${s.name && s.code ? `<small class="text-muted">${s.name}</small>` : ''}
            `;
            item.onmouseover = () => item.style.background = '#f0f0f0';
            item.onmouseout = () => item.style.background = 'transparent';
            item.onclick = () => this.handleShiftSelect(target, s.code);
            menu.appendChild(item);
        });
        
        const rect = target.getBoundingClientRect();
        const menuHeight = opts.length * 40; 
        if (rect.bottom + menuHeight > window.innerHeight) {
            menu.style.top = `${rect.top + window.scrollY - menuHeight}px`;
        } else {
            menu.style.top = `${rect.bottom + window.scrollY}px`;
        }
        menu.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(menu);
        this.state.activeMenu = menu;
    }

    async handleShiftSelect(cell, code) {
        this.closeMenu();
        const uid = cell.dataset.staffId;
        const day = cell.dataset.day;
        
        if (!this.state.scheduleData.assignments[uid]) this.state.scheduleData.assignments[uid] = {};
        
        if (code === '') delete this.state.scheduleData.assignments[uid][day];
        else this.state.scheduleData.assignments[uid][day] = code;
        
        this.renderGrid();
        this.debounceSave(uid, day, code);
        this.debounceScoreUpdate();
    }

    debounceSave(uid, day, code) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = setTimeout(async () => {
            try {
                await ScheduleService.updateShift(
                    this.state.currentUnitId, this.state.year, this.state.month, uid, day, code
                );
            } catch (e) {
                console.error('自動儲存失敗:', e);
                this.showNotification('⚠️ 自動儲存失敗', 'warning');
            }
        }, 500);
    }

    debounceScoreUpdate() {
        clearTimeout(this.scoreDebounceTimer);
        this.scoreDebounceTimer = setTimeout(() => this.updateScoreDisplay(), 800);
    }

    async quickSave() {
        if (this.state.isSaving) return;
        this.state.isSaving = true;
        this.showNotification('💾 正在儲存...', 'info');
        try {
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, this.state.year, this.state.month, this.state.scheduleData.assignments
            );
            this.showNotification('✅ 儲存成功', 'success');
        } catch (e) {
            this.showNotification('❌ 儲存失敗: ' + e.message, 'danger');
        } finally {
            this.state.isSaving = false;
        }
    }

    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        if (!scheduleData || !scheduleData.assignments) return;
        try {
            // 這裡如果 PreSchedule 失敗，我們可以給一個空物件避免卡死
            let preSchedule = {};
            try {
                preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, year, month);
            } catch(e) { console.warn("無法取得預班資料計算分數"); }

            const result = ScoringService.calculate(scheduleData, staffList, unitSettings, preSchedule);
            this.state.scoreResult = result;
            
            const el = document.getElementById('score-display');
            if (el) {
                el.textContent = result.totalScore;
                el.className = `h4 mb-0 fw-bold ${result.totalScore >= 90 ? 'text-success' : (result.totalScore >= 70 ? 'text-primary' : 'text-danger')}`;
            }
            const detailEl = document.getElementById('score-preview');
            if (detailEl) {
                detailEl.innerHTML = `<small class="text-muted d-block mt-1">公平: ${result.details.fairness.score.toFixed(0)} | 滿意: ${result.details.satisfaction.score.toFixed(0)}</small>`;
            }
        } catch (e) { console.error('分數計算失敗:', e); }
    }

    showScoreDetails() {
        if (!this.state.scoreResult) {
            this.showNotification('⚠️ 尚未計算分數', 'warning');
            return;
        }
        document.getElementById('score-details-body').innerHTML = SchedulePageTemplate.renderScoreDetails(this.state.scoreResult);
        if(this.scoreModal) this.scoreModal.show();
    }

    updateStatistics() {
        const stats = this.calculateStatistics();
        const container = document.getElementById('schedule-statistics');
        if (!container) return;
        container.innerHTML = `
            <div class="row g-2 small">
                <div class="col-auto"><span class="badge bg-light text-dark border"><i class="fas fa-users"></i> ${stats.totalStaff} 人</span></div>
                <div class="col-auto"><span class="badge bg-success"><i class="fas fa-check"></i> 已排: ${stats.filledDays}</span></div>
                <div class="col-auto"><span class="badge bg-warning text-dark"><i class="fas fa-clock"></i> 未排: ${stats.emptyDays}</span></div>
                <div class="col-auto"><span class="badge bg-danger"><i class="fas fa-exclamation-triangle"></i> 違規: ${stats.violations}</span></div>
                <div class="col-auto"><span class="badge bg-info"><i class="fas fa-percentage"></i> 完成: ${stats.completeness}%</span></div>
            </div>`;
    }

    calculateStatistics() {
        const totalCells = this.state.staffList.length * this.state.daysInMonth;
        let filledDays = 0;
        let violations = 0;
        
        Object.values(this.state.scheduleData.assignments || {}).forEach(row => {
            Object.values(row).forEach(shift => { if (shift && shift !== 'OFF') filledDays++; });
        });
        
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, this.state.daysInMonth, this.state.staffList, this.state.unitSettings, this.state.unitSettings?.rules
        );
        
        if (validation && validation.staffErrors) {
            Object.values(validation.staffErrors).forEach(errors => {
                Object.values(errors.errors || {}).forEach(errorList => { violations += errorList.length; });
            });
        }
        
        return {
            totalStaff: this.state.staffList.length,
            filledDays,
            emptyDays: totalCells - filledDays,
            violations,
            completeness: totalCells > 0 ? Math.round((filledDays / totalCells) * 100) : 0
        };
    }

    validateSchedule() {
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, this.state.daysInMonth, this.state.staffList, this.state.unitSettings, this.state.unitSettings?.rules
        );
        let errorCount = 0;
        if (validation && validation.staffErrors) {
            Object.values(validation.staffErrors).forEach(errors => {
                Object.values(errors.errors || {}).forEach(errorList => { errorCount += errorList.length; });
            });
        }
        this.renderGrid();
        if (errorCount === 0) this.showNotification('✅ 驗證通過，無違規項目', 'success');
        else this.showNotification(`⚠️ 發現 ${errorCount} 個違規項目，請檢查紅色標記處`, 'warning');
    }

    async runMultiVersionAI() {
        const versionCount = 3;
        if (!confirm(`確定執行智慧排班？\n這將計算 ${versionCount} 個版本供您選擇。`)) return;
        
        const loading = document.getElementById('loading-indicator');
        this.progressBar = this.createProgressBar();
        this.shouldStopScheduling = false;
        loading.style.display = 'block';
        
        try {
            let preSchedule = {};
            try {
                preSchedule = await PreScheduleService.getPreSchedule(this.state.currentUnitId, this.state.year, this.state.month);
            } catch(e) { console.warn("AI 排班無法讀取預班，將忽略偏好"); }
            
            this.generatedVersions = [];
            const startTime = Date.now();
            
            for (let i = 1; i <= versionCount; i++) {
                if (this.shouldStopScheduling) break;
                
                this.progressBar.setText(`正在計算版本 ${i}/${versionCount}...`);
                this.progressBar.setVersion(i, versionCount);
                
                const currentData = { 
                    ...this.state.scheduleData,
                    onProgress: (info) => {
                        this.progressBar.setProgress(info.progress);
                        this.progressBar.setText(`版本 ${i} - Day ${info.currentDay} (${info.progress}%)`);
                    },
                    shouldStop: () => this.shouldStopScheduling
                };
                
                const versionStartTime = Date.now();
                const result = await AutoScheduler.run(currentData, this.state.staffList, this.state.unitSettings, preSchedule);
                const versionTime = ((Date.now() - versionStartTime) / 1000).toFixed(1);
                
                if (result && result.assignments) {
                    const scoreRes = ScoringService.calculate(
                        { assignments: result.assignments, year: this.state.year, month: this.state.month }, 
                        this.state.staffList, this.state.unitSettings, preSchedule
                    );
                    this.generatedVersions.push({ 
                        id: i, assignments: result.assignments, logs: result.logs || [], 
                        score: scoreRes, computeTime: versionTime
                    });
                }
            }

            if (this.generatedVersions.length === 0) throw new Error("無法產生有效的排班結果。");

            this.generatedVersions.sort((a, b) => b.score.totalScore - a.score.totalScore);
            console.log(`✅ 排班完成，共耗時 ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`);

            this.renderVersionsModal();
            if(this.versionsModal) this.versionsModal.show();
            
        } catch (e) { 
            console.error("AI Schedule Error:", e);
            this.showNotification('❌ 演算失敗: ' + e.message, 'danger');
        } finally { 
            if (this.progressBar) { this.progressBar.remove(); this.progressBar = null; }
            loading.style.display = 'none'; 
        }
    }

    createProgressBar() {
        const container = document.createElement('div');
        container.className = 'position-fixed top-50 start-50 translate-middle';
        container.style.zIndex = '9999';
        container.innerHTML = `
            <div class="card shadow-lg" style="min-width: 450px;">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-3">
                        <div class="spinner-border text-primary me-3" role="status"></div>
                        <div class="flex-grow-1"><h6 class="mb-0 fw-bold">AI 智慧排班中</h6><p class="mb-0 small text-muted" id="progress-text">初始化中...</p></div>
                    </div>
                    <div class="mb-2">
                        <div class="progress" style="height: 25px;">
                            <div id="progress-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%">0%</div>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger w-100" id="btn-stop-scheduling">中斷排班</button>
                </div>
            </div>`;
        document.body.appendChild(container);
        document.getElementById('btn-stop-scheduling').addEventListener('click', () => {
            if (confirm("確定要中斷？")) {
                this.shouldStopScheduling = true;
                document.getElementById('progress-text').textContent = '正在中斷...';
            }
        });
        return {
            setProgress: (p) => { const b = document.getElementById('progress-bar'); b.style.width = p+'%'; b.textContent = p+'%'; },
            setText: (t) => { document.getElementById('progress-text').textContent = t; },
            setVersion: () => {}, // 簡化
            remove: () => container.remove()
        };
    }

    renderVersionsModal() {
        const comparisonContainer = document.getElementById('versions-comparison');
        if (comparisonContainer) comparisonContainer.innerHTML = this.renderVersionComparison();
        
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;
            const validation = RuleEngine.validateAll(
                { year: this.state.year, month: this.state.month, assignments: v.assignments },
                this.state.daysInMonth, this.state.staffList, this.state.unitSettings, this.state.unitSettings?.rules
            );
            
            // 使用 SchedulePageTemplate 渲染，注意傳入 usersData
            const fakeCtx = { ...this.state, scheduleData: { assignments: v.assignments } };
            tabPane.innerHTML = `
                <div class="mb-3 d-flex justify-content-between">
                    <h5>版本 ${v.id} (分數: ${v.score.totalScore})</h5>
                    <button class="btn btn-primary btn-sm" onclick="window.routerPage.applyVersion(${idx})">套用</button>
                </div>
                <div style="max-height:60vh; overflow:auto;">
                    ${SchedulePageTemplate.renderGrid(fakeCtx, validation, { isInteractive: false })}
                </div>
            `;
        });
    }

    renderVersionComparison() {
        return `<table class="table table-sm text-center">
            <thead><tr><th>版本</th><th>總分</th><th>操作</th></tr></thead>
            <tbody>${this.generatedVersions.map((v, i) => `
                <tr><td>v${v.id}</td><td>${v.score.totalScore}</td><td><button class="btn btn-link btn-sm" onclick="window.routerPage.applyVersion(${i})">選用</button></td></tr>
            `).join('')}</tbody></table>`;
    }

    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        if (!selected) return;
        this.state.scheduleData.assignments = JSON.parse(JSON.stringify(selected.assignments));
        this.state.scheduleData.metadata.aiGenerated = true;
        this.state.scheduleData.metadata.totalScore = selected.score.totalScore;

        await ScheduleService.updateAllAssignments(
            this.state.currentUnitId, this.state.year, this.state.month, selected.assignments
        );

        if(this.versionsModal) this.versionsModal.hide();
        this.renderGrid();
        await this.updateScoreDisplay();
        this.showNotification(`✅ 已套用版本 ${selected.id}`, 'success');
    }

    async exportSchedule() {
        try {
            const data = {
                unit: this.state.unitSettings.unitName,
                year: this.state.year,
                month: this.state.month,
                staff: this.state.staffList.map(s => ({
                    uid: s.uid, name: s.displayName || s.email, shifts: this.state.scheduleData.assignments[s.uid] || {}
                })),
                score: this.state.scoreResult
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `schedule_${this.state.year}_${this.state.month}.json`;
            a.click(); URL.revokeObjectURL(url);
            this.showNotification('✅ 匯出成功', 'success');
        } catch (e) { this.showNotification('❌ 匯出失敗', 'danger'); }
    }

    async togglePublish() {
        if(!this.state.scheduleData) return;
        const newStatus = this.state.scheduleData.status === 'published' ? 'draft' : 'published';
        if(!confirm(`確定要${newStatus==='published'?'發布':'撤回'}班表嗎？`)) return;
        try {
            await ScheduleService.updateStatus(this.state.currentUnitId, this.state.year, this.state.month, newStatus);
            this.state.scheduleData.status = newStatus;
            this.updateStatusBadge();
            this.showNotification(`✅ 班表已${newStatus==='published'?'發布':'撤回'}`, 'success');
        } catch(e) { this.showNotification('❌ 操作失敗', 'danger'); }
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        const btn = document.getElementById('btn-publish');
        if(!badge) return;
        if (this.state.scheduleData.status === 'published') {
            badge.className = 'badge bg-success ms-2'; badge.textContent = '已發布';
            if(btn) { btn.textContent = '撤回班表'; btn.classList.replace('btn-success', 'btn-warning'); }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2'; badge.textContent = '草稿';
            if(btn) { btn.textContent = '發布班表'; btn.classList.replace('btn-warning', 'btn-success'); }
        }
    }

    showNotification(message, type = 'info') {
        const old = document.getElementById('schedule-notification');
        if (old) old.remove();
        const notif = document.createElement('div');
        notif.id = 'schedule-notification';
        notif.className = `alert alert-${type} alert-dismissible fade show position-fixed shadow-lg`;
        notif.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px;';
        notif.innerHTML = `${message} <button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(notif);
        setTimeout(() => { if (notif.parentNode) notif.remove(); }, 3500);
    }
}
