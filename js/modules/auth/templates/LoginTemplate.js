export const LoginTemplate = {
    render() {
        return `
            <div class="login-container">
                <div class="login-card">
                    <div class="login-header">
                        <i class="fas fa-user-nurse fa-3x" style="color: var(--primary-color);"></i>
                        <h2>護理站排班系統</h2>
                        <p>請登入以繼續操作</p>
                    </div>
                    <form id="login-form">
                        <div class="form-group">
                            <label>Email 帳號</label>
                            <input type="email" id="email" required placeholder="name@hospital.com">
                        </div>
                        <div class="form-group">
                            <label>密碼</label>
                            <input type="password" id="password" required placeholder="請輸入密碼">
                        </div>
                        <div id="login-error" class="error-message"></div>
                        <button type="submit" id="login-btn" class="btn-primary">
                            登入系統
                        </button>
                    </form>
                </div>
            </div>
        `;
    }
};
