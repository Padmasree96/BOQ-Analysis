import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, Loader2, AlertCircle, Zap } from 'lucide-react';
import { useRef, useState } from 'react';

export default function UploadZone({ onUpload, loading, error }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="rounded-xl p-14 text-center cursor-pointer transition-all duration-200 bg-white border-2 border-dashed"
        style={{ borderColor: dragOver ? '#2563eb' : '#e2e8f0', background: dragOver ? '#eff6ff' : '#fff' }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => handleFile(e.target.files[0])} />

        <motion.div animate={{ y: dragOver ? -4 : 0 }}
          className="mx-auto w-16 h-16 rounded-xl flex items-center justify-center mb-5 bg-blue-50">
          <Upload size={24} className="text-blue-600" />
        </motion.div>

        <p className="text-lg font-semibold text-slate-800">Drop your BOQ Excel file here</p>
        <p className="text-sm mt-1.5 text-slate-400">Supports .xlsx and .xls (max 10MB)</p>

        <div className="flex gap-2 justify-center mt-4">
          {['.xlsx', '.xls'].map((ext) => (
            <span key={ext} className="text-[11px] font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-500">{ext}</span>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {file && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mt-4 card flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50">
                <FileSpreadsheet size={16} className="text-green-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-800">{file.name}</span>
                <span className="text-xs ml-2 text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            </div>
            <button disabled={loading} onClick={(e) => { e.stopPropagation(); onUpload(file); }}
              className="btn-primary flex items-center gap-2 text-xs !py-2 !px-5">
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Extracting...</>
                : <><Zap size={14} /> Extract Materials</>
              }
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-2 rounded-lg px-5 py-3 text-sm bg-red-50 border border-red-200 text-red-600">
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
