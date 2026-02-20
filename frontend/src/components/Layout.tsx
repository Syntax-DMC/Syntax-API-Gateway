import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
  superOnly?: boolean;
}

const DASHBOARD_ITEM: NavItem = {
  to: '/',
  label: 'Dashboard',
  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
};

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'setup',
    label: 'Setup',
    items: [
      { to: '/connections', label: 'Connections', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2' },
      { to: '/tokens', label: 'API Tokens', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
    ],
  },
  {
    key: 'apis',
    label: 'APIs',
    items: [
      { to: '/registry', label: 'Registry', icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 0h16M8 12h8M8 16h4' },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    items: [
      { to: '/logs', label: 'Logs', icon: 'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { to: '/explorer', label: 'Explorer', icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3M3 3h18v18H3V3z' },
      { to: '/export', label: 'Export Center', icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    adminOnly: true,
    items: [
      { to: '/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9 5.197V21' },
    ],
  },
  {
    key: 'super',
    label: 'Admin',
    superOnly: true,
    items: [
      { to: '/tenants', label: 'Tenants', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ],
  },
];

const DEFAULT_EXPANDED: Record<string, boolean> = { setup: true, apis: true, tools: false, admin: false, super: false };

export default function Layout() {
  const { user, logout, memberships, activeTenantId, activeTenantRole, switchTenant } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tenantOpen, setTenantOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar-groups');
      return saved ? JSON.parse(saved) : DEFAULT_EXPANDED;
    } catch {
      return DEFAULT_EXPANDED;
    }
  });

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar-groups', JSON.stringify(next));
      return next;
    });
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTenantOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeTenant = memberships.find((m) => m.tenantId === activeTenantId);
  const isAdmin = user?.isSuperadmin || activeTenantRole === 'admin';

  // Filter and merge admin groups
  const visibleGroups: NavGroup[] = [];
  const adminItems: NavItem[] = [];
  for (const g of NAV_GROUPS) {
    if (g.superOnly && !user?.isSuperadmin) continue;
    if (g.adminOnly && !isAdmin) continue;
    if (g.key === 'admin' || g.key === 'super') {
      adminItems.push(...g.items);
    } else {
      visibleGroups.push(g);
    }
  }
  if (adminItems.length > 0) {
    visibleGroups.push({ key: 'admin', label: 'Admin', items: adminItems });
  }

  function groupHasActiveRoute(group: NavGroup): boolean {
    return group.items.some(item => {
      if (item.to === '/') return location.pathname === '/';
      return location.pathname.startsWith(item.to);
    });
  }

  async function handleSwitchTenant(tenantId: string) {
    setTenantOpen(false);
    if (tenantId === activeTenantId) return;
    try {
      await switchTenant(tenantId);
    } catch (err) {
      console.error('Switch tenant failed:', err);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="h-14 shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Syntax" className="h-7 w-auto" />
            <span className="font-bold text-gray-900 dark:text-white text-sm hidden sm:inline">Syntax API Gateway</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-200">{user?.username}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {user?.isSuperadmin ? 'superadmin' : activeTenantRole ?? 'user'}
            </span>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-60 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            {/* Tenant selector */}
            {memberships.length > 0 && (
              <div className="px-3 pt-3" ref={dropdownRef}>
                <button
                  onClick={() => setTenantOpen(!tenantOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-100/50 dark:bg-gray-700/50 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-gray-600 dark:text-gray-300 truncate">{activeTenant?.tenantName ?? 'Select tenant'}</span>
                  <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${tenantOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {tenantOpen && (
                  <div className="mt-1 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden shadow-lg">
                    {memberships.map((m) => (
                      <button
                        key={m.tenantId}
                        onClick={() => handleSwitchTenant(m.tenantId)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-between ${
                          m.tenantId === activeTenantId ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <span className="truncate">{m.tenantName}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {/* Dashboard — always visible */}
              <NavLink
                to={DASHBOARD_ITEM.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`
                }
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={DASHBOARD_ITEM.icon} />
                </svg>
                {DASHBOARD_ITEM.label}
              </NavLink>

              {/* Grouped navigation */}
              {visibleGroups.map(group => {
                const isExpanded = expandedGroups[group.key] ?? false;
                const hasActive = groupHasActiveRoute(group);

                return (
                  <div key={group.key} className="pt-2">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-3 py-1 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                          {group.label}
                        </span>
                        {!isExpanded && hasActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <svg
                        className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="mt-1 space-y-0.5">
                        {group.items.map(item => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`
                            }
                          >
                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                            </svg>
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="px-3 pb-3">
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                v{__APP_VERSION__}
              </div>
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
