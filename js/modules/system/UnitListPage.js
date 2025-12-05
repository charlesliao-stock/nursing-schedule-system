// 1. 修改 import
import { UnitService } from "../../services/firebase/UnitService.js";

export class UnitListPage {
    async render() {
        // 2. 修改呼叫方式: UnitService.getAllUnits()
        const units = await UnitService.getAllUnits();
        
        let rows = units.map(unit => `
            <tr>
                <td>${unit.unitCode}</td>
                <td>${unit.unitName}</td>
                <td>${unit.description || ''}</td>
                <td>
                    <button onclick="window.location.hash='/system/units/edit/${unit.unitId}'">編輯</button>
                    <button class="btn-delete" data-id="${unit.unitId}">刪除</button>
                </td>
            </tr>
        `).join('');

        return `
            <div class="container">
                <h2>單位管理列表</h2>
                <div class="toolbar">
                    <a href="#/system/units/create" class="btn-primary">新增單位</a>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>代號</th>
                            <th>名稱</th>
                            <th>描述</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    afterRender() {
        // 綁定刪除按鈕事件
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (confirm('確定要刪除此單位嗎？')) {
                    // 2. 修改呼叫方式
                    const result = await UnitService.deleteUnit(id);
                    if (result.success) {
                        alert('刪除成功');
                        // 重新整理頁面
                        window.location.reload();
                    } else {
                        alert('刪除失敗: ' + result.error);
                    }
                }
            });
        });
    }
}
