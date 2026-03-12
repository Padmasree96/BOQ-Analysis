import { motion } from 'framer-motion';
import { Package } from 'lucide-react';

const CATEGORY_BADGES = {
  'Civil & Structural': 'bg-amber-100 text-amber-700',
  'Plumbing & Drainage': 'bg-blue-100 text-blue-700',
  'Electrical': 'bg-yellow-100 text-yellow-700',
  'HVAC': 'bg-cyan-100 text-cyan-700',
  'Firefighting': 'bg-red-100 text-red-700',
  'Finishing & Interior': 'bg-purple-100 text-purple-700',
  'External Works': 'bg-green-100 text-green-700',
  'Other': 'bg-slate-100 text-slate-700',
  'Uncategorized': 'bg-gray-100 text-gray-600',
};

export default function DataTable({ items, activeCategory }) {
  const filtered = activeCategory
    ? items.filter(i => i.category === activeCategory)
    : items;

  if (!filtered || filtered.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-400 text-sm">No items to display</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-700">
          Item-Level BOQ
          {activeCategory && (
            <span className="text-xs font-normal text-slate-400 ml-2">
              Filtered: {activeCategory}
            </span>
          )}
        </h3>
        <span className="text-xs text-slate-400">{filtered.length} items</span>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                BOQ Item
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Brand
              </th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Unit
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-700 max-w-xs truncate" title={item.description}>
                  {item.description}
                </td>
                <td className="px-5 py-3 text-slate-500">{item.brand}</td>
                <td className="px-5 py-3 text-right font-mono text-slate-700">
                  {Number(item.quantity).toLocaleString()}
                </td>
                <td className="px-5 py-3 text-slate-500">{item.unit}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${CATEGORY_BADGES[item.category] || 'bg-gray-100 text-gray-600'}`}>
                    {item.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
