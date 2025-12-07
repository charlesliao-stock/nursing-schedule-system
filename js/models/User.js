export class User {
    constructor(data) {
        this.uid = data.uid || '';
        this.staffId = data.staffId || '';
        this.name = data.name || '';
        this.email = data.email || '';
        this.role = data.role || 'user';
        this.unitId = data.unitId || '';
        this.level = data.level || '';
        this.avatar = data.profile?.avatar || '';
        
        // ✨ 新增：排班相關限制參數
        this.constraints = data.constraints || {
            canBatch: false,         // 是否可包班
            maxConsecutive: 6,       // 最長連續上班天數 (預設 6)
            isPregnant: false,       // 是否懷孕 (不排 > 22:00)
            excludeShifts: []        // 拒絕班別 (未來擴充用)
        };

        this.permissions = data.permissions || {
            canViewSchedule: false, canEditSchedule: false,
            canManageUnit: false, canManageSystem: false
        };
        this.status = data.status || 'active';
        this.createdAt = data.createdAt || new Date();
    }

    isSystemAdmin() { return this.role === 'system_admin'; }

    toFirestore() {
        return {
            staffId: this.staffId, name: this.name, email: this.email,
            role: this.role, unitId: this.unitId, level: this.level,
            permissions: this.permissions, status: this.status,
            constraints: this.constraints, // ✨ 寫入資料庫
            createdAt: this.createdAt, profile: { avatar: this.avatar }
        };
    }
}
