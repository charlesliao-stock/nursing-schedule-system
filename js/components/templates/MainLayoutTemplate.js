export const MainLayoutTemplate = {
    render(user, roleSwitcherHtml, menuHtml, displayRoleName) {
        const displayName = user.name || user.displayName || '使用者';
        
        return `
            <div class="app-layout">
                <aside class="layout-sidebar" id="layout-sidebar">
                    <div class="sidebar-toggle-tab" id="sidebar-toggle-btn" title="切換選單">
                        <i class="fas fa-chevron-left" id="sidebar-toggle-icon"></i>
                    </div>
                    
                    <div class="sidebar-header" style="cursor:pointer;" onclick="window.location.hash='/dashboard'">
                        <i class="fas fa-hospital-alt" style="margin-right:10px;"></i> 護理排班系統
                    </div>
                    
                    <nav class="sidebar-menu" id="sidebar-menu-container">
                        ${menuHtml}
                    </nav>
                </aside>

                <header class="layout-header" id="layout-header">
                    <div class="brand-logo" id="header-logo">
                        <span id="page-title">儀表板</span>
                    </div>
                    <div class="user-info">
                        ${roleSwitcherHtml}
                        <span id="user-role-badge" class="badge bg-primary me-2">${displayRoleName}</span>
                        <span style="margin-right:10px; color:#666;">
                            <i class="fas fa-user-circle"></i> <span id="header-user-name">${displayName}</span>
                        </span>
                        <button id="layout-logout-btn" class="btn-logout" title="登出">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </header>

                <main id="main-view" class="layout-content"></main>
            </div>
        `;
    },

    renderRoleSwitcher(currentRole) {
        return `
            <div class="me-3 d-flex align-items-center bg-white rounded px-2 border shadow-sm" style="height: 32px;">
                <i class="fas fa-random text-primary me-2" title="視角切換"></i>
                <select id="role-switcher" class="form-select form-select-sm border-0 bg-transparent p-0 shadow-none fw-bold" style="width: auto; cursor: pointer;">
                    <option value="system_admin" ${currentRole === 'system_admin' ? 'selected' : ''}>👁️ 系統管理員</option>
                    <option disabled>────────</option>
                    <option value="unit_manager" ${currentRole === 'unit_manager' ? 'selected' : ''}>👁️ 模擬: 單位主管</option>
                    <option value="unit_scheduler" ${currentRole === 'unit_scheduler' ? 'selected' : ''}>👁️ 模擬: 排班者</option>
                    <option value="user" ${currentRole === 'user' ? 'selected' : ''}>👁️ 模擬: 一般人員</option>
                </select>
                <i class="fas fa-caret-down text-muted ms-2" style="font-size: 0.8rem;"></i>
            </div>`;
    },

    renderMenuHtml(menus) {
        return menus.map(item => {
            if (item.isHeader) {
                return `<div class="menu-header text-uppercase text-xs font-weight-bold text-gray-500 mt-3 mb-1 px-3">${item.label}</div>`;
            }
            return `
                <a href="#${item.path}" class="menu-item" data-path="${item.path}">
                    <i class="${item.icon}" style="width:25px; text-align:center;"></i> 
                    <span>${item.label}</span>
                </a>
            `;
        }).join('');
    }
};
