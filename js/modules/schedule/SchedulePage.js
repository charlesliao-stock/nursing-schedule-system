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
        this.versionsModal = new bootstrap.Modal(document.getElementById('versions-modal'));
        this.scoreModal = new bootstrap.Modal(document.getElementById('score-modal'));
        
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
        // 按鈕事件
        document.getElementById('btn-auto-schedule')?.addEventListener('click', () => this.runMultiVersionAI());
        document.getElementById('btn-clear')?.addEventListener('click', () => this.resetToPreSchedule());
        document.getElementById('btn-validate')?.addEventListener('click', () => this.validateSchedule());
        document.getElementById('btn-publish')?.addEventListener('click', () => this.togglePublish());
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportSchedule());
        
        // 全局點擊 (關閉選單)
        document.removeEventListener('click', this.handleGlobalClick); 
        document.addEventListener('click', this.handleGlobalClick);
        
        // 鍵盤快捷鍵
        document.removeEventListener('keydown', this.handleKeyboardShortcuts);
        document.addEventListener('keydown', this.handleKeyboardShortcuts);
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.shift-cell') && this.state.activeMenu) {
            this.closeMenu();
        }
    }

    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + S: 快速儲存
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.quickSave();
        }
        
        // Esc: 關閉選單
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
    //  數據載入
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

            if (!unit) {
                throw new Error('找不到該單位資料');
            }

            this.state.unitSettings = unit;
            this.state.staffList = staffList || [];
            this.state.daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            
            // 處理班表數據
            if (!schedule) {
                this.state.scheduleData = {
                    unitId: this.state.currentUnitId, 
                    year: this.state.year, 
                    month: this.state.month,
                    status: 'draft', 
                    assignments: {},
                    metadata: {
                        createdAt: new Date().toISOString(),
                        createdBy: null,
                        lastModified: new Date().toISOString()
                    }
                };
                
                // 初始化所有員工的班表
                staffList.forEach(s => this.state.scheduleData.assignments[s.uid] = {});
                
                await this.resetToPreSchedule(false);
            } else {
                this.state.scheduleData = schedule;
                this.renderGrid();
                this.updateStatusBadge();
                await this.updateScoreDisplay();
            }
            
            // 顯示統計資訊
            this.updateStatistics();
            
        } catch (error) {
            console.error('載入失敗:', error);
            container.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="fas fa-exclamation-circle"></i> 載入失敗: ${error.message}
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="location.reload()">
                        重新載入
                    </button>
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
        if(showConfirm && !confirm("確定重置？\n這將清除所有已排的班別，並重新載入預班資料。")) {
            return;
        }
        
        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            const preSchedule = await PreScheduleService.getPreSchedule(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month
            );
            
            const newAssignments = {};
            this.state.staffList.forEach(s => { 
                newAssignments[s.uid] = {}; 
            });

            // 載入預班資料
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
            
            // 更新 metadata
            if (!this.state.scheduleData.metadata) {
                this.state.scheduleData.metadata = {};
            }
            this.state.scheduleData.metadata.lastModified = new Date().toISOString();
            this.state.scheduleData.metadata.resetAt = new Date().toISOString();
            
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                newAssignments
            );
            
            this.renderGrid();
            await this.updateScoreDisplay();
            this.updateStatistics();
            
            if(showConfirm) {
                this.showNotification('✅ 已重置為預班初始狀態', 'success');
            }
        } catch(e) { 
            console.error(e); 
            this.showNotification('❌ 重置失敗: ' + e.message, 'danger');
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
        container.innerHTML = SchedulePageTemplate.renderGrid(
            this.state, 
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
                <i class="fas ${s.icon} me-1"></i>
                <strong>${s.code || '清除'}</strong>
                ${s.name && s.code ? `<small class="text-muted ms-1">${s.name}</small>` : ''}
            `;
            
            item.onmouseover = () => item.style.background = '#f0f0f0';
            item.onmouseout = () => item.style.background = 'transparent';
            item.onclick = () => this.handleShiftSelect(target, s.code);
            
            menu.appendChild(item);
        });
        
        // 定位選單
        const rect = target.getBoundingClientRect();
        const menuHeight = opts.length * 40; // 估計高度
        
        // 判斷是否超出視窗下方
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
        
        if (!this.state.scheduleData.assignments[uid]) {
            this.state.scheduleData.assignments[uid] = {};
        }
        
        // 更新本地狀態
        if (code === '') {
            delete this.state.scheduleData.assignments[uid][day];
        } else {
            this.state.scheduleData.assignments[uid][day] = code;
        }
        
        // 立即重繪 (視覺反饋)
        this.renderGrid();
        
        // 防抖儲存 (避免頻繁寫入資料庫)
        this.debounceSave(uid, day, code);
        
        // 防抖更新分數
        this.debounceScoreUpdate();
    }

    // ============================================================
    //  防抖機制
    // ============================================================
    
    debounceSave(uid, day, code) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = setTimeout(async () => {
            try {
                await ScheduleService.updateShift(
                    this.state.currentUnitId, 
                    this.state.year, 
                    this.state.month, 
                    uid, 
                    day, 
                    code
                );
                console.log('✅ 自動儲存完成');
            } catch (e) {
                console.error('自動儲存失敗:', e);
                this.showNotification('⚠️ 自動儲存失敗', 'warning');
            }
        }, 500); // 500ms 後儲存
    }

    debounceScoreUpdate() {
        clearTimeout(this.scoreDebounceTimer);
        this.scoreDebounceTimer = setTimeout(() => {
            this.updateScoreDisplay();
        }, 800); // 800ms 後更新分數
    }

    // ============================================================
    //  快速儲存 (Ctrl+S)
    // ============================================================
    
    async quickSave() {
        if (this.state.isSaving) return;
        
        this.state.isSaving = true;
        this.showNotification('💾 正在儲存...', 'info');
        
        try {
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                this.state.scheduleData.assignments
            );
            this.showNotification('✅ 儲存成功', 'success');
        } catch (e) {
            this.showNotification('❌ 儲存失敗: ' + e.message, 'danger');
        } finally {
            this.state.isSaving = false;
        }
    }

    // ============================================================
    //  分數計算與顯示
    // ============================================================
    
    async updateScoreDisplay() {
        const { scheduleData, staffList, unitSettings, year, month } = this.state;
        
        if (!scheduleData || !scheduleData.assignments) return;
        
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(
                this.state.currentUnitId, 
                year, 
                month
            );
            
            const result = ScoringService.calculate(
                scheduleData, 
                staffList, 
                unitSettings, 
                preSchedule
            );
            
            this.state.scoreResult = result;
            
            const el = document.getElementById('score-display');
            if (el) {
                el.textContent = result.totalScore;
                el.className = `h4 mb-0 fw-bold ${
                    result.totalScore >= 90 ? 'text-success' : 
                    (result.totalScore >= 70 ? 'text-primary' : 'text-danger')
                }`;
            }
            
            // 更新分數細項預覽
            const detailEl = document.getElementById('score-preview');
            if (detailEl) {
                detailEl.innerHTML = `
                    <small class="text-muted d-block mt-1">
                        公平性: ${result.details.fairness.score.toFixed(0)} | 
                        滿意度: ${result.details.satisfaction.score.toFixed(0)}
                    </small>
                `;
            }
        } catch (e) {
            console.error('分數計算失敗:', e);
        }
    }

    showScoreDetails() {
        if (!this.state.scoreResult) {
            this.showNotification('⚠️ 尚未計算分數', 'warning');
            return;
        }
        
        document.getElementById('score-details-body').innerHTML = 
            SchedulePageTemplate.renderScoreDetails(this.state.scoreResult);
        this.scoreModal.show();
    }

    // ============================================================
    //  統計資訊更新
    // ============================================================
    
    updateStatistics() {
        const stats = this.calculateStatistics();
        const container = document.getElementById('schedule-statistics');
        
        if (!container) return;
        
        container.innerHTML = `
            <div class="row g-2 small">
                <div class="col-auto">
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-users"></i> ${stats.totalStaff} 人
                    </span>
                </div>
                <div class="col-auto">
                    <span class="badge bg-success">
                        <i class="fas fa-check"></i> 已排: ${stats.filledDays}
                    </span>
                </div>
                <div class="col-auto">
                    <span class="badge bg-warning text-dark">
                        <i class="fas fa-clock"></i> 未排: ${stats.emptyDays}
                    </span>
                </div>
                <div class="col-auto">
                    <span class="badge bg-danger">
                        <i class="fas fa-exclamation-triangle"></i> 違規: ${stats.violations}
                    </span>
                </div>
                <div class="col-auto">
                    <span class="badge bg-info">
                        <i class="fas fa-percentage"></i> 完成度: ${stats.completeness}%
                    </span>
                </div>
            </div>
        `;
    }

    calculateStatistics() {
        const totalCells = this.state.staffList.length * this.state.daysInMonth;
        let filledDays = 0;
        let violations = 0;
        
        Object.values(this.state.scheduleData.assignments || {}).forEach(row => {
            Object.values(row).forEach(shift => {
                if (shift && shift !== 'OFF') filledDays++;
            });
        });
        
        // 計算違規數
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, 
            this.state.daysInMonth, 
            this.state.staffList, 
            this.state.unitSettings, 
            this.state.unitSettings?.rules
        );
        
        if (validation && validation.staffErrors) {
            Object.values(validation.staffErrors).forEach(errors => {
                Object.values(errors.errors || {}).forEach(errorList => {
                    violations += errorList.length;
                });
            });
        }
        
        const emptyDays = totalCells - filledDays;
        const completeness = Math.round((filledDays / totalCells) * 100);
        
        return {
            totalStaff: this.state.staffList.length,
            filledDays,
            emptyDays,
            violations,
            completeness
        };
    }

    // ============================================================
    //  驗證班表
    // ============================================================
    
    validateSchedule() {
        const validation = RuleEngine.validateAll(
            this.state.scheduleData, 
            this.state.daysInMonth, 
            this.state.staffList, 
            this.state.unitSettings, 
            this.state.unitSettings?.rules
        );
        
        let errorCount = 0;
        if (validation && validation.staffErrors) {
            Object.values(validation.staffErrors).forEach(errors => {
                Object.values(errors.errors || {}).forEach(errorList => {
                    errorCount += errorList.length;
                });
            });
        }
        
        this.renderGrid();
        
        if (errorCount === 0) {
            this.showNotification('✅ 驗證通過，無違規項目', 'success');
        } else {
            this.showNotification(`⚠️ 發現 ${errorCount} 個違規項目，請檢查紅色標記處`, 'warning');
        }
    }

    // ============================================================
    //  多版本 AI 排班 (優化版)
    // ============================================================
    
    async runMultiVersionAI() {
        const versionCount = 3;
        
        if (!confirm(`確定執行智慧排班？\n這將計算 ${versionCount} 個版本供您選擇。`)) {
            return;
        }
        
        const loading = document.getElementById('loading-indicator');
        this.progressBar = this.createProgressBar();
        this.shouldStopScheduling = false;
        loading.style.display = 'block';
        
        try {
            const preSchedule = await PreScheduleService.getPreSchedule(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month
            );
            
            this.generatedVersions = [];
            const startTime = Date.now();
            
            for (let i = 1; i <= versionCount; i++) {
                if (this.shouldStopScheduling) {
                    console.log('使用者中斷排班');
                    break;
                }
                
                this.progressBar.setText(`正在計算版本 ${i}/${versionCount}...`);
                this.progressBar.setVersion(i, versionCount);
                
                // 複製當前狀態作為起點，並加入回調
                const currentData = { 
                    ...this.state.scheduleData,
                    onProgress: (info) => {
                        this.progressBar.setProgress(info.progress);
                        this.progressBar.setText(
                            `版本 ${i}/${versionCount} - Day ${info.currentDay}/${info.totalDays} (${info.progress}%)`
                        );
                    },
                    shouldStop: () => this.shouldStopScheduling
                };
                
                const versionStartTime = Date.now();
                
                // 執行排班
                const result = await AutoScheduler.run(
                    currentData, 
                    this.state.staffList, 
                    this.state.unitSettings, 
                    preSchedule
                );
                
                const versionTime = ((Date.now() - versionStartTime) / 1000).toFixed(1);
                
                if (result && result.assignments) {
                    const scoreRes = ScoringService.calculate(
                        { 
                            assignments: result.assignments, 
                            year: this.state.year, 
                            month: this.state.month 
                        }, 
                        this.state.staffList, 
                        this.state.unitSettings, 
                        preSchedule
                    );
                    
                    this.generatedVersions.push({ 
                        id: i, 
                        assignments: result.assignments, 
                        logs: result.logs || [], 
                        adjustmentLogs: result.adjustmentLogs || [],
                        score: scoreRes,
                        computeTime: versionTime
                    });
                }
            }

            if (this.generatedVersions.length === 0) {
                throw new Error("無法產生有效的排班結果，請檢查規則設定或人力需求。");
            }

            // 按分數排序
            this.generatedVersions.sort((a, b) => 
                b.score.totalScore - a.score.totalScore
            );
            
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ 排班完成，共耗時 ${totalTime} 秒`);

            this.renderVersionsModal();
            this.versionsModal.show();
            
        } catch (e) { 
            console.error("AI Schedule Error:", e);
            this.showNotification('❌ 演算失敗: ' + e.message, 'danger');
        } finally { 
            if (this.progressBar) {
                this.progressBar.remove();
                this.progressBar = null;
            }
            loading.style.display = 'none'; 
        }
    }

    // ============================================================
    //  進度條 UI 元件 (增強版)
    // ============================================================
    
    createProgressBar() {
        const container = document.createElement('div');
        container.className = 'position-fixed top-50 start-50 translate-middle';
        container.style.zIndex = '9999';
        container.innerHTML = `
            <div class="card shadow-lg" style="min-width: 450px;">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-3">
                        <div class="spinner-border text-primary me-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <div class="flex-grow-1">
                            <h6 class="mb-0 fw-bold" id="progress-title">AI 智慧排班中</h6>
                            <p class="mb-0 small text-muted" id="progress-text">初始化中...</p>
                        </div>
                    </div>
                    
                    <div class="mb-2">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="small text-muted">整體進度</span>
                            <span class="small fw-bold" id="progress-percent">0%</span>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div id="progress-bar" 
                                 class="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                                 style="width: 0%; font-size: 14px; line-height: 25px;">0%</div>
                        </div>
                    </div>
                    
                    <div class="mb-3" id="version-progress" style="display:none;">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="small text-muted">版本進度</span>
                            <span class="small" id="version-info">版本 1/3</span>
                        </div>
                        <div class="progress" style="height: 5px;">
                            <div id="version-bar" class="progress-bar bg-success" style="width: 33%;"></div>
                        </div>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted" id="progress-stats">準備中...</small>
                        <button class="btn btn-sm btn-outline-danger" id="btn-stop-scheduling">
                            <i class="fas fa-stop"></i> 中斷
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        
        // 綁定中斷按鈕
        document.getElementById('btn-stop-scheduling').addEventListener('click', () => {
            if (confirm("確定要中斷排班嗎？\n已完成的版本將會保留。")) {
                this.shouldStopScheduling = true;
                document.getElementById('progress-text').textContent = '正在中斷...';
            }
        });
        
        return {
            setProgress: (percent) => {
                const bar = document.getElementById('progress-bar');
                const percentEl = document.getElementById('progress-percent');
                bar.style.width = percent + '%';
                bar.textContent = percent + '%';
                if (percentEl) percentEl.textContent = percent + '%';
            },
            setText: (text) => {
                const el = document.getElementById('progress-text');
                if (el) el.textContent = text;
            },
            setVersion: (current, total) => {
                const versionProgress = document.getElementById('version-progress');
                const versionInfo = document.getElementById('version-info');
                const versionBar = document.getElementById('version-bar');
                
                if (versionProgress) versionProgress.style.display = 'block';
                if (versionInfo) versionInfo.textContent = `版本 ${current}/${total}`;
                if (versionBar) versionBar.style.width = ((current / total) * 100) + '%';
            },
            setStats: (text) => {
                const el = document.getElementById('progress-stats');
                if (el) el.textContent = text;
            },
            remove: () => container.remove()
        };
    }

    // ============================================================
    //  版本模態框渲染 (優化版)
    // ============================================================
    
    renderVersionsModal() {
        // 渲染比較表格
        const comparisonContainer = document.getElementById('versions-comparison');
        if (comparisonContainer) {
            comparisonContainer.innerHTML = this.renderVersionComparison();
        }
        
        // 渲染各版本內容
        this.generatedVersions.forEach((v, idx) => {
            const tabPane = document.getElementById(`v${v.id}`);
            if(!tabPane) return;
            
            const missing = this.calculateMissingShifts(v.assignments);
            const validation = RuleEngine.validateAll(
                { year: this.state.year, month: this.state.month, assignments: v.assignments },
                this.state.daysInMonth, 
                this.state.staffList, 
                this.state.unitSettings, 
                this.state.unitSettings?.rules
            );

            const violationCount = this.countViolations(v.assignments, validation);
            const missingCount = missing.reduce((sum, m) => sum + m.count, 0);
            
            const scoreBadge = v.score.passed ? 
                `<span class="badge bg-success fs-5">${v.score.totalScore} 分</span>` : 
                `<span class="badge bg-danger fs-5">不合格 (${v.score.totalScore})</span>`;
            
            const rankBadge = idx === 0 ? '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-crown"></i> 推薦</span>' : '';
            
            const infoHtml = `
                <div class="alert alert-light border mb-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="mb-2">
                                <i class="fas fa-file-alt"></i> 版本 ${v.id}
                                ${rankBadge}
                            </h5>
                            <div class="d-flex gap-4 mb-2">
                                ${scoreBadge}
                                <div class="small text-muted">
                                    <i class="fas fa-balance-scale"></i> 公平性: 
                                    <strong>${v.score.details.fairness.score.toFixed(0)}</strong>
                                </div>
                                <div class="small text-muted">
                                    <i class="fas fa-heart"></i> 滿意度: 
                                    <strong>${v.score.details.satisfaction.score.toFixed(0)}</strong>
                                </div>
                                <div class="small text-muted">
                                    <i class="fas fa-clock"></i> 耗時: 
                                    <strong>${v.computeTime}s</strong>
                                </div>
                            </div>
                            <div class="d-flex gap-3 small">
                                ${violationCount > 0 ? 
                                    `<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> 違規: ${violationCount}</span>` : 
                                    '<span class="text-success"><i class="fas fa-check"></i> 無違規</span>'}
                                ${missingCount > 0 ? 
                                    `<span class="text-warning"><i class="fas fa-users-slash"></i> 缺口: ${missingCount} 人次</span>` : 
                                    '<span class="text-success"><i class="fas fa-users-cog"></i> 人力充足</span>'}
                            </div>
                        </div>
                        <button class="btn btn-primary" onclick="window.routerPage.applyVersion(${idx})">
                            <i class="fas fa-check-circle"></i> 套用此版本
                        </button>
                    </div>
                </div>
            `;
            
            const poolHtml = missing.length > 0 ? this.renderMissingPoolEnhanced(missing) : '';
            
            const fakeCtx = { ...this.state, scheduleData: { assignments: v.assignments } };
            const gridHtml = `
                <div style="max-height:60vh; overflow:auto; border: 1px solid #dee2e6; border-radius: 4px;">
                    ${SchedulePageTemplate.renderGrid(fakeCtx, validation, { 
                        isInteractive: false, 
                        isDropZone: true, 
                        versionIdx: idx 
                    })}
                </div>
            `;
            
            tabPane.innerHTML = infoHtml + poolHtml + gridHtml;
        });
    }

    // ============================================================
    //  版本比較表格 (增強版)
    // ============================================================
    
    renderVersionComparison() {
        return `
            <div class="card shadow-sm mb-3">
                <div class="card-body">
                    <h6 class="fw-bold mb-3">
                        <i class="fas fa-chart-bar"></i> 版本快速比較
                        <span class="badge bg-light text-dark ms-2">${this.generatedVersions.length} 個版本</span>
                    </h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover text-center mb-0 align-middle">
                            <thead class="table-light">
                                <tr>
                                    <th>版本</th>
                                    <th>總分</th>
                                    <th>公平性</th>
                                    <th>滿意度</th>
                                    <th>效率</th>
                                    <th>健康</th>
                                    <th>缺口</th>
                                    <th>違規</th>
                                    <th>耗時</th>
                                    <th>狀態</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.generatedVersions.map((v, idx) => {
                                    const missing = this.calculateMissingShifts(v.assignments);
                                    const validation = RuleEngine.validateAll(
                                        { year: this.state.year, month: this.state.month, assignments: v.assignments },
                                        this.state.daysInMonth, 
                                        this.state.staffList, 
                                        this.state.unitSettings, 
                                        this.state.unitSettings?.rules
                                    );
                                    const violations = this.countViolations(v.assignments, validation);
                                    const missingCount = missing.reduce((sum, m) => sum + m.count, 0);
                                    const isBest = idx === 0;
                                    
                                    return `
                                        <tr class="${isBest ? 'table-success fw-bold' : ''}" style="cursor: pointer;" 
                                            onclick="document.querySelector('[data-bs-target=\\\'#v${v.id}\\\']').click()">
                                            <td>
                                                版本 ${v.id} 
                                                ${isBest ? '<i class="fas fa-crown text-warning ms-1"></i>' : ''}
                                            </td>
                                            <td>
                                                <span class="badge ${
                                                    v.score.totalScore >= 90 ? 'bg-success' : 
                                                    (v.score.totalScore >= 70 ? 'bg-primary' : 'bg-warning')
                                                }">${v.score.totalScore}</span>
                                            </td>
                                            <td>${v.score.details.fairness.score.toFixed(0)}</td>
                                            <td>${v.score.details.satisfaction.score.toFixed(0)}</td>
                                            <td>${v.score.details.efficiency ? v.score.details.efficiency.score.toFixed(0) : '-'}</td>
                                            <td>${v.score.details.health ? v.score.details.health.score.toFixed(0) : '-'}</td>
                                            <td>
                                                ${missingCount > 0 ? 
                                                    `<span class="text-danger fw-bold">${missingCount}</span>` : 
                                                    '<span class="text-success">0</span>'}
                                            </td>
                                            <td>
                                                ${violations > 0 ? 
                                                    `<span class="text-warning fw-bold">${violations}</span>` : 
                                                    '<span class="text-success">0</span>'}
                                            </td>
                                            <td class="small text-muted">${v.computeTime}s</td>
                                            <td>
                                                ${v.score.passed ? 
                                                    '<span class="badge bg-success">合格</span>' : 
                                                    '<span class="badge bg-danger">不合格</span>'}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="alert alert-info small mb-0 mt-3">
                        <i class="fas fa-info-circle"></i> 
                        點擊任一列可快速查看該版本詳情。推薦使用 <i class="fas fa-crown text-warning"></i> 標記的版本。
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================================
    //  增強版缺口顯示
    // ============================================================
    
    renderMissingPoolEnhanced(missing) {
        const groupedByDay = {};
        missing.forEach(m => {
            if (!groupedByDay[m.day]) groupedByDay[m.day] = [];
            groupedByDay[m.day].push(m);
        });
        
        return `
            <div class="alert alert-warning mb-3">
                <h6 class="alert-heading">
                    <i class="fas fa-exclamation-triangle"></i> 人力缺口警告
                    <span class="badge bg-warning text-dark ms-2">${missing.length} 天有缺口</span>
                </h6>
                <div class="row g-2">
                    ${Object.entries(groupedByDay).map(([day, items]) => `
                        <div class="col-auto">
                            <div class="card border-warning">
                                <div class="card-body p-2 small">
                                    <strong>第 ${day} 天:</strong>
                                    ${items.map(m => `
                                        <span class="badge bg-warning text-dark ms-1">
                                            ${m.shift} 缺 ${m.count}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ============================================================
    //  輔助函數
    // ============================================================
    
    calculateMissingShifts(assignments) {
        const missing = [];
        const staffReq = this.state.unitSettings.staffRequirements || { D:{}, E:{}, N:{} };
        
        for(let d = 1; d <= this.state.daysInMonth; d++) {
            const date = new Date(this.state.year, this.state.month - 1, d);
            const w = date.getDay();
            
            ['N', 'E', 'D'].forEach(shift => {
                const needed = staffReq[shift]?.[w] || 0;
                let count = 0;
                
                Object.values(assignments).forEach(row => { 
                    if(row[d] === shift) count++; 
                });
                
                if(count < needed) {
                    missing.push({ 
                        day: d, 
                        shift: shift, 
                        count: needed - count,
                        needed: needed,
                        actual: count
                    });
                }
            });
        }
        return missing;
    }

    countViolations(assignments, validation) {
        if (!validation || !validation.staffErrors) return 0;
        
        let count = 0;
        Object.values(validation.staffErrors).forEach(errors => {
            Object.values(errors.errors || {}).forEach(errorList => {
                count += errorList.length;
            });
        });
        return count;
    }

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
        targetVersion.assignments[uid][day] = shift;
        
        this.renderVersionsModal(); 
    }

    // ============================================================
    //  套用版本
    // ============================================================
    
    async applyVersion(index) {
        const selected = this.generatedVersions[index];
        if (!selected) return;

        const loading = document.getElementById('loading-indicator');
        if(loading) loading.style.display = 'block';

        try {
            // 1. 更新本地狀態
            this.state.scheduleData.assignments = JSON.parse(JSON.stringify(selected.assignments));
            
            // 2. 更新 metadata
            if (!this.state.scheduleData.metadata) {
                this.state.scheduleData.metadata = {};
            }
            this.state.scheduleData.metadata.lastModified = new Date().toISOString();
            this.state.scheduleData.metadata.aiGenerated = true;
            this.state.scheduleData.metadata.selectedVersion = selected.id;
            this.state.scheduleData.metadata.totalScore = selected.score.totalScore;

            // 3. 寫入資料庫
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                selected.assignments
            );

            this.versionsModal.hide();
            this.renderGrid();
            await this.updateScoreDisplay();
            
            this.showNotification(
                `✅ 已成功套用版本 ${selected.id} 並儲存\n總分: ${selected.score.totalScore}`, 
                'success'
            );
        } catch(e) {
            console.error(e);
            this.showNotification('❌ 套用失敗: ' + e.message, 'danger');
        } finally {
            if(loading) loading.style.display = 'none';
        }
    }

    // ============================================================
    //  匯出功能
    // ============================================================
    
    async exportSchedule() {
        try {
            const data = {
                unit: this.state.unitSettings.unitName,
                year: this.state.year,
                month: this.state.month,
                staff: this.state.staffList.map(s => ({
                    uid: s.uid,
                    name: s.displayName || s.email,
                    shifts: this.state.scheduleData.assignments[s.uid] || {}
                })),
                score: this.state.scoreResult,
                exportedAt: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `schedule_${this.state.year}_${this.state.month}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showNotification('✅ 匯出成功', 'success');
        } catch (e) {
            this.showNotification('❌ 匯出失敗: ' + e.message, 'danger');
        }
    }

    // ============================================================
    //  刪除員工
    // ============================================================
    
    async deleteStaff(uid) {
        const staff = this.state.staffList.find(s => s.uid === uid);
        const staffName = staff ? (staff.displayName || staff.email) : uid;
        
        if(!confirm(`確定要從本月班表中移除「${staffName}」嗎？\n此操作無法復原。`)) {
            return;
        }
        
        try {
            delete this.state.scheduleData.assignments[uid];
            this.state.staffList = this.state.staffList.filter(s => s.uid !== uid);
            
            await ScheduleService.updateAllAssignments(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                this.state.scheduleData.assignments
            );
            
            this.renderGrid();
            await this.updateScoreDisplay();
            this.showNotification(`✅ 已移除 ${staffName}`, 'success');
        } catch (e) {
            this.showNotification('❌ 移除失敗: ' + e.message, 'danger');
        }
    }
    
    // ============================================================
    //  發布/撤回班表
    // ============================================================
    
    async togglePublish() {
        if(!this.state.scheduleData) return;
        
        const currentStatus = this.state.scheduleData.status;
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        const action = newStatus === 'published' ? '發布' : '撤回';
        
        // 發布前檢查
        if (newStatus === 'published') {
            const stats = this.calculateStatistics();
            if (stats.violations > 0) {
                if (!confirm(`⚠️ 目前有 ${stats.violations} 個違規項目\n確定要發布嗎？`)) {
                    return;
                }
            }
            if (stats.completeness < 80) {
                if (!confirm(`⚠️ 完成度僅 ${stats.completeness}%\n確定要發布嗎？`)) {
                    return;
                }
            }
        }
        
        if(!confirm(`確定要${action}班表嗎？\n${newStatus === 'published' ? '發布後員工即可查看' : '撤回後員工將無法查看'}`)) {
            return;
        }
        
        try {
            await ScheduleService.updateStatus(
                this.state.currentUnitId, 
                this.state.year, 
                this.state.month, 
                newStatus
            );
            
            this.state.scheduleData.status = newStatus;
            
            // 更新 metadata
            if (!this.state.scheduleData.metadata) {
                this.state.scheduleData.metadata = {};
            }
            if (newStatus === 'published') {
                this.state.scheduleData.metadata.publishedAt = new Date().toISOString();
            }
            
            this.updateStatusBadge();
            this.showNotification(`✅ 班表已${action}`, 'success');
        } catch (e) {
            this.showNotification(`❌ ${action}失敗: ` + e.message, 'danger');
        }
    }

    updateStatusBadge() {
        const badge = document.getElementById('schedule-status-badge');
        const btn = document.getElementById('btn-publish');
        if(!badge || !this.state.scheduleData) return;
        
        const status = this.state.scheduleData.status;
        if (status === 'published') {
            badge.className = 'badge bg-success ms-2'; 
            badge.innerHTML = '<i class="fas fa-check-circle"></i> 已發布';
            if(btn) { 
                btn.innerHTML = '<i class="fas fa-undo"></i> 撤回班表';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-warning');
            }
        } else {
            badge.className = 'badge bg-warning text-dark ms-2'; 
            badge.innerHTML = '<i class="fas fa-edit"></i> 草稿';
            if(btn) { 
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> 發布班表';
                btn.classList.remove('btn-warning');
                btn.classList.add('btn-success');
            }
        }
    }

    // ============================================================
    //  通知系統
    // ============================================================
    
    showNotification(message, type = 'info') {
        // 移除舊的通知
        const oldNotif = document.getElementById('schedule-notification');
        if (oldNotif) oldNotif.remove();
        
        const notif = document.createElement('div');
        notif.id = 'schedule-notification';
        notif.className = `alert alert-${type} alert-dismissible fade show position-fixed shadow-lg`;
        notif.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 320px; max-width: 500px;';
        notif.innerHTML = `
            <div class="d-flex align-items-start">
                <i class="fas ${this.getNotificationIcon(type)} me-2 mt-1"></i>
                <div class="flex-grow-1">${message.replace(/\n/g, '<br>')}</div>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        document.body.appendChild(notif);
        
        // 3.5 秒後自動消失
        setTimeout(() => {
            if (notif && notif.parentNode) {
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), 150);
            }
        }, 3500);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            danger: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    // ============================================================
    //  清理與銷毀
    // ============================================================
    
    destroy() {
        // 清理事件監聽
        document.removeEventListener('click', this.handleGlobalClick);
        document.removeEventListener('keydown', this.handleKeyboardShortcuts);
        
        // 清理計時器
        clearTimeout(this.saveDebounceTimer);
        clearTimeout(this.scoreDebounceTimer);
        
        // 清理選單
        this.closeMenu();
        
        // 清理進度條
        if (this.progressBar) {
            this.progressBar.remove();
            this.progressBar = null;
        }
        
        console.log('SchedulePage destroyed');
    }
}
