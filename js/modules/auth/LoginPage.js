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
                        <button type="submit" id="login-btn" class="btn-primary">登入系統</button>
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

            btn.disabled = true;
            btn.textContent = "驗證中...";
            errorDiv.style.display = 'none';

            const result = await authService.login(email, password);

            if (result.success) {
                // 成功後 Router 會自動監聽並跳轉
            } else {
                errorDiv.textContent = result.error;
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = "登入系統";
            }
        });
    }
}

export const loginPage = new LoginPage();