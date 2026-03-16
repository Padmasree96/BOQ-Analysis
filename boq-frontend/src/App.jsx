import { useState } from 'react';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ResultsDashboard from './components/ResultsDashboard';
import CategorySidebar from './components/CategorySidebar';
import DataTable from './components/DataTable';
import BoqService from './services/BoqService';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [riskData, setRiskData] = useState(null);

  const handleUpload = async (file) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setAnalyticsData(null);
    setRiskData(null);
    setActiveCategory(null);

    try {
      // Step 1: Extract materials via LangGraph 6-agent pipeline
      const data = await BoqService.extractLangGraph(file);
      setResults(data);

      // Step 2: Analyze (independent — failure doesn't block risk)
      if (data.items && data.items.length > 0) {
        try {
          const analytics = await BoqService.analyze(data.items);
          setAnalyticsData(analytics);
        } catch (analyticsErr) {
          console.warn('Analytics failed (non-critical):', analyticsErr);
        }

        // Step 3: Risk assessment (independent — failure doesn't block results)
        try {
          const risk = await BoqService.getRisk(data.items);
          setRiskData(risk);
        } catch (riskErr) {
          console.warn('Risk scoring failed (non-critical):', riskErr);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setError(
        err.response?.data?.detail ||
        err.message ||
        'Failed to process file. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const allItems = results?.items || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload zone — always visible when no results */}
        {!results && (
          <div className="py-12">
            <UploadZone onUpload={handleUpload} loading={loading} error={error} />
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Mini upload bar for re-upload */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-3">
              <p className="text-sm text-slate-600">
                <span className="font-medium">{results.extracted_items}</span> materials extracted from{' '}
                <span className="font-medium">{results.total_sheets}</span> sheets
              </p>
              <button
                onClick={() => {
                  setResults(null);
                  setError(null);
                  setActiveCategory(null);
                  setAnalyticsData(null);
                  setRiskData(null);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Upload New File
              </button>
            </div>

            {/* Dashboard */}
            <ResultsDashboard
              results={results}
              analyticsData={analyticsData}
              riskData={riskData}
            />

            {/* Sidebar + Table */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <CategorySidebar
                  categories={results.categories}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                />
              </div>
              <div className="lg:col-span-3">
                <DataTable items={allItems} activeCategory={activeCategory} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
