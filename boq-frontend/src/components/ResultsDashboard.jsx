import { motion } from 'framer-motion';
import {
  FileSpreadsheet, Layers, Package, TrendingUp
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const CATEGORY_COLORS_MAP = {
  'Civil & Structural': '#2563eb',
  'Plumbing & Drainage': '#0891b2',
  'Electrical': '#d97706',
  'HVAC': '#0d9488',
  'Firefighting': '#dc2626',
  'Finishing & Interior': '#7c3aed',
  'External Works': '#16a34a',
  'Other': '#64748b',
  'Uncategorized': '#94a3b8',
};

const CleanTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-800">{payload[0]?.name || label}</p>
      <p className="text-slate-500">{payload[0]?.value} items</p>
    </div>
  );
};

export default function ResultsDashboard({ results, analyticsData, riskData }) {
  if (!results) return null;

  const { total_sheets, sheets_with_data, extracted_items, categories } = results;
  const catEntries = categories ? Object.entries(categories) : [];

  const pieData = catEntries.map(([name, items]) => ({
    name,
    value: items.length,
    color: CATEGORY_COLORS_MAP[name] || '#94a3b8',
  }));

  const barData = catEntries
    .map(([name, items]) => ({
      name: name.length > 18 ? name.slice(0, 18) + '...' : name,
      count: items.length,
      fill: CATEGORY_COLORS_MAP[name] || '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard icon={FileSpreadsheet} label="Total Sheets" value={total_sheets}
          sub={`${sheets_with_data} analyzed`} color="#2563eb" delay={0} />
        <StatCard icon={Package} label="Materials Extracted" value={extracted_items}
          color="#059669" delay={0.1} />
        <StatCard icon={Layers} label="Categories" value={catEntries.filter(([k]) => k !== 'Uncategorized').length}
          color="#7c3aed" delay={0.2} />
      </div>

      {/* Charts */}
      {catEntries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }} className="card p-6">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider mb-4 uppercase">Category Split</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={110}
                  dataKey="value" paddingAngle={2} stroke="#fff" strokeWidth={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<CleanTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {pieData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Bar */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }} className="card p-6">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider mb-4 uppercase">Items by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e2e8f0' }} tickLine={{ stroke: '#e2e8f0' }} />
                <YAxis dataKey="name" type="category" width={130}
                  tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CleanTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}

      {/* Top 5 */}
      {analyticsData && analyticsData.top_5_by_quantity?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }} className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
              <TrendingUp size={15} className="text-blue-600" />
            </div>
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
              Top 5 Items by Quantity
            </h3>
          </div>
          <div className="space-y-0.5">
            {analyticsData.top_5_by_quantity.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold w-6 text-blue-600">#{i + 1}</span>
                  <span className="text-sm text-slate-700">{item.description}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-slate-800">
                  {Number(item.quantity).toLocaleString()} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }} className="card p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-lg p-2.5" style={{ background: color + '10' }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase">{label}</span>
      </div>
      <p className="stat-number text-slate-800">{value}</p>
      {sub && <p className="text-xs mt-1 text-slate-400">{sub}</p>}
    </motion.div>
  );
}
