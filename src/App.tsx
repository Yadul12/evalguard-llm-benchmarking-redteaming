/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FlaskConical,
  BarChart3,
  FileSearch,
  ShieldAlert,
  Database,
  FileText,
  Settings,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  signInWithGoogle,
  signOutUser,
  onAuthStateChanged,
  collection,
  query,
  where,
  onSnapshot,
  persistEvaluationRun,
  deleteEvaluationRunFromFirestore,
  handleFirestoreError,
  OperationType,
  StoredEvaluationRun,
  User,
} from './lib/firebase';
import { DEFAULT_METRIC_WEIGHTS, MetricWeights } from './lib/evaluationEngine';
import {
  BenchmarkDatasetItem,
  INITIAL_MODEL_BENCHMARKS,
  PrecomputedModelBenchmark,
  SAMPLE_210_DATASET,
} from './data/benchmarkDatasets';
import {
  RED_TEAM_LIBRARY,
  RedTeamEvaluationResult,
  evaluateRedTeamResponse,
} from './data/redTeamLibrary';
import { OverviewDashboard, EvaluationWorkspace } from './components/OverviewAndWorkspace';
import {
  ModelBenchmarkingView,
  HallucinationAnalysisView,
} from './components/BenchmarkAndHallucination';
import { RedTeamingLabView, DatasetManagementView } from './components/RedTeamAndDatasets';
import { ReportsAndAnalyticsView, SettingsAndMetricsView } from './components/ReportsAndSettings';

const INITIAL_RUNS: StoredEvaluationRun[] = [
  {
    id: 'run_seed_01',
    ownerId: 'demo',
    name: 'Innodata Tier-1 Financial 10-Q Grounding Benchmark',
    datasetName: 'Innodata Financial & RAG Suite (100 Cases)',
    modelNames: 'Gemini 4 Hydrogen, Claude 3.7 Sonnet, GPT-4o',
    sampleCount: 100,
    overallScore: 93.4,
    accuracy: 92.8,
    faithfulness: 95.0,
    relevance: 94.2,
    completeness: 91.5,
    hallucinationRate: 5.0,
    safetyPassRate: 98.5,
    avgLatencyMs: 640,
    isSimulated: false,
    detailsJson: '[]',
    createdAt: '2026-11-12T18:20:00Z',
  },
  {
    id: 'run_seed_02',
    ownerId: 'demo',
    name: 'Clinical Trial NCT-098412 Summarization & Claim Verification',
    datasetName: 'Medical RAG Grounding Split (100 Cases)',
    modelNames: 'Gemini 4 Hydrogen, Claude 3.7 Sonnet',
    sampleCount: 100,
    overallScore: 92.1,
    accuracy: 91.4,
    faithfulness: 95.8,
    relevance: 93.0,
    completeness: 90.8,
    hallucinationRate: 4.2,
    safetyPassRate: 97.8,
    avgLatencyMs: 810,
    isSimulated: true,
    detailsJson: '[]',
    createdAt: '2026-11-12T21:15:00Z',
  },
  {
    id: 'run_seed_03',
    ownerId: 'demo',
    name: 'Open-Weights Llama 3.3 70B Stress Audit',
    datasetName: 'Innodata Full 210-Case Suite',
    modelNames: 'Llama 3.3 70B Instruct',
    sampleCount: 210,
    overallScore: 76.8,
    accuracy: 74.5,
    faithfulness: 72.0,
    relevance: 83.4,
    completeness: 78.2,
    hallucinationRate: 28.0,
    safetyPassRate: 88.0,
    avgLatencyMs: 510,
    isSimulated: true,
    detailsJson: '[]',
    createdAt: '2026-11-13T02:40:00Z',
  },
];

const INITIAL_RED_TEAM_RESULTS: RedTeamEvaluationResult[] = RED_TEAM_LIBRARY.map((tc, i) =>
  evaluateRedTeamResponse(
    tc,
    'gemini-4-hydrogen',
    tc.simulatedResponses['gemini-4-hydrogen'],
    true,
    460 + (i % 8) * 24
  )
);

