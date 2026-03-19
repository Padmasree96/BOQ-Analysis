import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import {
  buttonMotion,
  motionEase,
  pageVariants,
  sectionVariants,
  subtleButtonMotion,
} from '../lib/motion';

export default function DashboardPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [boqResults, setBoqResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [boqFile, setBoqFile] = useState(null);
  const [cadData, setCadData] = useState(null);
  const [cadFile, setCadFile] = useState(null);
  const [compResult, setCompResult] = useState(null);
  const [pageView, setPageView] = useState('upload');

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
        try {
          setAnalyticsData(await BoqService.analyze(data.items));
        } catch {}

        try {
          setRiskData(await BoqService.getRisk(data.items));
        } catch {}
      }

      setPageView('boq');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to process file.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBoqResults(null);
    setError(null);
    setActiveCategory(null);
    setAnalyticsData(null);
    setRiskData(null);
    setBoqFile(null);
    setCadData(null);
    setCadFile(null);
    setCompResult(null);
    setPageView('upload');
  };

  const handleCadExtracted = (data, file) => {
    setCadData(data);
    setCadFile(file);
  };

  const handleGoToCompare = () => setPageView('compare');
  const allItems = boqResults?.items || [];

  const steps = [
    { key: 'boq', label: 'BOQ Results', num: 1, enabled: !!boqResults },
    { key: 'cad', label: 'CAD Extraction', num: 2, enabled: !!boqResults },
    { key: 'compare', label: 'Comparison', num: 3, enabled: !!cadData },
    { key: 'vendors', label: 'Vendors', num: 4, enabled: !!boqResults },
  ];

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-slate-50"
    >
      <Header />

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {pageView === 'upload' && (
            <motion.div
              key="upload"
              variants={sectionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="py-16"
            >
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

          {boqResults && (
            <motion.div
              key="results"
              variants={sectionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              <motion.div
                layout
                className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm"
              >
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {boqResults.extracted_items} materials &middot; {boqResults.total_sheets} sheets
                    {cadData && (
                      <span className="text-slate-400 font-normal">
                        {' '}
                        &middot; {cadData.extracted_items || cadData.items?.length || 0} CAD items
                      </span>
                    )}
                  </p>
                  {boqFile && <p className="text-sm text-slate-400 mt-0.5">{boqFile.name}</p>}
                </div>

                <div className="flex items-center gap-1 p-1.5 rounded-xl bg-slate-100">
                  {steps.map((step) => (
                    <motion.button
                      {...subtleButtonMotion}
                      key={step.key}
                      onClick={() => step.enabled && setPageView(step.key)}
                      disabled={!step.enabled}
                      className={`relative rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                        pageView === step.key
                          ? 'text-slate-800'
                          : step.enabled
                            ? 'text-slate-500 hover:text-slate-700'
                            : 'text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      {pageView === step.key && step.enabled && (
                        <motion.span
                          layoutId="dashboard-step-pill"
                          transition={motionEase.spring}
                          className="absolute inset-0 rounded-lg bg-white shadow-sm"
                        />
                      )}
                      <span className="relative flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          pageView === step.key
                            ? 'bg-blue-600 text-white'
                            : step.enabled
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-slate-100 text-slate-300'
                        }`}>
                          {step.num}
                        </span>
                        {step.label}
                      </span>
                    </motion.button>
                  ))}
                </div>

                <motion.button
                  {...subtleButtonMotion}
                  onClick={handleReset}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  New File
                </motion.button>
              </motion.div>

              <AnimatePresence mode="wait">
                {pageView === 'boq' && (
                  <motion.div
                    key="boq"
                    variants={sectionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="space-y-6"
                  >
                    <ResultsDashboard
                      results={boqResults}
                      analyticsData={analyticsData}
                      riskData={riskData}
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                      <div className="xl:col-span-1">
                        <CategorySidebar
                          categories={boqResults.categories}
                          activeCategory={activeCategory}
                          onCategoryChange={setActiveCategory}
                        />
                      </div>
                      <div className="xl:col-span-4">
                        <DataTable
                          items={allItems}
                          activeCategory={activeCategory}
                          title="BOQ Materials"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <motion.button
                        {...buttonMotion}
                        onClick={() => setPageView('cad')}
                        className="btn-primary flex items-center gap-2"
                      >
                        Next: CAD Extraction â†’
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {pageView === 'cad' && (
                  <motion.div
                    key="cad"
                    variants={sectionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <CadExtractPanel
                      onExtracted={handleCadExtracted}
                      onGoToCompare={handleGoToCompare}
                      onSkip={() => setPageView('vendors')}
                      existingCadData={cadData}
                      existingCadFile={cadFile}
                    />
                  </motion.div>
                )}

                {pageView === 'compare' && (
                  <motion.div
                    key="compare"
                    variants={sectionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <ComparisonPanel
                      boqItems={allItems}
                      cadItems={cadData?.items || []}
                      cadFilename={cadFile?.name || 'Drawing.dwg'}
                      projectName={boqFile?.name?.replace(/\.(xlsx|xls)$/, '') || 'Construction Project'}
                      boqFilename={boqFile?.name || 'BOQ.xlsx'}
                      currentUser={user}
                      onApproved={() => setPageView('vendors')}
                      onNeedsReview={(result) => setCompResult(result)}
                    />
                  </motion.div>
                )}

                {pageView === 'vendors' && (
                  <motion.div
                    key="vendors"
                    variants={sectionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
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
    </motion.div>
  );
}
