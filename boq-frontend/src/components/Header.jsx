import { Building2, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 bg-blue-600">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Flyyy<span className="text-blue-600">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              Construction Intelligence
            </p>
          </div>
        </div>

        {/* Right: user info + logout */}
        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <User size={14} className="text-blue-600" />
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-800 leading-tight">
                  {user.full_name}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {user.email}
                </p>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign out"
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <div className="text-right text-sm text-slate-400">
            <p className="text-xs">Construction AI Platform</p>
          </div>
        )}
      </div>
    </header>
  );
}
