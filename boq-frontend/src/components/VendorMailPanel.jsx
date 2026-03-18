import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Users, Package, ChevronDown, ChevronUp,
  CheckSquare, Square, Star, Send, Plus, X, MapPin,
  Phone, Award, Building2, FileText, Sparkles,
  Zap, Shield, RefreshCw, Clock
} from 'lucide-react';
import { boqService } from '../services/BoqService';

// ── Category helpers ─────────────────────────────────────────────
const CAT_COLORS = {
  'Electrical':            '#d97706',
  'Civil & Structural':    '#2563eb',
  'Plumbing & Drainage':   '#0891b2',
  'Mechanical & HVAC':     '#0d9488',
  'Fire Protection':       '#dc2626',
  'Finishing & Interiors': '#7c3aed',
  'External Development':  '#16a34a',
  'IT & Communication':    '#be185d',
};

function getCatColor(cat) {
  if (!cat) return '#64748b';
  for (const [key, color] of Object.entries(CAT_COLORS)) {
    if (cat.includes(key.split(' ')[0])) return color;
  }
  return '#64748b';
}

// ── Star rating ──────────────────────────────────────────────────
function StarRating({ rating }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={13}
          className={i < full ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
      ))}
      <span className="text-sm font-semibold text-slate-600 ml-1.5">{rating}</span>
    </span>
  );
}

// ── Vendor type badge ────────────────────────────────────────────
function VendorTypeBadge({ type }) {
  const styles = {
    recommended: { bg: '#eff6ff', color: '#2563eb', label: 'RECOMMENDED' },
    past:        { bg: '#f0fdf4', color: '#059669', label: 'PAST VENDOR' },
    new:         { bg: '#fffbeb', color: '#d97706', label: 'NEW' },
  };
  const s = styles[type] || styles.new;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── AI Match badge ───────────────────────────────────────────────
function AiMatchBadge({ score, matchedCategories }) {
  if (score <= 0) return null;
  const bg    = score >= 80 ? '#f0fdf4' : score >= 50 ? '#eff6ff' : '#f8fafc';
  const color = score >= 80 ? '#059669' : score >= 50 ? '#2563eb' : '#64748b';
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: bg }}>
      <Sparkles size={11} style={{ color }} />
      <span className="text-xs font-semibold" style={{ color }}>{score}% match</span>
      {matchedCategories.length > 0 && (
        <span className="text-[10px] text-slate-400">{matchedCategories.slice(0, 2).join(', ')}</span>
      )}
    </div>
  );
}

