import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseService } from "../../services/firebase/FirebaseService.js";

export class SystemSettingsPage {
    constructor() {
        this.config = {
            weekStartDay: 1, // 0=Sun, 1=Mon (預設)
            firstShift: 'D'  // D or N (預設)
        };
    }

    async render() {
        return `
            <div class="container-fluid mt-4">
                <div class="mb-3">
                    <h3 class="text-gray-800 fw-bold"><i class="fas fa-tools"></i> 系統設定</h3>
                    <p class="text-muted small mb-0">設定全系統通用的計算規則與參數。</p>
                </div>

                <div class="card shadow">
                    <div class="card-header py-3 bg-white">
                        <h6 class="m-0 fw-bold text-primary"><i class="fas fa-cogs"></i> 全域參數</h6>
                    </div>
                    <div class="card-body">
                        <form id="system-form">
                            <div class="mb-4">
                                <label class="form-label fw-bold">一週起始日 (Week Start Day)</label>
                                <select id="week-start" class="form-select w-50">
                                    <option value="0">星期日 (Sunday)</option>
                                    <option value="1">星期一 (Monday)</option>
                                </select>
                                <div class="form-text">
                                    此設定將影響 AI 計算「每週班別種類」的起算點。<br>
                                    若設為星期一，則週一至週日視為同一週。
                                </div>
                            </div>

                            <div class="mb-4">
                                <label class="form-label fw-bold">每日第一班 (First Shift of Day)</label>
                                <select id="first-shift" class="form-select w-50">
                                    <option value="D">白班 (Day Shift)</option>
                                    <option value="N">大夜 (Night Shift)</option>
                                </select>
                                <div class="form-text">
                                    定義每日班別的排序順序 (僅影響顯示順序與部分跨日計算)。
                                </div>
                            </div>

                            <hr>
                            <button type="button" id="btn-save" class="btn btn-primary">
                                <i class="fas fa-save"></i> 儲存設定
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        await this.loadConfig();
        
        document.getElementById('week-start').value = this.config.weekStartDay;
        document.getElementById('first-shift').value = this.config.firstShift;
        
        document.getElementById('btn-save').addEventListener('click', () => this.saveConfig());
    }

    async loadConfig() {
        try {
            const db = firebaseService.getDb();
            const docSnap = await getDoc(doc(db, "system", "config"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.config = { ...this.config, ...data };
            }
        } catch (e) {
            console.error("Load Config Error:", e);
        }
    }

    async saveConfig() {
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

        try {
            const newConfig = {
                weekStartDay: parseInt(document.getElementById('week-start').value),
                firstShift: document.getElementById('first-shift').value,
                updatedAt: new Date()
            };

            const db = firebaseService.getDb();
            await setDoc(doc(db, "system", "config"), newConfig);
            
            this.config = newConfig;
            alert("✅ 系統設定已更新");
        } catch (e) {
            console.error(e);
            alert("儲存失敗: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存設定';
        }
    }
}
