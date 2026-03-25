import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Plus, Search, FolderKanban, Calendar, MapPin, MoreVertical, Copy, Archive, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import CreateProjectFlow from '../components/NewProject/CreateProjectFlow';
import Layout from '../components/Layout';

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  closed: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-200 text-slate-500',
};

const PROJECT_TYPES = ['Building', 'Infrastructure', 'MEP', 'Civil', 'Industrial', 'Residential', 'Commercial'];

function CreateProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    project_name: '', project_type: 'Building', location: '', client: '',
    budget: '', description: '', deadline: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.project_name.trim()) return toast.error('Project name is required');
    setSaving(true);
    try {
      await onCreate({ ...form, budget: form.budget ? Number(form.budget) : 0, deadline: form.deadline || null });
      toast.success('Project created');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Create New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input value={form.project_name} onChange={e => set('project_name', e.target.value)}
            placeholder="Project Name *" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.project_type} onChange={e => set('project_type', e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input value={form.location} onChange={e => set('location', e.target.value)}
              placeholder="Location" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.client} onChange={e => set('client', e.target.value)}
              placeholder="Client Name" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <input type="number" value={form.budget} onChange={e => set('budget', e.target.value)}
              placeholder="Budget" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Description (optional)" rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function ProjectCard({ project, onDuplicate, onArchive, onDelete, onClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef(null);

  // GSAP: 3D tilt on hover
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const handleMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
      gsap.to(el, { rotateY: x, rotateX: y, y: -4, boxShadow: '0 18px 40px rgba(15,23,42,0.10)', duration: 0.3, ease: 'power2.out', transformPerspective: 600 });
    };
    const handleLeave = () => gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => { el.removeEventListener('mousemove', handleMove); el.removeEventListener('mouseleave', handleLeave); };
  }, []);

  return (
    <motion.div ref={cardRef} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer group gsap-card"
      style={{ willChange: 'transform' }}
      onClick={() => onClick(project.id)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <FolderKanban size={18} className="text-blue-600" />
          </div>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status] || STATUS_COLORS.draft}`}>
            {project.status}
          </span>
        </div>
        <div className="relative">
          <button onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 opacity-0 group-hover:opacity-100 transition">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-10"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => { onDuplicate(project); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <Copy size={14} /> Duplicate
              </button>
              <button onClick={() => { onArchive(project); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <Archive size={14} /> Archive
              </button>
              <button onClick={() => { onDelete(project); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1 truncate">{project.project_name}</h3>
      <p className="text-xs text-slate-400 mb-3 truncate">{project.client_name || project.project_type}</p>
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        {project.location && (
          <span className="flex items-center gap-1"><MapPin size={12} />{project.location}</span>
        )}
        {project.deadline && (
          <span className="flex items-center gap-1"><Calendar size={12} />{format(new Date(project.deadline), 'dd MMM yyyy')}</span>
        )}
      </div>
      {Number(project.estimated_value) > 0 && (
        <p className="text-xs font-medium text-slate-600 mt-2">
          Estimated value:{' '}
          {Number(project.estimated_value).toLocaleString('en-IN', {
            style: 'currency',
            currency: project.currency || 'INR',
            maximumFractionDigits: 0,
          })}
        </p>
      )}
    </motion.div>
  );
}

export default function ProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject, duplicateProject, refetch } = useProjects();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const vendorIdFromQuery = searchParams.get('vendorId');
  const vendorIdFromState = location.state?.vendorId;
  const vendorId = vendorIdFromQuery || vendorIdFromState;

  console.log("Projects Page - vendorId found:", vendorId);

  const gridRef = useRef(null);
  const filters = ['all', 'active', 'draft', 'pending', 'closed', 'archived'];
  const filtered = projects
    .filter(p => filter === 'all' ? p.status !== 'archived' : p.status === filter)
    .filter(p => !search || p.project_name.toLowerCase().includes(search.toLowerCase()));

  // GSAP: Stagger card entrance on filter change
  useGSAP(() => {
    if (!gridRef.current || loading) return;
    const cards = gridRef.current.querySelectorAll('.gsap-card');
    if (cards.length) {
      gsap.fromTo(cards,
        { opacity: 0, y: 30, rotateY: 5, transformPerspective: 800 },
        { opacity: 1, y: 0, rotateY: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(1.4)' }
      );
    }
  }, { scope: gridRef, dependencies: [filter, search, loading] });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Projects</h1>
            <p className="text-sm text-slate-400">{projects.length} total projects</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition">
            <Plus size={16} /> New Project
          </button>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-full sm:w-60 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-2xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects yet"
            description="Create your first project to start extracting BOQ materials"
            action={() => setShowCreate(true)} actionLabel="Create Project" />
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p}
                onClick={(id) => {
                  console.log("Project clicked:", id, "with vendorId:", vendorId);
                  if (vendorId) {
                    navigate(`/projects/${id}?vendorId=${vendorId}`);
                  } else {
                    navigate(`/projects/${id}`);
                  }
                }}
                onDuplicate={async (proj) => { await duplicateProject(proj); toast.success('Project duplicated'); }}
                onArchive={async (proj) => { await updateProject(proj.id, { status: 'archived' }); toast.success('Project archived'); }}
                onDelete={(proj) => setDeleteTarget(proj)} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateProjectFlow
            userId={user?.id}
            onCancel={() => setShowCreate(false)}
            onComplete={({ projectId, project, withExtraction, next }) => {
              setShowCreate(false);
              refetch();

              const projectPath = withExtraction
                ? `/projects/${projectId}?autoExtract=1`
                : `/projects/${projectId}`;

              if (next === 'vendors') {
                navigate('/vendors', {
                  state: {
                    postProject: {
                      projectId,
                      projectName: project?.project_name || 'Project',
                      returnTo: projectPath,
                    },
                  },
                });
                return;
              }

              navigate(projectPath);
            }}
          />
        )}
        {deleteTarget && (
          <ConfirmDialog title="Delete Project"
            message={`Are you sure you want to delete "${deleteTarget.project_name}"? This cannot be undone.`}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async () => { await deleteProject(deleteTarget.id); setDeleteTarget(null); toast.success('Project deleted'); }} />
        )}
      </AnimatePresence>
    </Layout>
  );
}
