import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import ErrorBoundary from './ErrorBoundary';
import {
  LayoutDashboard, FolderKanban, Users, Settings, LogOut,
  Search, Bell, Menu, X, ChevronRight, Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import GlobalSearch from './GlobalSearch';

const NAV_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects',   icon: FolderKanban,    label: 'Projects' },
  { to: '/vendors',    icon: Users,           label: 'Vendors' },
  { to: '/settings',   icon: Settings,        label: 'Settings' },
];

function SidebarLink({ to, icon: Icon, label, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-blue-50 to-indigo-50/50 text-blue-700 shadow-sm shadow-blue-100/50'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:translate-x-0.5'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-r-full" />
          )}
          <Icon size={20} strokeWidth={1.8} className={`transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`} />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const sidebarRef = useRef(null);
  const logoRef = useRef(null);

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // GSAP: Sidebar nav items stagger on mount
  useGSAP(() => {
    if (!sidebarRef.current) return;
    const navItems = sidebarRef.current.querySelectorAll('a');
    gsap.fromTo(navItems,
      { opacity: 0, x: -15 },
      { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power3.out', delay: 0.1 }
    );
  }, { scope: sidebarRef });

  // GSAP: Logo pulse on mount
  useGSAP(() => {
    if (!logoRef.current) return;
    gsap.fromTo(logoRef.current,
      { scale: 0.8, opacity: 0, rotate: -10 },
      { scale: 1, opacity: 1, rotate: 0, duration: 0.6, ease: 'back.out(1.7)' }
    );
  }, { scope: logoRef });

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          flex flex-col bg-white border-r border-slate-100
          transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${collapsed ? 'w-[72px]' : 'w-[240px]'}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-slate-100 ${collapsed ? 'justify-center' : ''}`}>
          <div ref={logoRef} className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-slate-800">Flyyy<span className="text-blue-600">AI</span></h1>
              <p className="text-[10px] text-slate-400 -mt-0.5 tracking-wider">CONSTRUCTION INTELLIGENCE</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto md:hidden p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav ref={sidebarRef} className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <SidebarLink key={item.to} {...item} collapsed={collapsed} onClick={() => setSidebarOpen(false)} />
          ))}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden md:block px-3 py-2 border-t border-slate-100">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
          >
            <ChevronRight size={16} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* User card */}
        <div className={`px-3 py-3 border-t border-slate-100 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
              {initials}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{user?.full_name || 'Engineer'}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-50 md:hidden"
          >
            <Menu size={20} />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xl hidden sm:block">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-400 hover:border-slate-300 transition"
            >
              <Search size={16} />
              <span>Search projects and vendors...</span>
              <kbd className="ml-auto text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">Ctrl+K</kbd>
            </button>
          </div>

          {/* Mobile search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-50 sm:hidden"
          >
            <Search size={20} />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(n => !n)}
                className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-50 transition"
              >
                <Bell size={20} />
              </button>
              {notifOpen && <NotificationCenter onClose={() => setNotifOpen(false)} />}
            </div>

            {/* User avatar */}
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-50 transition"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                {initials}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden lg:block">{user?.full_name?.split(' ')[0] || 'User'}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Global search modal */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
