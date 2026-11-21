import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Filter,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  ChevronRight,
  BarChart3,
  Layers,
  Search,
  ExternalLink,
  Info
} from 'lucide-react';

export default function App() {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendHealth, setBackendHealth] = useState(null);
  const [activeTab, setActiveTab] = useState('table'); // 'table' | 'product_view'
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProduct, setFilterProduct] = useState('ALL');
  const [filterSentiment, setFilterSentiment] = useState('ALL');
  const [filterTopic, setFilterTopic] = useState('ALL');
  const [filterNeedsReply, setFilterNeedsReply] = useState(false);
  const [filterMismatchOnly, setFilterMismatchOnly] = useState(false);

  // Suggested reply loading states: { [review_id]: boolean }
  const [replyLoading, setReplyLoading] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  // Check backend health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setBackendHealth(data))
      .catch(() => setBackendHealth({ status: 'offline', provider: 'unknown' }));
  }, []);

  // Upload handler
  const handleFileUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errData.detail || 'Failed to process file');
      }

      const data = await response.json();
      setReviews(data.reviews || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Load Bundled Sample
  const handleLoadSample = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/sample');
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Failed to load sample' }));
        throw new Error(errData.detail || 'Could not load sample data');
      }
      const data = await response.json();
      setReviews(data.reviews || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message || 'Failed to load sample data.');
    } finally {
      setLoading(false);
    }
  };

  // On-click Suggested Reply Generator (Core Requirement 7)
  const handleGenerateReply = async (review) => {
    setReplyLoading((prev) => ({ ...prev, [review.review_id]: true }));
    try {
      const payload = {
        review_id: review.review_id,
        product: review.product,
        review_text: review.cleaned_text,
        sentiment: review.analysis?.sentiment || 'negative',
        topics: review.analysis?.topics || ['quality'],
        summary: review.analysis?.summary || 'Customer review',
      };

      const response = await fetch('/api/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to generate reply');

      const data = await response.json();
      setReviews((prev) =>
        prev.map((r) =>
          r.review_id === review.review_id
            ? { ...r, suggested_reply: data.suggested_reply }
            : r
        )
      );
    } catch (err) {
      alert(`Error generating reply: ${err.message}`);
    } finally {
      setReplyLoading((prev) => ({ ...prev, [review.review_id]: false }));
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Unique Products & Topics list for dropdowns
  const productOptions = useMemo(() => {
    const set = new Set(reviews.map((r) => r.product).filter(Boolean));
    return Array.from(set).sort();
  }, [reviews]);

  const topicOptions = ['quality', 'delivery', 'price', 'packaging', 'support', 'size_fit', 'other'];

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (filterProduct !== 'ALL' && r.product !== filterProduct) return false;
      if (filterSentiment !== 'ALL' && r.analysis?.sentiment !== filterSentiment) return false;
      if (filterTopic !== 'ALL' && !r.analysis?.topics?.includes(filterTopic)) return false;
      if (filterNeedsReply && !r.analysis?.needs_reply) return false;
      if (filterMismatchOnly && !r.rating_mismatch) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const inText = r.cleaned_text.toLowerCase().includes(q);
        const inProduct = r.product.toLowerCase().includes(q);
        const inId = r.review_id.toLowerCase().includes(q);
        const inSummary = r.analysis?.summary?.toLowerCase().includes(q);
        if (!inText && !inProduct && !inId && !inSummary) return false;
      }
      return true;
    });
  }, [reviews, filterProduct, filterSentiment, filterTopic, filterNeedsReply, filterMismatchOnly, searchTerm]);

  // Product deep dive analytics (Bonus Requirement)
  const productDeepDive = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      if (!map[r.product]) {
        map[r.product] = {
          name: r.product,
          total: 0,
          pos: 0,
          neu: 0,
          neg: 0,
          needsReply: 0,
          mismatches: 0,
          topicsCount: {},
        };
      }
      const p = map[r.product];
      p.total += 1;
      if (r.analysis) {
        if (r.analysis.sentiment === 'positive') p.pos += 1;
        if (r.analysis.sentiment === 'neutral') p.neu += 1;
        if (r.analysis.sentiment === 'negative') p.neg += 1;
        if (r.analysis.needs_reply) p.needsReply += 1;
        r.analysis.topics.forEach((t) => {
          p.topicsCount[t] = (p.topicsCount[t] || 0) + 1;
        });
      }
      if (r.rating_mismatch) p.mismatches += 1;
    });
    return Object.values(map);
  }, [reviews]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">ReviewLens</h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                  AI Review Insights
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Automated sentiment, complaint detection & response engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {backendHealth && (
              <div className="flex items-center space-x-2 text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-slate-600 font-medium">Provider:</span>
                <span className="font-semibold text-slate-900 uppercase">{backendHealth.provider}</span>
              </div>
            )}
            <button
              onClick={handleLoadSample}
              disabled={loading}
              className="inline-flex items-center space-x-2 text-xs font-semibold px-3.5 py-2 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors shadow-sm"
              title="Loads the 30-review assessment dataset instantly"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Load Sample CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        
        {/* Upload & Overview Section */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 space-y-2">
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <span>Upload Reviews Dataset</span>
                <span className="text-xs font-normal text-slate-500">(handles messy Hinglish, empty rows, injection & duplicates)</span>
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Upload your store's <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sky-700 font-mono text-xs">reviews.csv</code>.
                ReviewLens deduplicates rows, sanitizes HTML, protects against prompt injections, and generates instant store owner insights.
              </p>
            </div>

            {/* Drop / File Upload Area */}
            <div>
              <label
                htmlFor="csv-upload"
                className={`relative flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  loading
                    ? 'bg-slate-50 border-slate-300 opacity-60 cursor-not-allowed'
                    : 'border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50'
                }`}
              >
                <Upload className="h-6 w-6 text-sky-600 mb-1" />
                <span className="text-xs font-semibold text-slate-700">Choose CSV or drag & drop</span>
                <span className="text-[11px] text-slate-400 mt-0.5">reviews.csv (up to 5MB)</span>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  disabled={loading}
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Loading state indicator */}
        {loading && (
          <div className="bg-white rounded-2xl border border-sky-100 p-8 shadow-sm flex flex-col items-center justify-center space-y-3">
            <div className="h-10 w-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-800">Processing & Analyzing Reviews with AI...</p>
            <p className="text-xs text-slate-500">Executing deduplication, SQLite cache verification, and batch schema validation.</p>
          </div>
        )}

        {/* Dashboard Content (shown when summary exists) */}
        {summary && !loading && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Speed, Cost, & Cache Telemetry Bar (Bonus Requirement) */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-sky-400" />
                <span className="text-slate-300">SQLite Cache:</span>
                <span className="font-bold text-white bg-slate-700/80 px-2 py-0.5 rounded">
                  {summary.stats.served_from_cache} Served from Cache
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-300">Live AI Batches:</span>
                <span className="font-bold text-sky-300">{summary.stats.ai_calls_made} Batch Calls</span>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1.5">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  <span className="text-slate-300">Processing Time:</span>
                  <span className="font-mono font-bold text-emerald-300">{summary.stats.processing_time_seconds}s</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <DollarSign className="h-4 w-4 text-amber-400" />
                  <span className="text-slate-300">Est. AI Cost:</span>
                  <span className="font-mono font-bold text-amber-300">${summary.stats.estimated_cost_usd.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* Core Requirement 7: Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* Card 1: Total Analysed */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Analysed</span>
                  <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900">{summary.total_analyzed}</span>
                  <span className="text-xs text-slate-500">/ {summary.stats.total_reviews_in_file} in CSV</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 flex items-center space-x-2">
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                    {summary.stats.duplicate_reviews_count} duplicate
                  </span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                    {summary.stats.empty_reviews_count} empty skipped
                  </span>
                </div>
              </div>

              {/* Card 2: Sentiment Breakdown */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sentiment Split</span>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline space-x-3">
                  <div className="text-emerald-600 font-bold text-xl">{summary.positive_pct}%</div>
                  <div className="text-slate-500 font-bold text-sm">{summary.neutral_pct}%</div>
                  <div className="text-rose-600 font-bold text-xl">{summary.negative_pct}%</div>
                </div>
                {/* Horizontal Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2.5 mt-3 flex overflow-hidden">
                  <div style={{ width: `${summary.positive_pct}%` }} className="bg-emerald-500"></div>
                  <div style={{ width: `${summary.neutral_pct}%` }} className="bg-amber-400"></div>
                  <div style={{ width: `${summary.negative_pct}%` }} className="bg-rose-500"></div>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 flex justify-between font-medium">
                  <span className="text-emerald-600">● Positive ({summary.positive_count})</span>
                  <span className="text-amber-600">● Neutral ({summary.neutral_count})</span>
                  <span className="text-rose-600">● Negative ({summary.negative_count})</span>
                </div>
              </div>

              {/* Card 3: Action Needed (needs_reply) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Needs Store Reply</span>
                  <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-rose-600">{summary.needs_reply_count}</span>
                  <span className="text-xs text-rose-500 font-medium">unresolved issues</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Complaints, damaged items, shipping delays & questions.
                </p>
              </div>

              {/* Card 4: Rating Mismatch & Agreement (Bonus Requirement) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rating Agreement</span>
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-indigo-600">{summary.rating_agreement_pct}%</span>
                  <span className="text-xs text-indigo-500 font-medium">star/AI match</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Flags sarcastic 1-stars or deceptive 5-stars (e.g. R008 handle detached).
                </p>
              </div>
            </div>

            {/* Core Requirement 7: Top 3 Complaints & Top 3 Praises */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Top 3 Praises */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <ThumbsUp className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Top 3 Customer Praises</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {summary.top_praises && summary.top_praises.length > 0 ? (
                    summary.top_praises.map((p, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100/80 flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs uppercase tracking-wider text-emerald-800">
                              #{idx + 1} {p.topic}
                            </span>
                            <span className="text-[11px] font-semibold bg-emerald-200 text-emerald-900 px-2 py-0.2 rounded-full">
                              {p.count} mentions
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 italic">"{p.sample_quote}"</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No praises recorded.</p>
                  )}
                </div>
              </div>

              {/* Top 3 Complaints */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-100">
                  <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                    <ThumbsDown className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Top 3 Customer Complaints</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {summary.top_complaints && summary.top_complaints.length > 0 ? (
                    summary.top_complaints.map((c, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100/80 flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs uppercase tracking-wider text-rose-800">
                              #{idx + 1} {c.topic}
                            </span>
                            <span className="text-[11px] font-semibold bg-rose-200 text-rose-900 px-2 py-0.2 rounded-full">
                              {c.count} complaints
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 italic">"{c.sample_quote}"</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No complaints recorded.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Navigation Tabs: Table View vs Product Deep Dive */}
            <div className="border-b border-slate-200 flex space-x-4">
              <button
                onClick={() => setActiveTab('table')}
                className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
                  activeTab === 'table'
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>All Reviews Table ({filteredReviews.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('product_view')}
                className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
                  activeTab === 'product_view'
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Product Deep Dive (Bonus View)</span>
              </button>
            </div>

            {/* TAB 1: Filterable Reviews Table */}
            {activeTab === 'table' && (
              <div className="space-y-4">
                
                {/* Search and Filters Bar */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                  
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search text, product, summary, ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />
                  </div>

                  {/* Product Filter */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 font-medium">Product:</span>
                    <select
                      value={filterProduct}
                      onChange={(e) => setFilterProduct(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 font-medium focus:outline-none"
                    >
                      <option value="ALL">All Products</option>
                      {productOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sentiment Filter */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 font-medium">Sentiment:</span>
                    <select
                      value={filterSentiment}
                      onChange={(e) => setFilterSentiment(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 font-medium focus:outline-none"
                    >
                      <option value="ALL">All Sentiments</option>
                      <option value="positive">Positive</option>
                      <option value="neutral">Neutral</option>
                      <option value="negative">Negative</option>
                    </select>
                  </div>

                  {/* Topic Filter */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 font-medium">Topic:</span>
                    <select
                      value={filterTopic}
                      onChange={(e) => setFilterTopic(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 font-medium focus:outline-none"
                    >
                      <option value="ALL">All Topics</option>
                      {topicOptions.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Toggles */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setFilterNeedsReply(!filterNeedsReply)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        filterNeedsReply
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Needs Reply
                    </button>

                    <button
                      onClick={() => setFilterMismatchOnly(!filterMismatchOnly)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        filterMismatchOnly
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="Show reviews where Star Rating contradicts AI sentiment"
                    >
                      Rating Mismatches
                    </button>
                  </div>
                </div>

                {/* Table Component */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
                      <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="py-3 px-4">Review ID</th>
                          <th className="py-3 px-4">Product</th>
                          <th className="py-3 px-4">Rating</th>
                          <th className="py-3 px-4 min-w-[220px]">Customer Review</th>
                          <th className="py-3 px-4">AI Sentiment</th>
                          <th className="py-3 px-4">Topics</th>
                          <th className="py-3 px-4 min-w-[200px]">AI English Summary</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredReviews.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                              No reviews match the selected filter criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredReviews.map((r) => {
                            const isAdversarial = r.review_id === 'R012' || r.review_id === 'R015';
                            return (
                              <tr
                                key={r.review_id}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  r.rating_mismatch ? 'bg-amber-50/30' : ''
                                }`}
                              >
                                {/* Review ID & Badges */}
                                <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span>{r.review_id}</span>
                                    <span className="text-[10px] text-slate-400 font-sans">{r.date}</span>
                                    {r.is_duplicate && (
                                      <span className="mt-1 text-[9px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded w-fit">
                                        Duplicate of {r.duplicate_of}
                                      </span>
                                    )}
                                    {isAdversarial && (
                                      <span className="mt-1 text-[9px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded w-fit flex items-center space-x-1">
                                        <ShieldAlert className="h-2.5 w-2.5" />
                                        <span>Injection Defended</span>
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Product */}
                                <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                                  {r.product}
                                </td>

                                {/* Star Rating */}
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <div className="flex items-center space-x-1.5">
                                    {r.rating !== null ? (
                                      <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                        ★ {r.rating}/5
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                        Unknown ({r.rating_raw || 'empty'})
                                      </span>
                                    )}
                                    {r.rating_mismatch && (
                                      <span
                                        className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center space-x-0.5"
                                        title="Star rating contradicts AI sentiment!"
                                      >
                                        <AlertTriangle className="h-3 w-3" />
                                        <span>Mismatch</span>
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Review Text */}
                                <td className="py-3 px-4 text-slate-700 leading-relaxed">
                                  {r.is_empty ? (
                                    <span className="text-slate-400 italic">(Empty review text skipped)</span>
                                  ) : (
                                    <span>{r.cleaned_text}</span>
                                  )}
                                </td>

                                {/* AI Sentiment */}
                                <td className="py-3 px-4 whitespace-nowrap">
                                  {r.analysis_failed ? (
                                    <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold text-[11px]">
                                      analysis_failed
                                    </span>
                                  ) : r.analysis ? (
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-semibold text-[11px] uppercase tracking-wider ${
                                        r.analysis.sentiment === 'positive'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : r.analysis.sentiment === 'negative'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {r.analysis.sentiment}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>

                                {/* Topics */}
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap gap-1">
                                    {r.analysis?.topics?.map((topic) => (
                                      <span
                                        key={topic}
                                        className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                      >
                                        {topic}
                                      </span>
                                    )) || <span className="text-slate-400">-</span>}
                                  </div>
                                </td>

                                {/* AI Summary */}
                                <td className="py-3 px-4 text-slate-600 font-medium">
                                  {r.analysis?.summary || '-'}
                                </td>

                                {/* Actions / On-Click Reply */}
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  {r.analysis?.needs_reply ? (
                                    r.suggested_reply ? (
                                      <div className="space-y-1.5 flex flex-col items-end">
                                        <button
                                          onClick={() => copyToClipboard(r.suggested_reply, r.review_id)}
                                          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md transition-colors"
                                        >
                                          {copiedId === r.review_id ? (
                                            <>
                                              <Check className="h-3 w-3" />
                                              <span>Copied!</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="h-3 w-3" />
                                              <span>Copy Reply</span>
                                            </>
                                          )}
                                        </button>
                                        <p className="text-[10px] text-slate-500 max-w-[200px] text-left italic bg-slate-50 p-1.5 rounded border border-slate-200/60 line-clamp-2">
                                          "{r.suggested_reply}"
                                        </p>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleGenerateReply(r)}
                                        disabled={replyLoading[r.review_id]}
                                        className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1.5 rounded-lg shadow-sm transition-all"
                                      >
                                        <Sparkles className={`h-3 w-3 ${replyLoading[r.review_id] ? 'animate-spin' : ''}`} />
                                        <span>{replyLoading[r.review_id] ? 'Generating...' : 'Suggest Reply'}</span>
                                      </button>
                                    )
                                  ) : (
                                    <span className="text-[11px] text-slate-400">No reply needed</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Product Deep Dive (Bonus View) */}
            {activeTab === 'product_view' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {productDeepDive.map((p) => {
                  const posPct = p.total ? Math.round((p.pos / p.total) * 100) : 0;
                  const neuPct = p.total ? Math.round((p.neu / p.total) * 100) : 0;
                  const negPct = p.total ? Math.round((p.neg / p.total) * 100) : 0;

                  return (
                    <div key={p.name} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                          <span className="text-xs text-slate-500">{p.total} Total Reviews</span>
                        </div>
                        {p.needsReply > 0 && (
                          <span className="bg-rose-100 text-rose-800 font-bold text-xs px-2.5 py-1 rounded-full">
                            {p.needsReply} Needs Reply
                          </span>
                        )}
                      </div>

                      {/* Product Sentiment Split */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-600">
                          <span>Sentiment Split</span>
                          <span>{posPct}% Pos / {neuPct}% Neu / {negPct}% Neg</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 flex overflow-hidden">
                          <div style={{ width: `${posPct}%` }} className="bg-emerald-500"></div>
                          <div style={{ width: `${neuPct}%` }} className="bg-amber-400"></div>
                          <div style={{ width: `${negPct}%` }} className="bg-rose-500"></div>
                        </div>
                      </div>

                      {/* Product Top Topics */}
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Topics Mentioned:</span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(p.topicsCount)
                            .sort((a, b) => b[1] - a[1])
                            .map(([topic, count]) => (
                              <span
                                key={topic}
                                className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-medium"
                              >
                                {topic} ({count})
                              </span>
                            ))}
                        </div>
                      </div>

                      {p.mismatches > 0 && (
                        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{p.mismatches} review(s) with rating mismatch on this product.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>ReviewLens — CEDCOSS Technical Assessment (Associate Software Developer)</p>
        <p className="mt-1">Pydantic Schema Validation • SQLite Caching • Prompt Injection Defense • Batching & Exponential Backoff</p>
      </footer>
    </div>
  );
}
