import { motion } from 'framer-motion';

const CATEGORY_COLORS = {
  'Civil & Structural': 'bg-amber-500',
  'Plumbing & Drainage': 'bg-blue-500',
  'Electrical': 'bg-yellow-500',
  'HVAC': 'bg-cyan-500',
  'Firefighting': 'bg-red-500',
  'Finishing & Interior': 'bg-purple-500',
  'External Works': 'bg-green-500',
  'Other': 'bg-slate-500',
  'Uncategorized': 'bg-gray-400',
};

export default function CategorySidebar({ categories, activeCategory, onCategoryChange }) {
  if (!categories || Object.keys(categories).length === 0) return null;

  const entries = Object.entries(categories).sort((a, b) => b[1].length - a[1].length);
  const total = entries.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Categories</h3>

      {/* "All" chip */}
      <button
        onClick={() => onCategoryChange(null)}
        className={`w-full text-left text-sm px-3 py-2 rounded-lg mb-1 transition-colors flex justify-between items-center
          ${!activeCategory ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
      >
        <span>All Trades</span>
        <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
          {total}
        </span>
      </button>

      {entries.map(([category, items]) => (
        <motion.button
          key={category}
          whileHover={{ x: 2 }}
          onClick={() => onCategoryChange(category)}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg mb-1 transition-colors flex justify-between items-center
            ${activeCategory === category
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'hover:bg-slate-50 text-slate-600'
            }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[category] || 'bg-gray-400'}`} />
            <span className="truncate">{category}</span>
          </div>
          <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
            {items.length}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
