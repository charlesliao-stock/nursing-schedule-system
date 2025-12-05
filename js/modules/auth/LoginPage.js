import { authService } from "../../services/firebase/AuthService.js";
import { router } from "../../core/Router.js";

class LoginPage {
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

    afterRender() {
        const form = document.getElementById('login-form');
        const errorDiv = document.getElementById('login-error');
        const btn = document.getElementById('login-btn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // 1. UI 鎖定
            btn.disabled = true;
            btn.textContent = "驗證中...";
            errorDiv.style.display = 'none';

            console.log("正在嘗試登入:", email);

            // 2. 呼叫登入服務
            const result = await authService.login(email, password);

            if (result.success) {
                console.log("登入成功 (LoginPage):", result.user.email);
                
                // 【修正點】: 強制手動跳轉，確保不會卡在按鈕 loading
                // 稍微延遲 500ms 讓使用者看到反應
                setTimeout(() => {
                    router.navigate('/dashboard');
                }, 500);

            } else {
                // 3. 處理錯誤
                console.error("登入失敗:", result.error);
                errorDiv.textContent = result.error;
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = "登入系統";
            }
        });
    }
}

export const loginPage = new LoginPage();
