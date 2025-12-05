import { unitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";

export class UnitListPage {
    async render() {
        return `
            <div class="main-content">
                <div class="page-header">
                    <h1><i class="fas fa-building"></i> 單位管理</h1>
                    <div>
                        <button id="import-btn" class="btn-secondary" style="margin-right:10px;"><i class="fas fa-file-import"></i> 匯入單位</button>
                        <button id="create-btn" class="btn-primary"><i class="fas fa-plus"></i> 新增單位</button>
                        <button id="back-btn" class="btn-secondary" style="margin-left:10px;">返回</button>
                    </div>
                </div>

                <div class="card-container" style="background: white; padding: 2rem; border-radius: 8px; margin-top: 1rem;">
                    <table class="data-table" style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f8fafc; text-align:left;">
                                <th style="padding:10px;">代號</th>
                                <th style="padding:10px;">名稱</th>
                                <th style="padding:10px;">描述</th>
                                <th style="padding:10px;">管理者數</th>
                                <th style="padding:10px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="unit-tbody"></tbody>
                    </table>
                </div>

                <div id="import-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5);">
                    <div style="background:white; width:500px; margin:100px auto; padding:2rem; border-radius:8px;">
                        <h3>匯入單位資料</h3>
                        <p>請上傳 CSV 檔案。格式範例：</p>
                        <pre style="background:#f1f1f1; padding:10px;">unitCode,unitName,description\n9B,9B病房,內科\n10A,10A病房,外科</pre>
                        <div style="margin: 1rem 0;">
                            <button id="download-template-btn" style="text-decoration:underline; border:none; background:none; color:blue; cursor:pointer;">下載範例檔</button>
                        </div>
                        <input type="file" id="csv-file" accept=".csv" style="margin:1rem 0;">
                        <div id="import-result" style="margin-top:10px; color:red;"></div>
                        <div style="text-align:right; margin-top:20px;">
                            <button id="close-import" class="btn-secondary">取消</button>
                            <button id="start-import" class="btn-primary">開始匯入</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        document.getElementById('back-btn').addEventListener('click', () => router.navigate('/dashboard'));
        document.getElementById('create-btn').addEventListener('click', () => router.navigate('/system/units/create'));
        
        // 匯入相關
        const importModal = document.getElementById('import-modal');
        document.getElementById('import-btn').addEventListener('click', () => importModal.style.display = 'block');
        document.getElementById('close-import').addEventListener('click', () => importModal.style.display = 'none');
        
        // 下載範例
        document.getElementById('download-template-btn').addEventListener('click', () => {
            const csvContent = "unitCode,unitName,description\n9B,9B內科病房,一般內科\nER,急診室,急重症單位";
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "unit_import_template.csv";
            link.click();
        });

        // 執行匯入
        document.getElementById('start-import').addEventListener('click', async () => {
            const fileInput = document.getElementById('csv-file');
            const resultDiv = document.getElementById('import-result');
            
            if (!fileInput.files.length) {
                alert('請選擇檔案');
                return;
            }

            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const text = e.target.result;
                const rows = text.split('\n').map(row => row.trim()).filter(row => row);
                // 移除標題列
                const headers = rows.shift().split(',');
                
                const unitsData = rows.map(row => {
                    const cols = row.split(',');
                    return {
                        unitCode: cols[0]?.trim(),
                        unitName: cols[1]?.trim(),
                        description: cols[2]?.trim() || ''
                    };
                });

                resultDiv.textContent = "匯入中...";
                const result = await unitService.importUnits(unitsData);
                
                if (result.failed === 0) {
                    alert(`成功匯入 ${result.success} 筆單位！`);
                    importModal.style.display = 'none';
                    this.loadUnits();
                } else {
                    resultDiv.innerHTML = `成功: ${result.success}, 失敗: ${result.failed}<br>錯誤: ${result.errors.join('<br>')}`;
                }
            };
            reader.readAsText(file);
        });

        this.loadUnits();
    }

    async loadUnits() {
        const tbody = document.getElementById('unit-tbody');
        tbody.innerHTML = '<tr><td colspan="5">載入中...</td></tr>';
        
        const units = await unitService.getAllUnits();
        
        if (units.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">尚無單位資料</td></tr>';
            return;
        }

        tbody.innerHTML = units.map(u => `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px;">${u.unitCode}</td>
                <td style="padding:10px;">${u.unitName}</td>
                <td style="padding:10px;">${u.description || '-'}</td>
                <td style="padding:10px;">${u.managers ? u.managers.length : 0} 人</td>
                <td style="padding:10px;">
                    <button class="btn-icon delete-btn" data-id="${u.unitId}" style="color:red; cursor:pointer; border:none; background:none;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        // 綁定刪除事件
        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm('確定刪除此單位？這可能會影響關聯的人員。')) {
                    await unitService.deleteUnit(e.currentTarget.dataset.id);
                    this.loadUnits();
                }
            });
        });
    }
}
