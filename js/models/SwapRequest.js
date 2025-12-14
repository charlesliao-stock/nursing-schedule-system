export class SwapRequest {
    constructor(data) {
        this.id = data.id || null;
        this.unitId = data.unitId || '';
        this.requestorId = data.requestorId || '';
        this.requestorName = data.requestorName || '';
        this.targetId = data.targetId || ''; // 對方 ID
        this.targetName = data.targetName || '';
        
        this.date = data.date || ''; // YYYY-MM-DD
        this.requestorShift = data.requestorShift || ''; // 原本的班
        this.targetShift = data.targetShift || ''; // 對方的班 (或 OFF)
        
        this.reason = data.reason || '';
        this.status = data.status || 'pending'; // pending, approved, rejected, cancelled
        
        this.createdAt = data.createdAt || new Date();
        this.reviewedBy = data.reviewedBy || null;
        this.reviewedAt = data.reviewedAt || null;
    }
}
