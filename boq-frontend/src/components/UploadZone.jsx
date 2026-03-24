import { AnimatePresence, motion } from 'framer-motion';
import { Upload, FileSpreadsheet, Loader2, AlertCircle, Zap } from 'lucide-react';
import { useState, useId, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  buttonMotion,
  notificationVariants,
  scaleInVariants,
} from '../lib/motion';

export default function UploadZone({ onUpload, loading, error }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();
  const zoneRef = useRef(null);
  const iconRef = useRef(null);

  // GSAP: Floating upload icon
  useGSAP(() => {
    if (!iconRef.current) return;
    gsap.to(iconRef.current, {
      y: -8, duration: 1.5, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
  }, { scope: zoneRef });

  // GSAP: Pulse effect on drag over
  useEffect(() => {
    if (!zoneRef.current) return;
    if (dragOver) {
      gsap.to(zoneRef.current, { scale: 1.02, boxShadow: '0 0 30px rgba(37, 99, 235, 0.15)', duration: 0.3, ease: 'power2.out' });
    } else {
      gsap.to(zoneRef.current, { scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.3, ease: 'power2.out' });
    }
  }, [dragOver]);

  const handleFile = (f) => {
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hidden file input — triggered by the label below */}
      <input
        id={inputId}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      {/* The entire drop zone is a <label> — clicking anywhere opens the file picker natively */}
      <label
        ref={zoneRef}
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="block rounded-xl p-14 text-center cursor-pointer transition-all duration-200 bg-white border-2 border-dashed hover:border-blue-400 hover:bg-blue-50/30"
        style={{
          borderColor: dragOver ? '#2563eb' : '#e2e8f0',
          background: dragOver ? '#eff6ff' : undefined,
          willChange: 'transform',
        }}
      >
        <div ref={iconRef} className="mx-auto w-16 h-16 rounded-xl flex items-center justify-center mb-5 bg-blue-50">
          <Upload size={24} className="text-blue-600" />
        </div>

        <p className="text-lg font-semibold text-slate-800">Drop your BOQ Excel file here</p>
        <p className="text-sm mt-1.5 text-slate-400">or click anywhere to browse files</p>

        <span className="inline-block mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition">
          Browse Files
        </span>

        <div className="flex gap-2 justify-center mt-3">
          {['.xlsx', '.xls'].map((ext) => (
            <span key={ext} className="text-[11px] font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-500">{ext}</span>
          ))}
        </div>
      </label>

      <AnimatePresence>
        {file && (
          <motion.div
            variants={scaleInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="mt-4 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-between px-5 py-3.5"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50">
                <FileSpreadsheet size={16} className="text-green-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-800">{file.name}</span>
                <span className="text-xs ml-2 text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            </div>
            <motion.button
              {...buttonMotion}
              disabled={loading}
              onClick={() => onUpload(file)}
              className="flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Extracting...</>
                : <><Zap size={14} /> Extract Materials</>
              }
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            variants={notificationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="mt-4 flex items-center gap-2 rounded-lg px-5 py-3 text-sm bg-red-50 border border-red-200 text-red-600"
          >
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
