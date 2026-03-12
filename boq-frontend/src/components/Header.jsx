import { Building2 } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 rounded-lg p-2">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">MyFlyai</h1>
            <p className="text-blue-300 text-xs">Cost & BOQ Intelligence</p>
          </div>
        </div>
        <div className="text-right text-sm text-slate-400">
          <p>Construction AI Platform</p>
        </div>
      </div>
    </header>
  );
}
