import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";
import { SwapService } from "../../services/firebase/SwapService.js";
import { SwapApplyTemplate } from "./templates/SwapApplyTemplate.js";

export class SwapApplyPage {
    constructor() {
        this.realUser = null; // 真实登录者
        this.currentUser = null; // 当前操作身份 (可能是模拟的)
        this.targetUnitId = null;
        this.pendingSwaps = [];
        this.tempSource = null;
        this.isImpersonating = false; // 是否处于模拟模式
    }

    async render() {
        // 先获取真实用户以判断权限，决定是否渲染管理员区块
        // 注意：这里可能需要先 await authService.getProfile()，但在 render 中通常不建议 await
        // 所以我们在 Template 中预留区块，在 afterRender 中控制显示/隐藏
        return SwapApplyTemplate.renderLayout();
    }

    async afterRender() {
        // 1. 身分验证与初始化
        let retries = 0;
        while (!authService.getProfile() && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
        this.realUser = authService.getProfile();
        
        if (!this.realUser) {
            alert("请先登录");
            return;
        }

        // 默认当前用户为真实用户
        this.currentUser = this.realUser;
        this.targetUnitId = this.realUser.unitId;
        window.routerPage = this;

        // 2. 检查管理员权限并初始化模拟器
        // 假设角色 system_admin 或 unit_manager 可以模拟
        const isAdmin = ['system_admin', 'unit_manager'].includes(this.realUser.role);
        if (isAdmin) {
            await this.initAdminSimulator();
        }

        // 3. 初始化一般功能
        this.initPageData();

        // 4. 事件绑定
        document.getElementById('btn-load-grid').addEventListener('click', () => this.loadGrid());
        document.getElementById('btn-submit-swap').addEventListener('click', () => this.submitSwap());
        
        const reasonSelect = document.getElementById('swap-reason-select');
        reasonSelect.addEventListener('change', (e) => {
            const textInput = document.getElementById('swap-reason-text');
            if(textInput) textInput.style.display = e.target.value === '其他' ? 'block' : 'none';
        });
    }

    // --- 管理员模拟器初始化 ---
    async initAdminSimulator() {
        const adminSection = document.getElementById('admin-impersonate-section');
        if (adminSection) adminSection.style.display = 'block';

        const unitSelect = document.getElementById('admin-unit-select');
        const userSelect = document.getElementById('admin-user-select');
        const impersonateBtn = document.getElementById('btn-impersonate');
        const exitBtn = document.getElementById('btn-exit-impersonate');

        // 1. 加载所有单位
        try {
            const units = await UnitService.getAllUnits();
            unitSelect.innerHTML = `<option value="">-- 请选择单位 --</option>` + 
                units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
        } catch (e) {
            console.error("加载单位失败", e);
        }

        // 2. 单位变更时加载人员
        unitSelect.addEventListener('change', async (e) => {
            const unitId = e.target.value;
            userSelect.innerHTML = '<option>加载中...</option>';
            userSelect.disabled = true;
            
            if (!unitId) {
                userSelect.innerHTML = '<option value="">-- 请先选择单位 --</option>';
                return;
            }

            try {
                const staffList = await userService.getUnitStaff(unitId);
                userSelect.innerHTML = `<option value="">-- 请选择人员 --</option>` + 
                    staffList.map(s => `<option value="${s.uid}">${s.name} (${s.id || '无职编'})</option>`).join('');
                userSelect.disabled = false;
            } catch (e) {
                console.error("加载人员失败", e);
                userSelect.innerHTML = '<option>加载失败</option>';
            }
        });

        // 3. 执行模拟
        impersonateBtn.addEventListener('click', async () => {
            const targetUid = userSelect.value;
            const targetUnitId = unitSelect.value; // 获取选中的单位ID

            if (!targetUid) {
                alert("请选择要模拟的人员");
                return;
            }

            // 获取目标人员完整信息
            // 这里假设 userService.getUserData 可以获取任意用户信息，或者从刚才的列表中查找
            // 为了保险，我们重新 fetch 一次，或者直接用 ID 模拟（如果不需要 name 等其他信息）
            // 建议：从列表中获取 name 即可，不必重新 fetch
            const selectedOption = userSelect.options[userSelect.selectedIndex];
            const targetName = selectedOption.text;

            // 切换身份状态
            this.currentUser = {
                uid: targetUid,
                name: targetName.split(' ')[0], // 简单处理名字
                unitId: targetUnitId, // 更新为目标单位 ID
                role: 'nurse' // 模拟成一般护士
            };
            this.targetUnitId = targetUnitId; // 关键：更新当前操作的单位 ID
            this.isImpersonating = true;

            // UI 更新
            document.getElementById('impersonation-status').style.display = 'block';
            document.getElementById('current-impersonating-name').textContent = this.currentUser.name;
            adminSection.classList.add('border-warning'); // 视觉提示
            
            // 重载页面数据
            this.resetPage();
            alert(`已切换为模拟模式：${this.currentUser.name}`);
        });

        // 4. 退出模拟
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.currentUser = this.realUser;
                this.targetUnitId = this.realUser.unitId;
                this.isImpersonating = false;

                // UI 恢复
                document.getElementById('impersonation-status').style.display = 'none';
                adminSection.classList.remove('border-warning');
                unitSelect.value = '';
                userSelect.innerHTML = '<option value="">-- 请先选择单位 --</option>';
                userSelect.disabled = true;

                // 重载页面数据
                this.resetPage();
                alert("已退出模拟，恢复管理者身份");
            });
        }
    }

    // --- 页面数据初始化/重置 ---
    initPageData() {
        this.loadScheduleList();
        this.loadMyHistory();
        // 清空之前的操作
        this.pendingSwaps = [];
        this.tempSource = null;
        this.updateSwapListUI();
        document.getElementById('schedule-grid-container').innerHTML = '';
        document.getElementById('swap-workspace').style.display = 'none';
    }

    resetPage() {
        this.initPageData();
    }

    // --- 历史纪录 ---
    async loadMyHistory() {
        const tbody = document.getElementById('history-tbody');
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">加载中...</td></tr>';
        
        // 这里的 this.currentUser.uid 会根据是否模拟而变化
        const list = await SwapService.getMyAppliedRequests(this.currentUser.uid);
        tbody.innerHTML = SwapApplyTemplate.renderHistoryRows(list);
    }

    // --- 班表载入 ---
    async loadScheduleList() {
        const select = document.getElementById('schedule-select');
        select.innerHTML = '<option>加载中...</option>';
        try {
            const year = new Date().getFullYear();
            const month = new Date().getMonth() + 1;
            const schedules = [];
            
            // 抓取本月与下月
            const s1 = await ScheduleService.getSchedule(this.targetUnitId, year, month);
            if(s1 && s1.status === 'published') schedules.push(s1);
            
            let nextY = year, nextM = month + 1;
            if(nextM > 12) { nextM = 1; nextY++; }
            const s2 = await ScheduleService.getSchedule(this.targetUnitId, nextY, nextM);
            if(s2 && s2.status === 'published') schedules.push(s2);

            if(schedules.length === 0) {
                select.innerHTML = '<option value="">该单位无已发布的班表</option>';
                return;
            }
            select.innerHTML = schedules.map(s => `<option value="${s.year}-${s.month}">${s.year}年 ${s.month}月</option>`).join('');
        } catch(e) { console.error(e); select.innerHTML = '<option>加载失败</option>'; }
    }

    async loadGrid() {
        const val = document.getElementById('schedule-select').value;
        if(!val) return alert("请先选择班表");
        
        const [y, m] = val.split('-');
        this.currentYear = parseInt(y);
        this.currentMonth = parseInt(m);

        document.getElementById('swap-workspace').style.display = 'block';
        
        // 重置状态
        this.pendingSwaps = [];
        this.tempSource = null;
        this.updateSwapListUI();

        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '<div class="text-center p-5"><span class="spinner-border text-primary"></span> 加载中...</div>';

        try {
            const [schedule, staff] = await Promise.all([
                ScheduleService.getSchedule(this.targetUnitId, this.currentYear, this.currentMonth),
                userService.getUnitStaff(this.targetUnitId)
            ]);
            
            // 渲染矩阵，传入当前用户（可能是模拟的）
            const html = SwapApplyTemplate.renderMatrix(schedule, staff, this.currentUser, this.currentYear, this.currentMonth);
            container.innerHTML = html;

        } catch (e) {
            container.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
        }
    }

    // --- 交互逻辑 (维持原样，只需确保使用 this.currentUser) ---
    handleCellClick(cell, clickable) {
        if (!clickable) return;
        const uid = cell.dataset.uid;
        const day = parseInt(cell.dataset.day);
        const shift = cell.dataset.shift;
        const name = cell.dataset.name;
        const dateStr = cell.dataset.date;

        // 使用 this.currentUser.uid 进行比对
        if (uid === this.currentUser.uid) {
            this.tempSource = { uid, day, shift, name, dateStr };
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
            cell.classList.add('bg-primary', 'text-white');
        } else {
            if (!this.tempSource) return alert("请先点选您(模拟者)的班");
            if (this.tempSource.day !== day) return alert("限同日换班");
            
            this.addSwapToList({
                source: this.tempSource,
                target: { uid, day, shift, name, dateStr }
            });
            this.tempSource = null;
            document.querySelectorAll('.swap-cell').forEach(c => c.classList.remove('bg-primary', 'text-white'));
        }
    }

    addSwapToList(pair) {
        this.pendingSwaps.push({ ...pair.source, target: pair.target });
        this.updateSwapListUI();
    }

    removeSwapFromList(idx) {
        this.pendingSwaps.splice(idx, 1);
        this.updateSwapListUI();
    }

    updateSwapListUI() {
        const container = document.getElementById('swap-list-container');
        const countBadge = document.getElementById('swap-count-badge');
        const btn = document.getElementById('btn-submit-swap');

        countBadge.textContent = `${this.pendingSwaps.length} 笔`;
        btn.disabled = this.pendingSwaps.length === 0;
        
        container.innerHTML = SwapApplyTemplate.renderSwapListItems(this.pendingSwaps);
    }

    // --- 提交 ---
    async submitSwap() {
        const reasonType = document.getElementById('swap-reason-select').value;
        const reasonText = document.getElementById('swap-reason-text').value;
        const finalReason = reasonType === '其他' ? `其他：${reasonText}` : reasonType;

        if (!confirm(`确定送出 ${this.pendingSwaps.length} 笔申请？\n(当前身份：${this.currentUser.name})`)) return;

        try {
            const promises = this.pendingSwaps.map(item => {
                return SwapService.createSwapRequest({
                    unitId: this.targetUnitId,
                    year: this.currentYear,
                    month: this.currentMonth,
                    // 使用当前身份（模拟者）作为申请人
                    requesterId: this.currentUser.uid,
                    requesterName: this.currentUser.name,
                    requesterDate: item.dateStr,
                    requesterShift: item.shift,
                    targetUserId: item.target.uid, 
                    targetUserName: item.target.name,
                    targetDate: item.target.dateStr,
                    targetShift: item.target.shift,
                    reason: finalReason
                });
            });

            await Promise.all(promises);
            alert("申请已送出！");
            
            this.pendingSwaps = [];
            this.updateSwapListUI();
            this.loadMyHistory(); 
            this.loadGrid(); // 刷新表格状态
            
        } catch (e) { alert("失败: " + e.message); }
    }
}
