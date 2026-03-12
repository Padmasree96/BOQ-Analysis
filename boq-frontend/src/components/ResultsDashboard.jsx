import { motion } from 'framer-motion';
import {
  FileSpreadsheet, Layers, Package, ShieldAlert,
  TrendingUp, AlertTriangle, CheckCircle2
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const CATEGORY_COLORS_MAP = {
  'Civil & Structural': '#f59e0b',
  'Plumbing & Drainage': '#3b82f6',
  'Electrical': '#eab308',
  'HVAC': '#06b6d4',
  'Firefighting': '#ef4444',
  'Finishing & Interior': '#a855f7',
  'External Works': '#22c55e',
  'Other': '#64748b',
  'Uncategorized': '#9ca3af',
};

const RISK_COLORS = { High: 'text-red-600 bg-red-50', Medium: 'text-amber-600 bg-amber-50', Low: 'text-green-600 bg-green-50' };
const RISK_ICONS = { High: AlertTriangle, Medium: ShieldAlert, Low: CheckCircle2 };

export default function ResultsDashboard({ results, analyticsData, riskData }) {
  if (!results) return null;

  const { total_sheets, sheets_with_data, extracted_items, categories } = results;
  const catEntries = categories ? Object.entries(categories) : [];

  // Prepare chart data
  const pieData = catEntries.map(([name, items]) => ({
    name,
    value: items.length,
    color: CATEGORY_COLORS_MAP[name] || '#9ca3af',
  }));

  const barData = catEntries
    .map(([name, items]) => ({
      name: name.length > 15 ? name.slice(0, 15) + '...' : name,
      count: items.length,
      fill: CATEGORY_COLORS_MAP[name] || '#9ca3af',
    }))
    .sort((a, b) => b.count - a.count);

  const riskLevel = riskData?.risk_level || 'Low';
  const RiskIcon = RISK_ICONS[riskLevel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ── Stats Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileSpreadsheet}
          label="Total Sheets"
          value={total_sheets}
          sub={`${sheets_with_data} analyzed`}
          color="blue"
        />
        <StatCard
          icon={Package}
          label="Materials Extracted"
          value={extracted_items}
          color="emerald"
        />
        <StatCard
          icon={Layers}
          label="Categories"
          value={catEntries.filter(([k]) => k !== 'Uncategorized').length}
          color="purple"
        />
        <StatCard
          icon={ShieldAlert}
          label="Risk Score"
          value={riskData ? riskData.risk_score : '—'}
          sub={riskData ? riskData.risk_level : ''}
          color={riskLevel === 'High' ? 'red' : riskLevel === 'Medium' ? 'amber' : 'green'}
        />
      </div>

      {/* ── Charts Row ────────────────────────────────────── */}
      {catEntries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart: Category Split */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Category Split</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val, name) => [`${val} items`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {pieData.map((d) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          {/* Bar Chart: Cost Composition by Category */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Items by Category</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Risk Flags ────────────────────────────────────── */}
      {riskData && riskData.flags && riskData.flags.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <RiskIcon className={`w-5 h-5 ${RISK_COLORS[riskLevel].split(' ')[0]}`} />
            <h3 className="text-sm font-semibold text-slate-700">Risk Assessment</h3>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${RISK_COLORS[riskLevel]}`}>
              {riskLevel}
            </span>
          </div>
          <div className="space-y-3">
            {riskData.flags.map((flag, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium
                  ${flag.severity === 'High' ? 'bg-red-100 text-red-700' :
                    flag.severity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'}`}>
                  {flag.severity}
                </span>
                <div>
                  <p className="text-slate-700">{flag.message}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{flag.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top 5 by Quantity ─────────────────────────────── */}
      {analyticsData && analyticsData.top_5_by_quantity?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">Top 5 Items by Quantity</h3>
          </div>
          <div className="space-y-2">
            {analyticsData.top_5_by_quantity.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 w-5">#{i + 1}</span>
                  <span className="text-sm text-slate-700">{item.description}</span>
                </div>
                <span className="font-mono text-sm font-medium text-slate-900">
                  {Number(item.quantity).toLocaleString()} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`rounded-lg p-2 ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
