import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Search, Plus, Upload, Trash2, Users, X, Download,
  CheckCircle2, AlertTriangle, ArrowRight, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../supabaseClient';
import {
  getMyVendors, addVendorManually, bulkAddVendors,
  deleteVendor, downloadVendorTemplate, previewVendorFile,
} from '../../services/vendorService';
import { scaleInVariants } from '../../lib/motion';

gsap.registerPlugin(useGSAP);

const CATEGORY_OPTIONS = [
  'Electrical', 'Civil', 'Plumbing', 'HVAC',
  'Fire Protection', 'IT & Communication', 'Finishing', 'External',
];

const CAT_COLORS = {
  Electrical:            '#3B82F6',
  Civil:                 '#8B5CF6',
  Plumbing:              '#10B981',
  HVAC:                  '#06B6D4',
  'Fire Protection':     '#EF4444',
  'IT & Communication':  '#6366F1',
  Finishing:             '#F97316',
  External:              '#6B7280',
};

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */
export default function VendorManager({ userId, projectId, projectName, mode = 'standalone', onComplete }) {
  const navigate = useNavigate();
  const [vendors, setVendors]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('list');
  const [search, setSearch]       = useState('');
  const tableRef = useRef(null);

  // ── Fetch vendors ───────────────────────────────────────────
  const fetchVendors = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMyVendors(userId);
      setVendors(data);
    } catch (err) {
      console.error('[VendorManager] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  // ── Realtime subscription ───────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('vendors-mgr-' + userId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'vendors',
      }, () => fetchVendors())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchVendors, userId]);

  // ── GSAP: stagger vendor rows ───────────────────────────────
  useGSAP(() => {
    if (!tableRef.current || loading) return;
    const rows = tableRef.current.querySelectorAll('.vendor-row');
    if (!rows.length) return;
    // Kill any existing animations on these rows first
    gsap.killTweensOf(rows);
    gsap.fromTo(rows,
      { opacity: 0, x: -24 },
      { opacity: 1, x: 0, stagger: 0.04, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' }
    );
  }, { scope: tableRef, dependencies: [vendors.length, loading, tab] });

  // ── Filtered vendors ────────────────────────────────────────
  const filtered = vendors.filter(v =>
    !search ||
    v.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.location?.toLowerCase().includes(search.toLowerCase()) ||
    v.categories?.some(c => c.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Delete handler ──────────────────────────────────────────
  const handleDelete = async (id, rowEl) => {
    if (!window.confirm('Delete this vendor from your personal list?')) return;

    try {
      await deleteVendor(id);
      setVendors(prev => prev.filter(v => v.id !== id));
      if (rowEl) {
        gsap.to(rowEl, {
          opacity: 0,
          height: 0,
          duration: 0.22,
          ease: 'power2.inOut',
        });
      }
      toast.success('Vendor removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {mode === 'post_project' ? `Vendors for ${projectName || 'Project'}` : 'My Vendors'}
          </h2>
          <p className="text-sm text-slate-400">
            {mode === 'post_project'
              ? 'Add vendors now or skip and return to the project.'
              : 'Your personal vendor database'}
          </p>
        </div>
        {mode === 'post_project' && (
          <div className="flex items-center gap-3">
            <button onClick={onComplete} className="text-sm text-slate-400 hover:text-slate-600 transition">
              Skip for now
            </button>
            <button onClick={onComplete} className="btn-primary flex items-center gap-2 text-sm">
              Done — Go to Project <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {mode === 'post_project' && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">Project</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">Documents</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-teal-100 px-3 py-1 text-teal-700">Vendors</span>
          <span className="text-slate-300">→</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">Done</span>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'list',   label: `Vendor List (${vendors.length})`, icon: Users },
          { key: 'add',    label: '+ Add Manually',                  icon: Plus },
          { key: 'bulk',   label: 'Bulk Upload',                     icon: Upload },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────── */}
      {tab === 'list' && (
        <VendorListTab
          vendors={filtered}
          loading={loading}
          search={search}
          onSearch={setSearch}
          onDelete={handleDelete}
          onGoAdd={() => setTab('add')}
          onGoBulk={() => setTab('bulk')}
          tableRef={tableRef}
          navigate={navigate}
        />
      )}

      {tab === 'add' && (
        <ManualAddTab
          userId={userId}
          onAdded={async () => {
            await fetchVendors();
            setTab('list');
          }}
        />
      )}

      {tab === 'bulk' && (
        <BulkUploadTab
          userId={userId}
          onDone={async () => {
            await fetchVendors();
            setTab('list');
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Vendor List Tab
   ═══════════════════════════════════════════════════════════════ */
function VendorListTab({ vendors, loading, search, onSearch, onDelete, onGoAdd, onGoBulk, tableRef, navigate }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
      </div>
    );
  }

  if (vendors.length === 0 && !search) {
    return (
      <EmptyVendors onGoAdd={onGoAdd} onGoBulk={onGoBulk} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search by name, category, or location..."
          className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-full focus:ring-2 focus:ring-green-500 outline-none"
        />
      </div>

      {vendors.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No vendors match your search.</p>
      ) : (
        <div ref={tableRef} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden md:table-cell">Categories</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden sm:table-cell">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden lg:table-cell">Email</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id} className="vendor-row border-b border-slate-50 hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                        {(v.company_name || '?')[0].toUpperCase()}
                      </div>
                      <div 
                        onClick={() => {
                          console.log("Clicked vendor:", v);
                          navigate(`/vendors/${v.id}`);
                        }}
                        className="cursor-pointer group/name"
                      >
                        <p className="font-medium text-slate-700 group-hover/name:text-blue-600 transition-colors uppercase tracking-tight">{v.company_name}</p>
                        {v.location && <p className="text-xs text-slate-400">{v.location}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(v.categories || []).map(c => (
                        <span key={c} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: (CAT_COLORS[c] || '#6B7280') + '15', color: CAT_COLORS[c] || '#6B7280' }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{v.contact_person || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{v.email}</td>
                  <td className="px-2 py-3">
                    <button onClick={(event) => onDelete(v.id, event.currentTarget.closest('tr'))}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────── */
function EmptyVendors({ onGoAdd, onGoBulk }) {
  const cardRef = useRef(null);

  useGSAP(() => {
    if (!cardRef.current) return;
    gsap.from(cardRef.current, { scale: 0.95, opacity: 0, duration: 0.5, ease: 'power3.out' });
  }, { scope: cardRef });

  return (
    <div ref={cardRef} className="text-center py-16 px-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
      <Users size={40} className="mx-auto text-slate-300 mb-4" />
      <p className="text-lg font-semibold text-slate-700 mb-1">No vendors yet</p>
      <p className="text-sm text-slate-400 mb-6">Add vendors to start sending quote requests</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={onGoAdd} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Add Manually
        </button>
        <button onClick={onGoBulk} className="btn-secondary flex items-center gap-2 text-sm">
          <Upload size={14} /> Upload Excel
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Manual Add Tab
   ═══════════════════════════════════════════════════════════════ */
function ManualAddTab({ userId, onAdded }) {
  const [form, setForm] = useState({
    company_name: '', contact_person: '', email: '',
    phone: '', location: '', categories: [],
  });
  const [saving, setSaving] = useState(false);
  const btnRef = useRef(null);

  const toggleCat = (cat) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) return toast.error('Company name is required');
    if (!form.contact_person.trim()) return toast.error('Contact person is required');
    if (!form.email.trim()) return toast.error('Email is required');

    setSaving(true);
    try {
      await addVendorManually(userId, form);
      toast.success('Vendor added');
      // Flash button
      if (btnRef.current) {
        gsap.timeline()
          .to(btnRef.current, { scale: 1.05, duration: 0.12 })
          .to(btnRef.current, { scale: 1, duration: 0.12 });
      }
      setForm({ company_name: '', contact_person: '', email: '', phone: '', location: '', categories: [] });
      setTimeout(() => onAdded(), 800);
    } catch (err) {
      toast.error(err.message || 'Failed to add vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Company Name *</label>
          <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ABC Electricals" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Contact Person *</label>
          <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ramesh Kumar" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Email Address *</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="vendor@company.com" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="+91 98765 43210" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Location</label>
        <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Mumbai, Maharashtra" />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-2 block">Categories</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map(cat => {
            const active = form.categories.includes(cat);
            return (
              <button key={cat} type="button" onClick={() => toggleCat(cat)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition ${
                  active
                    ? 'border-transparent text-white'
                    : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                }`}
                style={active ? { background: CAT_COLORS[cat] || '#6B7280' } : undefined}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <button ref={btnRef} type="submit" disabled={saving}
        className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
        {saving ? <><Loader2 size={14} className="animate-spin" /> Adding...</> : <><Plus size={14} /> Add Vendor</>}
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Bulk Upload Tab
   ═══════════════════════════════════════════════════════════════ */
function BulkUploadTab({ userId, onDone }) {
  const inputId  = useId();
  const zoneRef  = useRef(null);
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);
  const [dragging, setDragging]   = useState(false);

  // Drag hover
  useEffect(() => {
    if (!zoneRef.current) return;
    gsap.to(zoneRef.current, {
      scale: dragging ? 1.02 : 1,
      duration: 0.2,
      ease: 'power2.out',
    });
  }, [dragging]);

  // Preview file
  const handleFile = async (f) => {
    setFile(f);
    setResult(null);
    try {
      const prev = await previewVendorFile(f);
      setPreview(prev);
    } catch (err) {
      toast.error('Could not read file: ' + err.message);
      setFile(null);
    }
  };

  // Import
  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await bulkAddVendors(userId, file);
      setResult(res);
      if (res.added > 0) toast.success(`${res.added} vendors imported`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // Result card
  if (result) {
    return (
      <motion.div variants={scaleInVariants} initial="initial" animate="animate" className="max-w-md space-y-4">
        {result.added > 0 && (
          <div className="rounded-xl px-5 py-4 bg-green-50 border border-green-200 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600" />
            <span className="text-sm font-medium text-green-700">{result.added} vendors added successfully</span>
          </div>
        )}
        {result.skipped > 0 && (
          <div className="rounded-xl px-5 py-4 bg-amber-50 border border-amber-200 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500" />
            <span className="text-sm font-medium text-amber-700">{result.skipped} rows skipped</span>
          </div>
        )}
        {result.errors.length > 0 && (
          <div className="rounded-xl px-5 py-4 bg-red-50 border border-red-200 space-y-1">
            {result.errors.slice(0, 5).map((e, i) => (
              <p key={i} className="text-xs text-red-600">{e}</p>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => { setFile(null); setPreview(null); setResult(null); }}
            className="btn-secondary text-sm">Upload Another</button>
          <button onClick={onDone} className="btn-primary text-sm">Done</button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      {/* Template download */}
      <button onClick={downloadVendorTemplate}
        className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium transition">
        <Download size={14} /> Download template (.xlsx)
      </button>

      {!file ? (
        <>
          <input
            id={inputId}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          />
          <label
            ref={zoneRef}
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="block rounded-2xl p-12 text-center cursor-pointer border-2 border-dashed transition-colors"
            style={{
              borderColor: dragging ? '#0D9488' : '#E5E7EB',
              background: dragging ? '#F0FDFA' : '#EAF6FF',
              willChange: 'transform',
            }}
          >
            <Upload size={28} className="mx-auto text-teal-600 mb-3" />
            <p className="text-base font-semibold text-slate-700">Drop your vendor Excel file here</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx with columns: Company Name, Email, Phone, etc.</p>
          </label>
        </>
      ) : preview ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              Found <span className="font-bold text-blue-600">{preview.total}</span> vendors in {file.name}
            </p>
            <button onClick={() => { setFile(null); setPreview(null); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {preview.columns.slice(0, 5).map(col => (
                    <th key={col} className="text-left px-3 py-2 text-slate-400 font-semibold uppercase">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {preview.columns.slice(0, 5).map(col => (
                      <td key={col} className="px-3 py-2 text-slate-600 truncate max-w-[160px]">
                        {String(row[col] || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={handleImport} disabled={importing}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
            {importing
              ? <><Loader2 size={14} className="animate-spin" /> Importing {preview.total} vendors...</>
              : <><CheckCircle2 size={14} /> Import All ({preview.total} vendors)</>
            }
          </button>
        </div>
      ) : null}
    </div>
  );
}
