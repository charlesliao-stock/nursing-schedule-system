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
            createdAt: this.createdAt, profile: { avatar: this.avatar }
        };
    }
}