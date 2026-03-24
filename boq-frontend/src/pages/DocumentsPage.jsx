import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Upload, FolderPlus, FileText, FileSpreadsheet, File, Image,
  Download, Trash2, Search, Folder
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';

const FILE_ICONS = {
  pdf: { icon: FileText, color: 'text-red-500 bg-red-50' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-500 bg-green-50' },
  xls: { icon: FileSpreadsheet, color: 'text-green-500 bg-green-50' },
  dwg: { icon: File, color: 'text-blue-500 bg-blue-50' },
  dxf: { icon: File, color: 'text-blue-500 bg-blue-50' },
  png: { icon: Image, color: 'text-purple-500 bg-purple-50' },
  jpg: { icon: Image, color: 'text-purple-500 bg-purple-50' },
};

function getFileConfig(name) {
  const ext = name?.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || { icon: File, color: 'text-slate-500 bg-slate-50' };
}

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [uploading, setUploading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const tableRef = useRef(null);
  const folders = ['All', ...new Set(documents.map(d => d.folder).filter(Boolean))];
  const filtered = documents
    .filter(d => selectedFolder === 'All' || d.folder === selectedFolder)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()));

  // GSAP: Stagger file rows on load/filter
  useGSAP(() => {
    if (!tableRef.current || loading) return;
    const rows = tableRef.current.querySelectorAll('tbody tr');
    if (rows.length) {
      gsap.fromTo(rows,
        { opacity: 0, x: -15, scale: 0.98 },
        { opacity: 1, x: 0, scale: 1, duration: 0.4, stagger: 0.04, ease: 'power3.out' }
      );
    }
  }, { scope: tableRef, dependencies: [filtered.length, loading, selectedFolder] });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('Max file size is 50MB'); return; }

    setUploading(true);
    try {
      const path = `${user.id}/documents/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
      if (uploadError) throw uploadError;

      await supabase.from('documents').insert({
        user_id: user.id,
        folder: selectedFolder === 'All' ? 'General' : selectedFolder,
        name: file.name,
        file_path: path,
        file_type: file.name.split('.').pop()?.toLowerCase(),
        file_size: file.size,
        uploaded_by: user.id,
      });
      toast.success('File uploaded');
      fetch();
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    await supabase.storage.from('project-files').remove([doc.file_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    toast.success('File deleted');
    fetch();
  };

  const handleDownload = async (doc) => {
    const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const createFolder = () => {
    const name = prompt('Folder name:');
    if (name?.trim()) {
      setSelectedFolder(name.trim());
      toast.success(`Folder "${name.trim()}" created`);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Documents</h1>
            <p className="text-sm text-slate-400">{documents.length} files</p>
          </div>
          <div className="flex gap-2">
            <button onClick={createFolder}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">
              <FolderPlus size={16} /> New Folder
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition cursor-pointer">
              <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload File'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Folders */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {folders.map(f => (
            <button key={f} onClick={() => setSelectedFolder(f)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                selectedFolder === f ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>
              <Folder size={14} /> {f}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-5 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        {/* Files */}
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No files uploaded"
            description="Upload BOQ spreadsheets, CAD files, or specification documents" />
        ) : (
          <div ref={tableRef} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden sm:table-cell">Folder</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden md:table-cell">Modified</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase hidden md:table-cell">Size</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => {
                  const conf = getFileConfig(doc.name);
                  const Icon = conf.icon;
                  return (
                    <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${conf.color}`}>
                            <Icon size={16} />
                          </div>
                          <span className="font-medium text-slate-700 truncate max-w-[200px]">{doc.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{doc.folder}</td>
                      <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                        {format(new Date(doc.created_at), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{formatSize(doc.file_size)}</td>
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                            <Download size={14} />
                          </button>
                          <button onClick={() => handleDelete(doc)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
