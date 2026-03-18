import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Header';
import UploadZone from '../components/UploadZone';
import ResultsDashboard from '../components/ResultsDashboard';
import CategorySidebar from '../components/CategorySidebar';
import DataTable from '../components/DataTable';
import CadExtractPanel from '../components/CadExtractPanel';
import ComparisonPanel from '../components/ComparisonPanel';
import VendorMailPanel from '../components/VendorMailPanel';
import BoqService from '../services/BoqService';
import { useAuth } from '../context/AuthContext';

const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.2 } },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]               = useState(false);
  const [boqResults, setBoqResults]         = useState(null);
  const [error, setError]                   = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [analyticsData, setAnalyticsData]   = useState(null);
  const [riskData, setRiskData]             = useState(null);
  const [boqFile, setBoqFile]               = useState(null);
  const [cadData, setCadData]               = useState(null);
  const [cadFile, setCadFile]               = useState(null);
  const [compResult, setCompResult]         = useState(null);
  const [pageView, setPageView]             = useState('upload');

  // ── BOQ upload handler ──────────────────────────────────────────
  const handleBoqUpload = async (file) => {
    setLoading(true);
    setError(null);
    setBoqResults(null);
    setAnalyticsData(null);
    setRiskData(null);
    setActiveCategory(null);
    setBoqFile(file);
    setCadData(null);
    setCadFile(null);
    setCompResult(null);

    try {
      const data = await BoqService.extractLangGraph(file);
      setBoqResults(data);

      if (data.items?.length > 0) {
        try { setAnalyticsData(await BoqService.analyze(data.items)); } catch {}
        try { setRiskData(await BoqService.getRisk(data.items)); } catch {}
      }
      setPageView('boq');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to process file.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBoqResults(null); setError(null); setActiveCategory(null);
    setAnalyticsData(null); setRiskData(null);
    setBoqFile(null); setCadData(null); setCadFile(null); setCompResult(null);
    setPageView('upload');
  };

  const handleCadExtracted = (data, file) => {
    setCadData(data);
    setCadFile(file);
  };

  const handleGoToCompare = () => setPageView('compare');

  const allItems = boqResults?.items || [];

  // ── Step config ─────────────────────────────────────────────────
  const steps = [
    { key: 'boq',     label: 'BOQ Results',     num: 1, enabled: !!boqResults },
    { key: 'cad',     label: 'CAD Extraction',  num: 2, enabled: !!boqResults },
    { key: 'compare', label: 'Comparison',      num: 3, enabled: !!cadData },
    { key: 'vendors', label: 'Vendors',         num: 4, enabled: !!boqResults },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ── Upload page ──────────────────────────────────────── */}
          {pageView === 'upload' && (
            <motion.div key="upload" {...fadeSlide} className="py-16">
              <div className="text-center mb-14">
                <h2 className="text-3xl font-bold text-slate-800 mb-3">
                  Upload your BOQ to get started
                </h2>
                <p className="text-base text-slate-400">
                  AI-powered 6-agent pipeline extracts every material item with high accuracy
                </p>
              </div>
              <UploadZone onUpload={handleBoqUpload} loading={loading} error={error} />
            </motion.div>
          )}

          {/* ── Post-extraction pages ────────────────────────────── */}
          {boqResults && (
            <motion.div key="results" {...fadeSlide} className="space-y-6">

              {/* Top navigation bar */}
              <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {boqResults.extracted_items} materials &middot; {boqResults.total_sheets} sheets
                    {cadData && <span className="text-slate-400 font-normal"> &middot; {cadData.extracted_items || cadData.items?.length || 0} CAD items</span>}
                  </p>
                  {boqFile && <p className="text-sm text-slate-400 mt-0.5">{boqFile.name}</p>}
                </div>

                {/* Step tabs */}
                <div className="flex items-center gap-1 p-1.5 rounded-xl bg-slate-100">
                  {steps.map((s) => (
                    <button key={s.key}
                      onClick={() => s.enabled && setPageView(s.key)}
                      disabled={!s.enabled}
                      className={`flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg transition-all duration-200 ${
                        pageView === s.key
                          ? 'bg-white text-slate-800 shadow-sm'
                          : s.enabled
                            ? 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                            : 'text-slate-300 cursor-not-allowed'
                      }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        pageView === s.key
                          ? 'bg-blue-600 text-white'
                          : s.enabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-300'
                      }`}>{s.num}</span>
                      {s.label}
                    </button>
                  ))}
                </div>

                <button onClick={handleReset}
                  className="text-sm font-medium text-blue-600 hover:underline">
                  New File
                </button>
              </div>

              {/* ── Page views ─────────────────────────────────── */}
              <AnimatePresence mode="wait">

                {/* BOQ Results */}
                {pageView === 'boq' && (
                  <motion.div key="boq" {...fadeSlide} className="space-y-6">
                    <ResultsDashboard results={boqResults} analyticsData={analyticsData} riskData={riskData} />
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                      <div className="xl:col-span-1">
                        <CategorySidebar
                          categories={boqResults.categories}
                          activeCategory={activeCategory}
                          onCategoryChange={setActiveCategory}
                        />
                      </div>
                      <div className="xl:col-span-4">
                        <DataTable items={allItems} activeCategory={activeCategory} title="BOQ Materials" />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button onClick={() => setPageView('cad')} className="btn-primary flex items-center gap-2">
                        Next: CAD Extraction →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* CAD Extraction */}
                {pageView === 'cad' && (
                  <motion.div key="cad" {...fadeSlide}>
                    <CadExtractPanel
                      onExtracted={handleCadExtracted}
                      onGoToCompare={handleGoToCompare}
                      onSkip={() => setPageView('vendors')}
                      existingCadData={cadData}
                      existingCadFile={cadFile}
                    />
                  </motion.div>
                )}

                {/* Comparison */}
                {pageView === 'compare' && (
                  <motion.div key="compare" {...fadeSlide}>
                    <ComparisonPanel
                      boqItems={allItems}
                      cadItems={cadData?.items || []}
                      cadFilename={cadFile?.name || 'Drawing.dwg'}
                      projectName={boqFile?.name?.replace(/\.(xlsx|xls)$/, '') || 'Construction Project'}
                      boqFilename={boqFile?.name || 'BOQ.xlsx'}
                      currentUser={user}
                      onApproved={() => setPageView('vendors')}
                      onNeedsReview={(r) => setCompResult(r)}
                    />
                  </motion.div>
                )}

                {/* Vendors */}
                {pageView === 'vendors' && (
                  <motion.div key="vendors" {...fadeSlide}>
                    <VendorMailPanel
                      items={allItems}
                      projectName={boqFile?.name?.replace(/\.(xlsx|xls)$/, '') || 'Construction Project'}
                      currentUser={user}
                    />
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
