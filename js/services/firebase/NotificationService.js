export class NotificationService {
    
    /**
     * 發送通知 (模擬)
     * @param {string} userId 接收者
     * @param {string} title 標題
     * @param {string} message 內容
     * @param {string} type 'info' | 'success' | 'warning' | 'error'
     */
    static async send(userId, title, message, type = 'info') {
        console.log(`[Notification] To ${userId}: [${title}] ${message}`);
        
        // 這裡可以整合 LINE Notify API (需透過 Proxy 解決 CORS)
        // 或寫入 Firestore 的 notifications 集合供前端顯示小鈴鐺
        
        // 簡單 UI 回饋 (Toast)
        this.showToast(title, message, type);
        return { success: true };
    }

    static showToast(title, message, type) {
        // 建立簡單的 Toast DOM
        const toastId = 'toast-' + Date.now();
        const bgClass = type === 'error' ? 'bg-danger' : (type === 'success' ? 'bg-success' : 'bg-primary');
        
        const html = `
            <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <strong>${title}</strong><br>${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        const div = document.createElement('div');
        div.innerHTML = html;
        container.appendChild(div.firstChild);

        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
        toast.show();
    }
}
