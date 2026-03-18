import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Search } from 'lucide-react';

const CATEGORY_COLORS = {
  'Civil & Structural':    '#2563eb',
  'Plumbing & Drainage':   '#0891b2',
  'Electrical':            '#d97706',
  'HVAC':                  '#0d9488',
  'Firefighting':          '#dc2626',
  'Finishing & Interior':  '#7c3aed',
  'External Works':        '#16a34a',
  'Mechanical & HVAC':     '#0d9488',
  'Fire Protection':       '#dc2626',
  'Other':                 '#64748b',
  'Uncategorized':         '#94a3b8',
};

function getCatColor(cat) {
  if (!cat) return '#94a3b8';
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.split(' ')[0].toLowerCase())) return color;
  }
  return '#64748b';
}

export default function DataTable({
  items,
  activeCategory,
  title = 'Materials',
  emptyMessage = 'No items to display',
}) {
  const [search, setSearch] = useState('');

  let filtered = activeCategory
    ? items.filter(i => i.category === activeCategory)
    : items;

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i =>
      (i.description || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.brand || '').toLowerCase().includes(q)
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-16 text-center">
        <Package size={48} className="mx-auto mb-4 text-slate-200" />
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            {title}
            {activeCategory && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                — {activeCategory}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} items</p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search materials..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-16 text-center">
          <p className="text-sm text-slate-400">No items match your search.</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
              <tr>
                {[
                  { label: '#',        align: 'left',  w: 'w-12' },
                  { label: 'Description', align: 'left',  w: '' },
                  { label: 'Brand',    align: 'left',  w: 'w-32' },
                  { label: 'Quantity', align: 'right', w: 'w-28' },
                  { label: 'Unit',     align: 'left',  w: 'w-20' },
                  { label: 'Category', align: 'left',  w: 'w-40' },
                ].map(h => (
                  <th key={h.label}
                    className={`px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider ${h.w} ${h.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item, idx) => {
                const catColor = getCatColor(item.category);
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-5 py-4 text-slate-800 font-medium max-w-md">
                      <span className="text-sm leading-relaxed">{item.description}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      {item.brand || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-slate-700">
                      {item.quantity != null
                        ? Number(item.quantity).toLocaleString()
                        : <span className="text-slate-300 font-normal">TBD</span>}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      {item.unit || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap"
                        style={{ background: catColor + '12', color: catColor }}>
                        {item.category || 'General'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