// ── Vendor profile card ──────────────────────────────────────────
function VendorProfileCard({ vendor, selected, onToggle, aiScore, matchedCategories }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
      style={{ border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}` }}>

      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}>
        {selected
          ? <CheckSquare size={20} className="text-blue-600 shrink-0" />
          : <Square size={20} className="text-slate-300 shrink-0" />
        }

        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Building2 size={22} className="text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-semibold text-slate-800">{vendor.name}</p>
            <VendorTypeBadge type={vendor.type} />
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={11} /> {vendor.location}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Phone size={11} /> {vendor.phone}
            </span>
            <span className="text-xs text-blue-600">{vendor.email}</span>
          </div>
          {aiScore > 0 && (
            <div className="mt-2">
              <AiMatchBadge score={aiScore} matchedCategories={matchedCategories} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <StarRating rating={vendor.rating} />
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded profile */}
      <AnimatePresence>
        {expanded && (
          <motion.div key="profile" initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">

            {/* Tabs */}
            <div className="flex border-t border-b border-slate-200 bg-slate-50">
              {[
                { key: 'overview',     label: 'Overview',          icon: FileText },
                { key: 'performance',  label: 'Past Performance',  icon: Award },
                { key: 'materials',    label: 'Materials',         icon: Package },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.key
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}>
                  <tab.icon size={13} /> {tab.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 bg-white">
              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Contact Person</p>
                    <p className="text-sm text-slate-700 font-medium">{vendor.contact_person}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Email</p>
                    <p className="text-sm text-blue-600">{vendor.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Phone</p>
                    <p className="text-sm text-slate-700">{vendor.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Location</p>
                    <p className="text-sm text-slate-700">{vendor.location}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vendor.categories?.map(c => (
                        <span key={c} className="text-xs px-2.5 py-1 rounded-lg"
                          style={{ background: getCatColor(c) + '15', color: getCatColor(c) }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Certifications</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vendor.certifications?.map(c => (
                        <span key={c} className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 flex items-center gap-1">
                          <Shield size={9} /> {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'performance' && (
                <div className="space-y-4">
                  {vendor.past_projects?.length > 0 ? (
                    vendor.past_projects.map((p, i) => (
                      <div key={i} className="rounded-xl p-4 bg-slate-50 border border-slate-200">
                        <p className="text-sm font-semibold text-slate-800 mb-1">{p.project}</p>
                        <p className="text-xs text-slate-500 mb-4">{p.material} &mdash; {p.qty}</p>
                        <div className="flex gap-8">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase mb-1.5">Delivery</p>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 rounded-full bg-slate-200">
                                <div className="h-full rounded-full bg-blue-500"
                                  style={{ width: `${(p.delivery / 5) * 100}%` }} />
                              </div>
                              <span className="text-sm font-semibold text-slate-600">{p.delivery}/5</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase mb-1.5">Quality</p>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 rounded-full bg-slate-200">
                                <div className="h-full rounded-full bg-green-500"
                                  style={{ width: `${(p.quality / 5) * 100}%` }} />
                              </div>
                              <span className="text-sm font-semibold text-slate-600">{p.quality}/5</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 py-6 text-center">No past project records</p>
                  )}
                </div>
              )}

              {activeTab === 'materials' && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Specializations</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {vendor.specialization?.map(s => (
                      <span key={s} className="text-sm px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-200">
                        {s}
                      </span>
                    ))}
                  </div>
                  {vendor.makes_approved && (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2.5 border border-green-100">
                      <Award size={14} /> Makes pre-approved for projects
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Step header ──────────────────────────────────────────────────
function StepHeader({ number, title, icon: Icon, count, isOpen, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-blue-50 text-blue-600 shrink-0">
          {number}
        </span>
        <Icon size={16} className="text-blue-600" />
        <span className="text-base font-semibold text-slate-700">{title}</span>
        {count !== undefined && (
          <span className="text-sm text-slate-400">({count} selected)</span>
        )}
      </div>
      {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function VendorMailPanel({ items = [], projectName = 'Construction Project' }) {
  const [selectedMaterials, setSelectedMaterials] = useState(new Set());
  const [materialCatFilter, setMaterialCatFilter] = useState('all');
  const [vendors, setVendors]           = useState([]);
  const [selectedVendors, setSelectedVendors] = useState(new Set());
  const [vendorFilter, setVendorFilter] = useState('all');
  const [manualEmail, setManualEmail]   = useState('');
  const [manualEmails, setManualEmails] = useState([]);
  const [emailBody, setEmailBody]       = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [openStep, setOpenStep]         = useState(1);
  const [sending, setSending]           = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState('');
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [secondsAgo, setSecondsAgo]     = useState(0);
  const intervalRef = useRef(null);
  const tickRef     = useRef(null);

  const materialCategories = useMemo(() => {
    const cats = new Set();
    items.forEach(item => { if (item.category) cats.add(item.category); });
    return Array.from(cats).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (materialCatFilter === 'all') return items;
    return items.filter(item => item.category === materialCatFilter);
  }, [items, materialCatFilter]);

  const selectedCategoryCounts = useMemo(() => {
    const counts = {};
    items.forEach((item, i) => {
      if (selectedMaterials.has(i) && item.category) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });
    return counts;
  }, [items, selectedMaterials]);

  const vendorAiScores = useMemo(() => {
    const selectedCats = Object.keys(selectedCategoryCounts);
    if (selectedCats.length === 0 || vendors.length === 0) return {};
    const scores = {};
    vendors.forEach(v => {
      const matched = [];
      (v.categories || []).forEach(vc => {
        selectedCats.forEach(sc => {
          if (sc.toLowerCase().includes(vc.toLowerCase().split(' ')[0]) ||
              vc.toLowerCase().includes(sc.toLowerCase().split(' ')[0])) {
            if (!matched.includes(vc)) matched.push(vc);
          }
        });
      });
      if (matched.length > 0) {
        const base = Math.round((matched.length / selectedCats.length) * 100);
        const bonus = (v.type === 'recommended' ? 10 : v.type === 'past' ? 5 : 0) +
                      Math.round((v.rating - 4.0) * 10);
        scores[v.id] = { score: Math.min(100, base + bonus), matchedCategories: matched };
      }
    });
    return scores;
  }, [vendors, selectedCategoryCounts]);

  const sortedVendors = useMemo(() => (
    [...vendors].sort((a, b) => {
      const diff = (vendorAiScores[b.id]?.score || 0) - (vendorAiScores[a.id]?.score || 0);
      return diff !== 0 ? diff : b.rating - a.rating;
    })
  ), [vendors, vendorAiScores]);

  // ── Fetch vendors ────────────────────────────────────────────
  const loadVendors = useCallback(() => {
    setLoadingVendors(true);
    boqService.getVendors(null, vendorFilter === 'all' ? null : vendorFilter)
      .then(data => {
        setVendors(data.vendors || []);
        setSecondsAgo(0);
      })
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false));
  }, [vendorFilter]);

  // Initial load + auto-refresh every 30 seconds
  useEffect(() => {
    loadVendors();
    intervalRef.current = setInterval(loadVendors, 30000);
    return () => clearInterval(intervalRef.current);
  }, [loadVendors]);

  // "X seconds ago" ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsAgo(prev => prev + 1);
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    setSelectedMaterials(new Set(items.map((_, i) => i)));
  }, [items]);

  useEffect(() => {
    if (!editingEmail) {
      const selected = items.filter((_, i) => selectedMaterials.has(i));
      setEmailBody(buildEmailBody(selected, projectName));
    }
  }, [selectedMaterials, items, projectName, editingEmail]);

  function buildEmailBody(sel, proj) {
    const today   = new Date();
    const replyBy = new Date(today.setDate(today.getDate() + 7))
      .toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const header  = 'No.  Material Description                              Qty        Unit     Category';
    const divider = '-'.repeat(92);
    const rows    = sel.map((item, i) => {
      const desc = (item.description || '').slice(0, 44).padEnd(44);
      const qty  = (item.quantity != null ? String(item.quantity) : 'TBD').padStart(10);
      const unit = (item.unit || '-').padEnd(8);
      return `${String(i + 1).padEnd(4)} ${desc} ${qty} ${unit} ${item.category || ''}`;
    });
    return `Dear Vendor,\n\nGreetings from ${proj}.\n\nProject : ${proj}\nQuote By: ${replyBy}\n\nMATERIAL REQUIREMENTS:\n${[header, divider, ...rows].join('\n')}\n\nPlease provide:\n  • Unit rate (INR) with GST breakup\n  • Delivery lead time\n  • Quote validity (minimum 30 days)\n\nReply to this email with your quotation.\n\nRegards,\nProject Manager\n${proj}`;
  }

  const toggleMaterial = (i) =>
    setSelectedMaterials(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const toggleVendor = (id) =>
    setSelectedVendors(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const addManualEmail = () => {
    const email = manualEmail.trim();
    if (email && email.includes('@') && !manualEmails.includes(email)) {
      setManualEmails(prev => [...prev, email]);
      setManualEmail('');
    }
  };

  const allVendorEmails = [
    ...vendors.filter(v => selectedVendors.has(v.id)).map(v => v.email),
    ...manualEmails,
  ];

  const aiSuggestedCount = Object.values(vendorAiScores).filter(v => v.score >= 50).length;

  const handleSend = async () => {
    if (allVendorEmails.length === 0) { setError('Please select at least one vendor.'); return; }
    const selectedItems = items.filter((_, i) => selectedMaterials.has(i));
    if (selectedItems.length === 0) { setError('Please select at least one material.'); return; }
    setSending(true); setError(''); setResult(null);
    try {
      const res = await boqService.sendVendorQuoteEmail({
        vendorEmails: allVendorEmails, materials: selectedItems, projectName,
      });
      setResult(res); setOpenStep(3);
    } catch {
      setError('Failed to send email. Check backend SMTP settings.');
    } finally {
      setSending(false);
    }
  };

  const refreshLabel = secondsAgo < 5
    ? 'Just now'
    : secondsAgo < 60
      ? `${secondsAgo}s ago`
      : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50">
            <Mail size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Send to Vendors</h3>
            <p className="text-sm text-slate-400">{allVendorEmails.length} vendor(s) selected &middot; {selectedMaterials.size} materials</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock size={12} />
          <span>{refreshLabel}</span>
          <button onClick={loadVendors} disabled={loadingVendors}
            className="ml-1 p-1.5 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={loadingVendors ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Step 1: Select Materials ──────────────────────────────── */}
      <div className="border-b border-slate-200">
        <StepHeader number="1" title="Select Materials to Share" icon={Package}
          count={selectedMaterials.size} isOpen={openStep === 1}
          onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)} />

        <AnimatePresence initial={false}>
          {openStep === 1 && (
            <motion.div key="s1" initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="px-6 pb-6">

                {/* Category filter pills */}
                <div className="flex flex-wrap gap-2 mb-5">
                  <button onClick={() => setMaterialCatFilter('all')}
                    className={`text-sm font-medium px-4 py-2 rounded-xl transition-all duration-200 ${
                      materialCatFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    All ({items.length})
                  </button>

                  {materialCategories.map(cat => {
                    const count    = items.filter(i => i.category === cat).length;
                    const selCount = selectedCategoryCounts[cat] || 0;
                    const color    = getCatColor(cat);
                    const isActive = materialCatFilter === cat;
                    return (
                      <button key={cat} onClick={() => setMaterialCatFilter(isActive ? 'all' : cat)}
                        className="text-sm font-medium px-4 py-2 rounded-xl transition-all duration-200 flex items-center gap-2"
                        style={{
                          background: isActive ? color : '#f1f5f9',
                          color: isActive ? '#fff' : '#475569',
                          border: `1px solid ${isActive ? color : '#e2e8f0'}`,
                        }}>
                        <span className="w-2 h-2 rounded-full"
                          style={{ background: isActive ? '#fff' : color }} />
                        {cat.length > 22 ? cat.slice(0, 20) + '…' : cat}
                        <span className="text-xs opacity-70">{selCount}/{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick-select controls */}
                <div className="flex items-center gap-4 mb-4 px-1">
                  {materialCatFilter === 'all' ? (
                    <>
                      <button onClick={() => setSelectedMaterials(new Set(items.map((_, i) => i)))}
                        className="text-sm font-medium text-blue-600 hover:underline">Select All</button>
                      <button onClick={() => setSelectedMaterials(new Set())}
                        className="text-sm font-medium text-slate-400 hover:underline">Deselect All</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => {
                        setSelectedMaterials(prev => {
                          const s = new Set(prev);
                          items.forEach((item, i) => { if (item.category === materialCatFilter) s.add(i); });
                          return s;
                        });
                      }} className="text-sm font-medium text-blue-600 hover:underline">
                        Select all {materialCatFilter}
                      </button>
                      <button onClick={() => {
                        setSelectedMaterials(prev => {
                          const s = new Set(prev);
                          items.forEach((item, i) => { if (item.category === materialCatFilter) s.delete(i); });
                          return s;
                        });
                      }} className="text-sm font-medium text-slate-400 hover:underline">
                        Deselect all
                      </button>
                    </>
                  )}
                  <span className="text-sm text-slate-400 ml-auto">
                    {selectedMaterials.size} of {items.length} selected
                  </span>
                </div>

                {/* Material items */}
                <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                  {filteredItems.map((item) => {
                    const globalIdx = items.indexOf(item);
                    const color     = getCatColor(item.category);
                    const isSel     = selectedMaterials.has(globalIdx);
                    return (
                      <div key={globalIdx} onClick={() => toggleMaterial(globalIdx)}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-150"
                        style={{
                          background: isSel ? '#eff6ff' : '#f8fafc',
                          border: `1px solid ${isSel ? '#bfdbfe' : '#e2e8f0'}`,
                        }}>
                        {isSel
                          ? <CheckSquare size={16} className="text-blue-600 shrink-0" />
                          : <Square size={16} className="text-slate-300 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{item.description}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {item.quantity ?? 'TBD'} {item.unit || ''}
                            {item.brand ? ` — ${item.brand}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-lg shrink-0"
                          style={{ background: color + '15', color }}>
                          {item.category || 'General'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => setOpenStep(2)}
                  className="btn-primary w-full mt-5 py-3 text-sm">
                  Next: Select Vendors ({selectedMaterials.size} materials)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Step 2: Vendors ──────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <StepHeader number="2" title="Select Vendors" icon={Users}
          count={allVendorEmails.length} isOpen={openStep === 2}
          onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)} />

        <AnimatePresence initial={false}>
          {openStep === 2 && (
            <motion.div key="s2" initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="px-6 pb-6">

                {/* AI suggestion banner */}
                {aiSuggestedCount > 0 && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 mb-5">
                    <Sparkles size={18} className="text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-800">AI Vendor Suggestion</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Found <strong>{aiSuggestedCount} vendors</strong> matching your{' '}
                        {Object.keys(selectedCategoryCounts).length} selected categories — sorted by relevance.
                      </p>
                      <button onClick={() => {
                        const ids = Object.entries(vendorAiScores)
                          .filter(([, v]) => v.score >= 50).map(([id]) => id);
                        setSelectedVendors(new Set(ids));
                      }}
                        className="mt-2 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 w-fit">
                        <Zap size={12} /> Auto-select matched vendors
                      </button>
                    </div>
                  </div>
                )}

                {/* Filter tabs */}
                <div className="flex gap-2 mb-5">
                  {['all', 'recommended', 'past', 'new'].map(f => (
                    <button key={f} onClick={() => setVendorFilter(f)}
                      className={`text-sm font-medium px-4 py-2 rounded-xl capitalize transition-all duration-200 ${
                        vendorFilter === f
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>

                {/* Vendor cards */}
                <div className="max-h-[800px] overflow-y-auto space-y-3 mb-5 pr-1">
                  {loadingVendors ? (
                    <div className="py-12 text-center">
                      <RefreshCw size={24} className="mx-auto mb-3 text-slate-400 animate-spin" />
                      <p className="text-sm text-slate-400">Loading vendor data...</p>
                    </div>
                  ) : sortedVendors.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">No vendors found</p>
                  ) : sortedVendors.map(vendor => (
                    <VendorProfileCard
                      key={vendor.id}
                      vendor={vendor}
                      selected={selectedVendors.has(vendor.id)}
                      onToggle={() => toggleVendor(vendor.id)}
                      aiScore={vendorAiScores[vendor.id]?.score || 0}
                      matchedCategories={vendorAiScores[vendor.id]?.matchedCategories || []}
                    />
                  ))}
                </div>

                {/* Manual email */}
                <div className="flex gap-2 mb-3">
                  <input type="email" value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addManualEmail()}
                    placeholder="+ Add vendor email manually"
                    className="flex-1 px-4 py-3 rounded-xl text-sm border border-slate-200 bg-slate-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                  <button onClick={addManualEmail}
                    className="btn-primary !px-4 !py-3">
                    <Plus size={16} />
                  </button>
                </div>

                {manualEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {manualEmails.map(email => (
                      <span key={email}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-slate-100 text-slate-600">
                        {email}
                        <button onClick={() => setManualEmails(prev => prev.filter(e => e !== email))}>
                          <X size={11} className="text-slate-400 hover:text-red-500 transition-colors" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <button onClick={() => setOpenStep(3)}
                  className="btn-primary w-full py-3 text-sm">
                  Next: Preview Email ({allVendorEmails.length} vendors)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Step 3: Preview & Send ───────────────────────────────── */}
      <div>
        <StepHeader number="3" title="Email Preview & Send" icon={Mail}
          isOpen={openStep === 3}
          onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)} />

        <AnimatePresence initial={false}>
          {openStep === 3 && (
            <motion.div key="s3" initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="px-6 pb-6">
                <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">TO</p>
                  <p className="text-sm text-slate-600 break-all">
                    {allVendorEmails.join(', ') || 'No vendors selected'}
                  </p>
                </div>
                <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">SUBJECT</p>
                  <p className="text-sm font-semibold text-slate-700">Material Quote Request — {projectName}</p>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase">BODY</p>
                    <button onClick={() => setEditingEmail(!editingEmail)}
                      className="text-xs font-medium text-blue-600 hover:underline">
                      {editingEmail ? 'Done Editing' : 'Edit'}
                    </button>
                  </div>
                  {editingEmail ? (
                    <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                      rows={14}
                      className="w-full px-4 py-3 rounded-xl text-xs font-mono border border-slate-200 bg-white resize-y focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                  ) : (
                    <pre className="w-full rounded-xl px-4 py-3 text-xs font-mono max-h-72 overflow-y-auto whitespace-pre-wrap bg-slate-50 border border-slate-200 text-slate-600">
                      {emailBody}
                    </pre>
                  )}
                </div>

                {error && (
                  <p className="text-sm mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600">
                    {error}
                  </p>
                )}
                {result && (
                  <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${
                    result.success
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-amber-50 border border-amber-200 text-amber-700'
                  }`}>
                    {result.success
                      ? `✓ Sent to ${result.sent_to?.length || allVendorEmails.length} vendor(s) successfully.`
                      : 'SMTP not configured. Copy the email and send manually.'
                    }
                  </div>
                )}

                <button onClick={handleSend} disabled={sending || allVendorEmails.length === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-40 disabled:cursor-not-allowed">
                  {sending
                    ? <><RefreshCw size={15} className="animate-spin" /> Sending...</>
                    : <><Send size={15} /> Send to {allVendorEmails.length} Vendor(s)</>
                  }
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
