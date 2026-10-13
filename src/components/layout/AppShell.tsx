import React from 'react';
import { NavLink } from 'react-router-dom';

import {
    LayoutDashboard, FolderOpen, MessageSquare, BarChart3, Shield,
    Search, Plus, Bell, ChevronDown, Settings, LogOut, Activity
} from 'lucide-react';
import { Badge } from '../ui';
import './AppShell.css';

const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/sources', icon: FolderOpen, label: 'Sources' },
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/insights', icon: BarChart3, label: 'Insights' },
    { to: '/admin', icon: Shield, label: 'Admin' },
];

interface AppShellProps {
    children: React.ReactNode;
    healthStatus?: 'healthy' | 'degraded' | 'down';
}

export const AppShell: React.FC<AppShellProps> = ({ children, healthStatus = 'healthy' }) => {
    const [userMenuOpen, setUserMenuOpen] = React.useState(false);

    const healthVariant = healthStatus === 'healthy' ? 'success' : healthStatus === 'degraded' ? 'warning' : 'error';
    const healthLabel = healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1);

    return (
        <div className="app-shell">
            {/* Sidebar */}
            <aside className="sidebar" role="navigation" aria-label="Main navigation">
                <div className="sidebar-header">
                    <div className="workspace-switcher">
                        <div className="workspace-avatar">ML</div>
                        <div className="workspace-info">
                            <span className="workspace-name">My Learning</span>
                            <span className="workspace-plan">Pro Plan</span>
                        </div>
                        <ChevronDown size={14} className="workspace-chevron" />
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                        >
                            <item.icon size={18} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-menu-wrapper">
                        <button
                            className="user-menu-trigger"
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            aria-expanded={userMenuOpen}
                            aria-haspopup="true"
                        >
                            <div className="user-avatar">AK</div>
                            <div className="user-info">
                                <span className="user-name">Alex Kim</span>
                                <span className="user-email">alex@company.io</span>
                            </div>
                        </button>
                        {userMenuOpen && (
                            <div className="user-dropdown" role="menu">
                                <button className="user-dropdown-item" role="menuitem">
                                    <Settings size={14} /> Settings
                                </button>
                                <button className="user-dropdown-item user-dropdown-danger" role="menuitem">
                                    <LogOut size={14} /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className="main-area">
                {/* Topbar */}
                <header className="topbar">
                    <div className="topbar-search">
                        <Search size={16} className="topbar-search-icon" />
                        <input
                            type="text"
                            placeholder="Search notes + videos + chats…"
                            className="topbar-search-input"
                            aria-label="Global search"
                        />
                    </div>
                    <div className="topbar-actions">
                        <Badge variant={healthVariant} dot>
                            <Activity size={12} style={{ marginRight: 4 }} />
                            {healthLabel}
                        </Badge>
                        <button className="topbar-icon-btn" aria-label="Notifications">
                            <Bell size={18} />
                            <span className="notification-dot" />
                        </button>
                        <NavLink to="/sources" className="topbar-new-source">
                            <Plus size={16} />
                            New Source
                        </NavLink>
                    </div>
                </header>

                {/* Content */}
                <main className="content-area">
                    {children}
                </main>
            </div>
        </div>
    );
};