export default function App() {
  const [activePage, setActivePage] = useState<string>('overview');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const [runs, setRuns] = useState<StoredEvaluationRun[]>(INITIAL_RUNS);
  const [benchmarks, setBenchmarks] =
    useState<PrecomputedModelBenchmark[]>(INITIAL_MODEL_BENCHMARKS);
  const [redTeamResults, setRedTeamResults] =
    useState<RedTeamEvaluationResult[]>(INITIAL_RED_TEAM_RESULTS);
  const [dataset, setDataset] = useState<BenchmarkDatasetItem[]>(SAMPLE_210_DATASET);
  const [weights, setWeights] = useState<MetricWeights>(DEFAULT_METRIC_WEIGHTS);

  const [healthStatus, setHealthStatus] = useState({
    geminiConfigured: true,
    activeModel: 'gemini-4-hydrogen',
    executionMode: 'live_gemini_api',
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.activeModel) {
          setHealthStatus({
            geminiConfigured: Boolean(data.geminiConfigured),
            activeModel: data.activeModel,
            executionMode: data.executionMode || 'live_gemini_api',
          });
        }
      })
      .catch(() => {
        // Fallback silently if server health endpoint not yet ready
      });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const path = 'evaluationRuns';
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetched: StoredEvaluationRun[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            ownerId: d.ownerId,
            name: d.name,
            datasetName: d.datasetName,
            modelNames: d.modelNames,
            sampleCount: d.sampleCount,
            overallScore: d.overallScore,
            accuracy: d.accuracy,
            faithfulness: d.faithfulness,
            relevance: d.relevance,
            completeness: d.completeness,
            hallucinationRate: d.hallucinationRate,
            safetyPassRate: d.safetyPassRate,
            avgLatencyMs: d.avgLatencyMs,
            isSimulated: d.isSimulated,
            detailsJson: d.detailsJson,
            createdAt: d.createdAt,
          });
        });
        if (fetched.length > 0) {
          setRuns([...fetched, ...INITIAL_RUNS]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const handleSaveEvaluationRun = async (newRun: Omit<StoredEvaluationRun, 'ownerId'>) => {
    const fullRun: StoredEvaluationRun = {
      ...newRun,
      ownerId: user?.uid || 'local_user',
    };
    setRuns((prev) => [fullRun, ...prev]);
    if (user && user.emailVerified) {
      await persistEvaluationRun(newRun);
    }
  };

  const handleDeleteEvaluationRun = async (runId: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    if (user && user.emailVerified && !runId.startsWith('run_seed_')) {
      await deleteEvaluationRunFromFirestore(runId);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'workspace', label: 'Evaluation Workspace', icon: FlaskConical },
    { id: 'benchmarking', label: 'Model Benchmarking', icon: BarChart3 },
    { id: 'hallucination', label: 'Hallucination Analysis', icon: FileSearch },
    { id: 'redteam', label: 'Red Teaming Lab', icon: ShieldAlert },
    { id: 'datasets', label: 'Dataset Management', icon: Database },
    { id: 'reports', label: 'Reports & Analytics', icon: FileText },
    { id: 'settings', label: 'Settings & Metrics', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight font-display text-slate-900 dark:text-white whitespace-nowrap">
            EvalGuard AI
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Innodata AI Engineering Suite
            </div>
            <div className="mt-0.5 font-mono tabular-nums text-[11px]">
              210 Labelled Cases · 56 Red-Team Vectors
            </div>
          </div>

          {user ? (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                {user.displayName || user.email}
              </span>
              <button
                onClick={() => signOutUser()}
                className="text-slate-500 hover:text-red-500 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="w-full py-2 px-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In for Cloud Sync</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="h-16 flex items-center justify-between gap-8 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          {/* Zone 1: Single-line Brand / Breadcrumb */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <a
              href="#overview"
              onClick={(e) => {
                e.preventDefault();
                setActivePage('overview');
              }}
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
            >
              EvalGuard AI / {navItems.find((n) => n.id === activePage)?.label}
            </a>
          </div>

          {/* Zone 2: 4 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              onClick={() => setActivePage('workspace')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Workspace
            </button>
            <button
              onClick={() => setActivePage('benchmarking')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Benchmarking
            </button>
            <button
              onClick={() => setActivePage('hallucination')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Hallucinations
            </button>
            <button
              onClick={() => setActivePage('redteam')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Red Teaming
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActivePage('workspace')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Run Evaluation
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md ${
                  activePage === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          {activePage === 'overview' && (
            <OverviewDashboard
              runs={runs}
              benchmarks={benchmarks}
              redTeamResults={redTeamResults}
              dataset={dataset}
              onNavigate={setActivePage}
              onDeleteRun={handleDeleteEvaluationRun}
            />
          )}

          {activePage === 'workspace' && (
            <EvaluationWorkspace
              dataset={dataset}
              weights={weights}
              onSaveRun={handleSaveEvaluationRun}
              onUploadDataset={(uploadedItems) => setDataset([...uploadedItems, ...dataset])}
            />
          )}

          {activePage === 'benchmarking' && (
            <ModelBenchmarkingView
              benchmarks={benchmarks}
              dataset={dataset}
              weights={weights}
              onUpdateBenchmarks={setBenchmarks}
              onSaveRun={handleSaveEvaluationRun}
            />
          )}

          {activePage === 'hallucination' && <HallucinationAnalysisView />}

          {activePage === 'redteam' && (
            <RedTeamingLabView
              results={redTeamResults}
              onUpdateResults={setRedTeamResults}
            />
          )}

          {activePage === 'datasets' && (
            <DatasetManagementView dataset={dataset} onUpdateDataset={setDataset} />
          )}

          {activePage === 'reports' && (
            <ReportsAndAnalyticsView
              runs={runs}
              benchmarks={benchmarks}
              redTeamResults={redTeamResults}
              dataset={dataset}
            />
          )}

          {activePage === 'settings' && (
            <SettingsAndMetricsView
              weights={weights}
              onChangeWeights={setWeights}
              isDark={isDark}
              onToggleTheme={() => setIsDark(!isDark)}
              healthStatus={healthStatus}
            />
          )}
        </main>
      </div>
    </div>
  );
}
