import { authService } from "../services/firebase/AuthService.js";
import { router } from "../core/Router.js";

export class MainLayout {
    constructor(user) {
        this.user = user;
    }

    render() {
        // 判斷是否為管理職 (包含系統管理員 與 單位管理者)
        const isManager = ['system_admin', 'unit_manager'].includes(this.user.role);
        
        return `
            <div id="wrapper">
                <ul class="navbar-nav bg-gradient-primary sidebar sidebar-dark accordion" id="accordionSidebar">
                    <a class="sidebar-brand d-flex align-items-center justify-content-center" href="#/dashboard">
                        <div class="sidebar-brand-icon rotate-n-15"><i class="fas fa-user-nurse"></i></div>
                        <div class="sidebar-brand-text mx-3">護理排班系統</div>
                    </a>
                    <hr class="sidebar-divider my-0">

                    <li class="nav-item">
                        <a class="nav-link" href="#/dashboard"><i class="fas fa-fw fa-tachometer-alt"></i> <span>儀表板</span></a>
                    </li>
                    <hr class="sidebar-divider">

                    <div class="sidebar-heading">排班作業</div>
                    <li class="nav-item">
                        <a class="nav-link" href="#/schedule/manual"><i class="fas fa-fw fa-calendar-alt"></i> <span>排班表</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link collapsed" href="#" data-bs-toggle="collapse" data-bs-target="#collapsePre" aria-expanded="true">
                            <i class="fas fa-fw fa-edit"></i> <span>預班管理</span>
                        </a>
                        <div id="collapsePre" class="collapse" data-parent="#accordionSidebar">
                            <div class="bg-white py-2 collapse-inner rounded">
                                <a class="collapse-item" href="#/pre-schedule/submit">提交預班</a>
                                ${isManager ? '<a class="collapse-item" href="#/pre-schedule/manage">預班管理 (主管)</a>' : ''}
                            </div>
                        </div>
                    </li>

                    ${isManager ? `
                    <hr class="sidebar-divider">
                    <div class="sidebar-heading">單位管理</div>
                    <li class="nav-item">
                        <a class="nav-link" href="#/unit/staff/list"><i class="fas fa-fw fa-users"></i> <span>人員管理</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link collapsed" href="#" data-bs-toggle="collapse" data-bs-target="#collapseSettings" aria-expanded="true">
                            <i class="fas fa-fw fa-cogs"></i> <span>參數設定</span>
                        </a>
                        <div id="collapseSettings" class="collapse" data-parent="#accordionSidebar">
                            <div class="bg-white py-2 collapse-inner rounded">
                                <h6 class="collapse-header">排班參數:</h6>
                                <a class="collapse-item" href="#/unit/settings/shifts">班別設定</a>
                                <a class="collapse-item" href="#/unit/settings/groups">組別設定</a> <a class="collapse-item" href="#/unit/settings/rules">排班規則</a>
                            </div>
                        </div>
                    </li>
                    ` : ''}

                    ${this.user.role === 'system_admin' ? `
                    <hr class="sidebar-divider">
                    <div class="sidebar-heading">系統後台</div>
                    <li class="nav-item">
                        <a class="nav-link" href="#/system/units/list"><i class="fas fa-fw fa-hospital"></i> <span>單位列表</span></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/system/settings"><i class="fas fa-fw fa-tools"></i> <span>系統設定</span></a>
                    </li>
                    ` : ''}
                    
                    <hr class="sidebar-divider d-none d-md-block">
                    <div class="text-center d-none d-md-inline">
                        <button class="rounded-circle border-0" id="sidebarToggle" onclick="document.body.classList.toggle('sidebar-toggled')"></button>
                    </div>
                </ul>

                <div id="content-wrapper" class="d-flex flex-column">
                    <div id="content">
                        <nav class="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
                             <button id="sidebarToggleTop" class="btn btn-link d-md-none rounded-circle mr-3" onclick="document.body.classList.toggle('sidebar-toggled')">
                                <i class="fa fa-bars"></i>
                            </button>
                            <ul class="navbar-nav ms-auto">
                                <div class="topbar-divider d-none d-sm-block"></div>
                                <li class="nav-item dropdown no-arrow">
                                    <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown">
                                        <span class="mr-2 d-none d-lg-inline text-gray-600 small">${this.user.name}</span>
                                        <img class="img-profile rounded-circle" src="https://source.unsplash.com/QAB-WJcbgJk/60x60">
                                    </a>
                                    <div class="dropdown-menu dropdown-menu-end shadow animated--grow-in">
                                        <a class="dropdown-item" href="#/profile">
                                            <i class="fas fa-user fa-sm fa-fw mr-2 text-gray-400"></i> 個人檔案
                                        </a>
                                        <div class="dropdown-divider"></div>
                                        <a class="dropdown-item" href="#" id="logout-btn">
                                            <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-gray-400"></i> 登出
                                        </a>
                                    </div>
                                </li>
                            </ul>
                        </nav>
                        
                        <div id="main-view"></div> 
                    </div>
                    
                    <footer class="sticky-footer bg-white">
                        <div class="container my-auto">
                            <div class="copyright text-center my-auto">
                                <span>Copyright &copy; Nursing Schedule System 2025</span>
                            </div>
                        </div>
                    </footer>
                </div>
            </div>
        `;
    }

    afterRender() {
        document.getElementById('logout-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            await authService.logout();
            router.navigate('/login');
        });
        
        this.updateActiveMenu(window.location.hash.slice(1));
    }

    updateActiveMenu(path) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.collapse-item').forEach(el => el.classList.remove('active'));
        
        // 簡易匹配
        const link = document.querySelector(`a[href="#${path}"]`);
        if (link) {
            if (link.classList.contains('collapse-item')) {
                link.classList.add('active');
                const parent = link.closest('.collapse');
                if (parent) parent.classList.add('show');
            } else {
                link.closest('.nav-item').classList.add('active');
            }
        }
    }
}
