import { authService } from "../../services/firebase/AuthService.js";
import { router } from "../../core/Router.js";
import { LoginTemplate } from "./templates/LoginTemplate.js"; // 引入 Template

class LoginPage {
    render() {
        return LoginTemplate.render();
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
                setTimeout(() => router.navigate('/dashboard'), 500);
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
