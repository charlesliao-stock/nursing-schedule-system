import { ScheduleService } from "../../services/firebase/ScheduleService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { authService } from "../../services/firebase/AuthService.js";

export class UnitStatsPage {
    constructor() {
        const today = new Date();
        this.startMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}`;
        this.endMonth = this.startMonth;
        this.targetUnitId = null;
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <h2 class="mb-4"><i class="fas fa-chart-bar"></i> 單位區間統計</h2>
                
                <div class="card shadow mb-4 border-left-primary">
                    <div class="card-body bg-light">
                        <div class="d-flex align-items-center gap-3 flex-wrap">
                            <div class="d-flex align-items-center gap-2">
                                <label class="fw-bold text-nowrap">單位：</label>
                                <select id="stats-unit-select" class="form-select w-auto"><option value="">載入中...</option></select>
                            </div>
                            <div class="vr mx-2"></div>
                            <div class="d-flex align-items-center gap-2">
                                <label class="fw-bold text-nowrap">區間：</label>
                                <input type="month" id="start-month" class="form-control w-auto" value="${this.startMonth}">
                                <span>~</span>
                                <input type="month" id="end-month" class="form-control w-auto" value="${this.endMonth}">
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
    }

    async afterRender() {
        const user = authService.getProfile();
        const unitSelect = document.getElementById('stats-unit-select');
        const isAdmin = user.role === 'system_admin' || user.originalRole === 'system_admin';

        let units = [];
        if (isAdmin) units = await UnitService.getAllUnits();
        else {
            units = await UnitService.getUnitsByManager(user.uid);
            if (units.length === 0 && user.unitId) {
                const u = await UnitService.getUnitById(user.unitId);
                if (u) units.push(u);
            }
        }

        if (units.length === 0) {
            unitSelect.innerHTML = '<option value="">無權限</option>';
            unitSelect.disabled = true;
        } else {
            unitSelect.innerHTML = units.map(u => `<option value="${u.unitId}">${u.unitName}</option>`).join('');
            if (units.length === 1) unitSelect.disabled = true;
        }

        document.getElementById('btn-unit-query').addEventListener('click', () => this.loadStats());
    }

    async loadStats() {
        const unitId = document.getElementById('stats-unit-select').value;
        const sVal = document.getElementById('start-month').value;
        const eVal = document.getElementById('end-month').value;
        
        if(!unitId) return alert("請確認單位");
        if(!sVal || !eVal) return alert("請選擇完整區間");
        if(sVal > eVal) return alert("起始月份不可大於結束月份");

        const tbody = document.getElementById('unit-stats-tbody');
