// 【修正重點】改成大寫 UnitService
import { UnitService } from "../../services/firebase/UnitService.js";

export class UnitCreatePage {
    render() {
        return `
            <div class="container">
                <h2>新增單位</h2>
                <form id="create-unit-form">
                    <div class="form-group">
                        <label>單位代號 (Code)</label>
                        <input type="text" id="unitCode" required placeholder="例如: ICU-A">
                    </div>
                    <div class="form-group">
                        <label>單位名稱 (Name)</label>
                        <input type="text" id="unitName" required placeholder="例如: 第一加護病房">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea id="description"></textarea>
                    </div>
                    <button type="submit" class="btn-primary">建立單位</button>
                    <button type="button" onclick="history.back()">取消</button>
                </form>
            </div>
        `;
    }

    afterRender() {
        const form = document.getElementById('create-unit-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const unitCode = document.getElementById('unitCode').value;
            const unitName = document.getElementById('unitName').value;
            const description = document.getElementById('description').value;

            try {
                // 【修正重點】改成 UnitService.createUnit (大寫)
                const result = await UnitService.createUnit({
                    unitCode,
                    unitName,
                    description
                });

                if (result.success) {
                    alert('單位建立成功！');
                    window.location.hash = '/system/units/list';
                } else {
                    alert('建立失敗: ' + result.error);
                }
            } catch (error) {
                console.error(error);
                alert('系統錯誤');
            }
        });
    }
}
