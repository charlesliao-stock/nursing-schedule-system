import { userService } from "../../services/firebase/UserService.js";
import { UnitService } from "../../services/firebase/UnitService.js";
import { router } from "../../core/Router.js";
import { authService } from "../../services/firebase/AuthService.js";

export class StaffListPage {
    constructor() {
        this.staffList = [];       
        this.displayList = [];     
        this.unitMap = {};         
        this.selectedIds = new Set(); 
        this.currentUser = null;
        this.editModal = null;
        this.importModal = null;

        // 排序設定 (預設依員工編號排序)
        this.sortConfig = {
            key: 'staffId',
            direction: 'asc' 
        };
    }

    // ... (render 方法與之前的 v2.0 相同，請直接保留前一次回答的 render 內容) ...
    // 為了節省篇幅，請確保 render 函式中的 HTML 包含 table header class="sortable-th"
    
    async render() {
        // ... (同前一版 render，確保表頭如下)
        /*
        <th class="sortable-th" data-key="staffId">員工編號</th>
        <th class="sortable-th" data-key="name">姓名</th>
        ...
        */
        // 這裡請使用我上一則回應 (v2.0) 的 render 程式碼
        // 下面我只列出 handleSort 的關鍵修正
        return await super_render_logic_from_previous_response(); 
    }

    // ⚠️ 這裡如果直接複製會少 render，請務必使用 上一則回答 的完整 render 函式 ⚠️
    // 但為了讓您一次 copy-paste 方便，我下面提供「關鍵修正後的方法」，您可以把這些方法換掉原本的 handleSort 和 applySortAndFilter

    // ✅ 修正後的排序處理
    handleSort(key) {
        // 檢查是否點擊同一欄位
        if (this.sortConfig.key === key) {
            // 切換方向：asc -> desc, desc -> asc
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 新欄位，預設由小到大 (asc)
            this.sortConfig.key = key;
            this.sortConfig.direction = 'asc';
        }
        
        console.log(`Sorting by ${this.sortConfig.key} (${this.sortConfig.direction})`);
        
        this.updateHeaderIcons();
        this.applySortAndFilter();
    }

    // ✅ 修正後的排序比較邏輯
    applySortAndFilter() {
        const keyword = document.getElementById('keyword-search').value.toLowerCase();
        
        // 1. 搜尋過濾
        let filtered = this.staffList;
        if (keyword) {
            filtered = this.staffList.filter(u => 
                (u.name && u.name.toLowerCase().includes(keyword)) ||
                (u.staffId && u.staffId.includes(keyword)) ||
                (u.email && u.email.toLowerCase().includes(keyword))
            );
        }

        // 2. 排序
        const key = this.sortConfig.key;
        const dir = this.sortConfig.direction === 'asc' ? 1 : -1; // 1 為小到大, -1 為大到小
        
        filtered.sort((a, b) => {
            // 取得數值，若無則為空字串，並轉為字串小寫以進行不分大小寫比對
            let valA = a[key];
            let valB = b[key];

            // 特殊處理：如果是 unitId，改用 unitName 排序
            if (key === 'unitId') {
                valA = this.unitMap[valA] || valA;
                valB = this.unitMap[valB] || valB;
            }

            // 處理 null/undefined
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            // 嘗試轉數字排序 (如果是員工編號)
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            
            // 如果兩者都是純數字，用數字排序
            if (!isNaN(numA) && !isNaN(numB) && String(numA) === String(valA) && String(numB) === String(valB)) {
                return (numA - numB) * dir;
            }

            // 否則用字串排序
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        this.displayList = filtered;
        this.renderTable();
    }
    
    // ... (其餘 afterRender, renderTable, updateHeaderIcons 等方法請沿用上一版) ...
}
