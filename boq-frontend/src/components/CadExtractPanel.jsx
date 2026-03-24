import { useState, useId, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  GitCompare,
  Loader2,
  RotateCcw,
  SkipForward,
  Upload,
} from 'lucide-react';
import { boqService } from '../services/BoqService';
import CategorySidebar from './CategorySidebar';
import DataTable from './DataTable';
import {
  buttonMotion,
  notificationVariants,
  panelVariants,
  scaleInVariants,
  subtleButtonMotion,
} from '../lib/motion';

function CadUploadZone({ onFile, loading }) {
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState(null);
  const inputId = useId();
  const cadIconRef = useRef(null);
  const cadZoneRef = useRef(null);

  // GSAP: Floating icon + drag pulse
  useGSAP(() => {
    if (!cadIconRef.current) return;
    gsap.to(cadIconRef.current, { y: -6, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }, { scope: cadZoneRef });

  useEffect(() => {
    if (!cadZoneRef.current) return;
    if (dragging) {
      gsap.to(cadZoneRef.current, { scale: 1.02, boxShadow: '0 0 25px rgba(139, 92, 246, 0.15)', duration: 0.25, ease: 'power2.out' });
    } else {
      gsap.to(cadZoneRef.current, { scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.25, ease: 'power2.out' });
    }
  }, [dragging]);

  const handlePick = (file) => {
    if (file) setPicked(file);
  };

  return (
    <div className="space-y-4">
      {/* Hidden file input — triggered by the label */}
      <input
        id={inputId}
        type="file"
        accept=".dwg,.dxf,.pdf"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files[0]) handlePick(event.target.files[0]);
          event.target.value = '';
        }}
      />

      {loading ? (
        <div className="rounded-2xl p-16 text-center bg-white border-2 border-dashed border-slate-200">
          <div className="space-y-4">
            <Loader2 size={44} className="mx-auto text-violet-500 animate-spin" />
            <div>
              <p className="text-lg font-semibold text-slate-800">Extracting materials...</p>
              <p className="text-sm text-slate-400 mt-1">
                AI agents are scanning schedules, dimensions, and specifications.
              </p>
            </div>
            {picked && <p className="text-xs text-slate-400">{picked.name}</p>}
          </div>
        </div>
      ) : !picked ? (
        <label
          ref={cadZoneRef}
          htmlFor={inputId}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files[0]) handlePick(event.dataTransfer.files[0]);
          }}
          className="block rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 bg-white border-2 border-dashed hover:border-violet-400 hover:bg-violet-50/30"
          style={{
            borderColor: dragging ? '#7c3aed' : '#e2e8f0',
            background: dragging ? '#faf5ff' : undefined,
            willChange: 'transform',
          }}
        >
          <div ref={cadIconRef} className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6 bg-violet-50">
            <Upload size={32} className="text-violet-600" />
          </div>
          <p className="text-xl font-semibold text-slate-800 mb-2">Upload CAD Drawing</p>
          <p className="text-sm text-slate-400 mb-3">
            Extract material schedules from your drawing with the CAD pipeline.
          </p>
          <span className="inline-block mb-4 px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition">
            Browse Files
          </span>
          <div className="flex gap-3 justify-center">
            {['.dwg', '.dxf', '.pdf'].map((ext) => (
              <span key={ext} className="text-sm font-medium px-4 py-1.5 rounded-full bg-violet-50 text-violet-600">
                {ext}
              </span>
            ))}
          </div>
        </label>
      ) : null}

      <AnimatePresence>
        {picked && !loading && (
          <motion.div
            variants={scaleInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-50">
                <FileText size={18} className="text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{picked.name}</p>
                <p className="text-xs text-slate-400">{(picked.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                {...subtleButtonMotion}
                onClick={() => {
                  setPicked(null);
                  inputRef.current?.click();
                }}
                className="btn-secondary flex items-center gap-1.5 text-sm !py-2"
              >
                <RotateCcw size={13} /> Change
              </motion.button>
              <motion.button
                {...buttonMotion}
                onClick={() => onFile(picked)}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <ArrowRight size={14} /> Extract Materials
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExtractionSummary({ cadData, cadFile, onReupload, onCompare }) {
  const itemCount = cadData.extracted_items || cadData.items?.length || 0;
  const categoryCount = Object.keys(cadData.categories || {}).length;
  const usedVision = cadData.used_vision;
  const fileType = cadData.file_type || '';
  const pageCount = cadData.page_count || 0;

  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-3"
    >
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${itemCount > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
            {itemCount > 0
              ? <CheckCircle2 size={24} className="text-green-600" />
              : <AlertTriangle size={24} className="text-amber-500" />}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-800">
              {itemCount > 0 ? 'CAD Extraction Complete' : 'Extraction Ran with Limited Results'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {cadFile && <span className="text-sm text-slate-400">{cadFile.name}</span>}
              {pageCount > 0 && <span className="text-xs text-slate-300">({pageCount} pages)</span>}
              {usedVision && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">Vision AI</span>}
              {fileType && fileType !== 'pdf' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-500 font-medium uppercase">
                  {fileType}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-800">{itemCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Materials</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-800">{categoryCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Categories</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <motion.button
            {...subtleButtonMotion}
            onClick={onReupload}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RotateCcw size={13} /> Re-upload
          </motion.button>
          <motion.button
            {...buttonMotion}
            onClick={onCompare}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <GitCompare size={14} /> Compare with BOQ
          </motion.button>
        </div>
      </div>

      {itemCount === 0 && (
        <div className="rounded-xl px-5 py-4 bg-amber-50 border border-amber-200 text-sm text-amber-700 space-y-2">
          <p><strong>No materials were extracted.</strong></p>
          <p>The most common cause is a temporary CAD model or quota failure. Retry in a few minutes.</p>
          <p className="text-[12px] text-amber-500">
            Tip: verify the file contains material schedules or tagged drawing content.
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function CadExtractPanel({
  onExtracted,
  onGoToCompare,
  onSkip,
  existingCadData = null,
  existingCadFile = null,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cadData, setCadData] = useState(existingCadData);
  const [cadFile, setCadFile] = useState(existingCadFile);
  const [activeCategory, setActiveCategory] = useState(null);

  const handleFile = async (file) => {
    setLoading(true);
    setError('');
    setCadFile(file);

    try {
      const data = await boqService.extractCAD(file);
      setCadData(data);
      onExtracted?.(data, file);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Extraction failed. Try again.');
      setCadFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReupload = () => {
    setCadData(null);
    setCadFile(null);
    setActiveCategory(null);
  };

  return (
    <div className="space-y-6">
      <motion.div
        variants={panelVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex items-center justify-between shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-violet-100">
            <span className="text-sm font-bold text-violet-700">2</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">CAD Drawing Extraction</h3>
            <p className="text-sm text-slate-400">Read material schedules directly from your drawing.</p>
          </div>
        </div>
        {!cadData && (
          <motion.button
            {...subtleButtonMotion}
            onClick={onSkip}
            className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1.5 transition-colors"
          >
            <SkipForward size={14} /> Skip to Vendors
          </motion.button>
        )}
      </motion.div>

      {!cadData ? (
        <>
          <CadUploadZone onFile={handleFile} loading={loading} />
          <AnimatePresence>
            {error && (
              <motion.div
                variants={notificationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="rounded-xl px-5 py-3.5 bg-red-50 border border-red-200 text-sm text-red-600"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          <ExtractionSummary
            cadData={cadData}
            cadFile={cadFile}
            onReupload={handleReupload}
            onCompare={onGoToCompare}
          />

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-1">
              <CategorySidebar
                categories={cadData.categories || {}}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
            </div>
            <div className="xl:col-span-4">
              <DataTable
                items={cadData.items || []}
                activeCategory={activeCategory}
                title="CAD Extracted Materials"
                emptyMessage="No materials extracted from this drawing"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <motion.button
              {...buttonMotion}
              onClick={onGoToCompare}
              className="btn-primary flex items-center gap-2"
            >
              <GitCompare size={14} /> Compare with BOQ â†’
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}
