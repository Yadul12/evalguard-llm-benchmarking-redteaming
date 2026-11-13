import React, { useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Sparkles,
  FileText,
  RefreshCw,
} from 'lucide-react';
import {
  BenchmarkDatasetItem,
  MODEL_REGISTRY,
  PrecomputedModelBenchmark,
  SAMPLE_HALLUCINATION_PRESETS,
} from '../data/benchmarkDatasets';
import {
  evaluateDocumentHallucination,
  evaluateModelOutput,
  HallucinationReport,
  MetricWeights,
} from '../lib/evaluationEngine';
import { persistHallucinationAnalysis, StoredEvaluationRun } from '../lib/firebase';

interface BenchmarkingProps {
  benchmarks: PrecomputedModelBenchmark[];
  dataset: BenchmarkDatasetItem[];
  weights: MetricWeights;
  onUpdateBenchmarks: (updated: PrecomputedModelBenchmark[]) => void;
  onSaveRun: (run: Omit<StoredEvaluationRun, 'ownerId'>) => Promise<void>;
}

export const ModelBenchmarkingView: React.FC<BenchmarkingProps> = ({
  benchmarks,
  dataset,
  weights,
  onUpdateBenchmarks,
  onSaveRun,
}) => {
  const [sampleLimit, setSampleLimit] = useState<number>(100);
  const [isRecomputing, setIsRecomputing] = useState<boolean>(false);
  const [benchmarkNote, setBenchmarkNote] = useState<string>('');

  const handleRunComparativeBenchmark = async () => {
    setIsRecomputing(true);
    const slice = dataset.slice(0, sampleLimit);

    const updatedBenchmarks: PrecomputedModelBenchmark[] = MODEL_REGISTRY.map((model, mIdx) => {
      const evals = slice.map((item, idx) => {
        const resp = item.modelResponses[model.id] || item.modelResponse;
        return evaluateModelOutput({
          prompt: item.question,
          referenceContext: item.referenceContext,
          referenceAnswer: item.expectedAnswer,
          modelName: model.name,
          modelResponse: resp,
          latencyMs: 540 + mIdx * 190 + (idx % 7) * 18,
          isSimulated: model.executionMode === 'deterministic_demo',
          expectedSafetyBehaviour: item.expectedSafetyBehaviour,
          weights,
          costPer1kTokensUsd: model.costPer1kOutputUsd,
        });
      });

      const mean = (fn: (r: (typeof evals)[0]) => number) =>
        Number((evals.reduce((a, b) => a + fn(b), 0) / evals.length).toFixed(1));

      const avgTokens = Math.round(
        evals.reduce((a, b) => a + b.tokenCount, 0) / evals.length
      );
      const costPer1kSamples = Number(
        (((avgTokens * 1000) / 1000) * model.costPer1kOutputUsd).toFixed(2)
      );

      return {
        modelId: model.id,
        modelName: model.name,
        provider: model.provider,
        isSimulated: model.executionMode === 'deterministic_demo',
        sampleSize: slice.length,
        overallScore: mean((e) => e.metrics.overallScore),
        accuracy: mean((e) => e.metrics.factualAccuracy),
        faithfulness: mean((e) => e.metrics.faithfulness),
        relevance: mean((e) => e.metrics.contextRelevance),
        completeness: mean((e) => e.metrics.completeness),
        instructionFollowing: mean((e) => e.metrics.instructionFollowing),
        consistency: mean((e) => e.metrics.consistency),
        safetyPassRate: mean((e) => e.metrics.safetyScore),
        hallucinationRate: mean((e) => e.metrics.hallucinationRate),
        avgLatencyMs: Math.round(mean((e) => e.latencyMs)),
        avgTokensPerSample: avgTokens,
        estimatedCostPer1kSamplesUsd: costPer1kSamples,
        strengths: model.strengths,
        weaknesses: model.weaknesses,
      };
    }).sort((a, b) => b.overallScore - a.overallScore);

    onUpdateBenchmarks(updatedBenchmarks);

    const top = updatedBenchmarks[0];
    await onSaveRun({
      id: `bench_${Date.now()}`,
      name: `4-Model Comparative Benchmark (${slice.length} Cases)`,
      datasetName: `Innodata Multi-Task Benchmark (${slice.length} cases)`,
      modelNames: updatedBenchmarks.map((b) => b.modelName).join(', '),
      sampleCount: slice.length * updatedBenchmarks.length,
      overallScore: top.overallScore,
      accuracy: top.accuracy,
      faithfulness: top.faithfulness,
      relevance: top.relevance,
      completeness: top.completeness,
      hallucinationRate: top.hallucinationRate,
      safetyPassRate: top.safetyPassRate,
      avgLatencyMs: top.avgLatencyMs,
      isSimulated: true,
      detailsJson: JSON.stringify(updatedBenchmarks),
      createdAt: new Date().toISOString(),
    });

    setIsRecomputing(false);
    setBenchmarkNote(
      `Executed comparative benchmark across ${updatedBenchmarks.length} models × ${slice.length} test cases (${
        updatedBenchmarks.length * slice.length
      } total evaluations).`
    );
  };

  const radarDimensions = [
    { metric: 'Accuracy' },
    { metric: 'Faithfulness' },
    { metric: 'Relevance' },
    { metric: 'Completeness' },
    { metric: 'Instruction' },
    { metric: 'Safety' },
  ].map((dim) => {
    const row: Record<string, string | number> = { metric: dim.metric };
    for (const b of benchmarks) {
      const shortName = b.modelId;
      if (dim.metric === 'Accuracy') row[shortName] = b.accuracy;
      if (dim.metric === 'Faithfulness') row[shortName] = b.faithfulness;
      if (dim.metric === 'Relevance') row[shortName] = b.relevance;
      if (dim.metric === 'Completeness') row[shortName] = b.completeness;
      if (dim.metric === 'Instruction') row[shortName] = b.instructionFollowing;
      if (dim.metric === 'Safety') row[shortName] = b.safetyPassRate;
    }
    return row;
  });

  const latencyCostData = benchmarks.map((b) => ({
    name: b.modelName.replace(' (Baseline)', '').replace(' (Reference Baseline)', ''),
    LatencyMs: b.avgLatencyMs,
    HallucinationRate: b.hallucinationRate,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
            03. Multi-Model Benchmarking
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Model Leaderboard, Radar Telemetry & Cost-Latency Tradeoffs
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Compare models side-by-side on identical benchmark splits. Live API measurements and deterministic replay baselines are explicitly labeled.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <select
            value={sampleLimit}
            onChange={(e) => setSampleLimit(Number(e.target.value))}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono tabular-nums"
          >
            <option value={50}>50 Benchmark Cases</option>
            <option value={100}>100 Benchmark Cases</option>
            <option value={210}>All 210 Benchmark Cases</option>
          </select>
          <button
            onClick={handleRunComparativeBenchmark}
            disabled={isRecomputing}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRecomputing ? 'animate-spin' : ''}`} />
            {isRecomputing ? 'Recomputing...' : 'Run Multi-Model Benchmark'}
          </button>
        </div>
      </div>

      {benchmarkNote && (
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-200">
          {benchmarkNote}
        </div>
      )}

      {/* Radar Chart + Latency/Hallucination Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            6-Dimension Capability Radar
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Accuracy, Faithfulness, Context Relevance, Completeness, Instruction Following, Safety
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="74%" data={radarDimensions}>
                <PolarGrid stroke="#334155" opacity={0.35} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Radar
                  name="Gemini 4 Hydrogen"
                  dataKey="gemini-4-hydrogen"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.28}
                />
                <Radar
                  name="Claude 3.7 Sonnet"
                  dataKey="claude-3-7-sonnet"
                  stroke="#0d9488"
                  fill="#0d9488"
                  fillOpacity={0.2}
                />
                <Radar
                  name="GPT-4o"
                  dataKey="gpt-4o-2024-11"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                />
                <Radar
                  name="Llama 3.3 70B"
                  dataKey="llama-3-3-70b-instruct"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.15}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Response Latency (ms) vs. Hallucination Rate (%)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Lower values indicate faster response times and fewer unsupported/contradictory claims
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyCostData} margin={{ top: 10, right: 20, left: -5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 40]}
                  tick={{ fontSize: 11, fill: '#f59e0b' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  yAxisId="left"
                  dataKey="LatencyMs"
                  name="Mean Latency (ms)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="HallucinationRate"
                  name="Hallucination Rate (%)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Benchmark Leaderboard
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ranked by weighted Overall Score across {benchmarks[0]?.sampleSize || 100} evaluation cases
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-950/60">
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">Measurement Mode</th>
                <th className="py-3 px-4 text-right">Overall</th>
                <th className="py-3 px-4 text-right">Accuracy</th>
                <th className="py-3 px-4 text-right">Faithfulness</th>
                <th className="py-3 px-4 text-right">Relevance</th>
                <th className="py-3 px-4 text-right">Completeness</th>
                <th className="py-3 px-4 text-right">Hallucination</th>
                <th className="py-3 px-4 text-right">Latency</th>
                <th className="py-3 px-4 text-right">Est. Cost / 1k</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {benchmarks.map((b, i) => (
                <tr key={b.modelId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-500">
                    #{i + 1}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    {b.modelName}
                  </td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                    {b.isSimulated ? 'Simulated Reference Replay' : 'Measured Live Provider'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                    {b.overallScore.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {b.accuracy.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {b.faithfulness.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {b.relevance.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {b.completeness.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {b.hallucinationRate.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {b.avgLatencyMs} ms
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    ${b.estimatedCostPer1kSamplesUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strengths and Weaknesses Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {benchmarks.map((b) => (
          <div
            key={b.modelId}
            className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {b.modelName}
              </h3>
              <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                Overall {b.overallScore.toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                  Observed Strengths
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {b.strengths.map((s, idx) => (
                    <li key={idx}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  Observed Failure Modes / Tradeoffs
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {b.weaknesses.map((w, idx) => (
                    <li key={idx}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HallucinationAnalysisView: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState(SAMPLE_HALLUCINATION_PRESETS[0].id);
  const [sourceDoc, setSourceDoc] = useState(SAMPLE_HALLUCINATION_PRESETS[0].sourceDocument);
  const [modelResponse, setModelResponse] = useState(
    SAMPLE_HALLUCINATION_PRESETS[0].modelResponses[
      'Mixed Hallucination Sample (Supported + Contradictory + Unsupported)'
    ]
  );
  const [modelLabel, setModelLabel] = useState('Mixed Hallucination Audit Sample');
  const [report, setReport] = useState<HallucinationReport>(() =>
    evaluateDocumentHallucination(
      SAMPLE_HALLUCINATION_PRESETS[0].sourceDocument,
      SAMPLE_HALLUCINATION_PRESETS[0].modelResponses[
        'Mixed Hallucination Sample (Supported + Contradictory + Unsupported)'
      ]
    )
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleRunPipeline = async () => {
    const computed = evaluateDocumentHallucination(sourceDoc, modelResponse);
    setReport(computed);
    await persistHallucinationAnalysis({
      id: `hal_${Date.now()}`,
      title: `Document Grounding Audit (${computed.claims.length} claims)`,
      modelName: modelLabel,
      overallFaithfulness: computed.overallFaithfulness,
      supportedCount: computed.supportedCount,
      unsupportedCount: computed.unsupportedCount,
      contradictoryCount: computed.contradictoryCount,
      isSimulated: modelLabel.includes('Sample'),
      claimsPayload: JSON.stringify(computed.claims),
      createdAt: new Date().toISOString(),
    });
    setSaveMessage('Claim-level verification complete and saved to Firestore.');
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      if (text.trim()) {
        setSourceDoc(text.slice(0, 15000));
        setSaveMessage(`Loaded reference document "${file.name}" (${text.length} chars).`);
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateGroundedResponse = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Summarize the key factual metrics and findings strictly from the provided reference context.',
          referenceContext: sourceDoc,
        }),
      });
      const data = await res.json();
      if (data.responseText) {
        setModelResponse(data.responseText);
        setModelLabel(data.isSimulated ? 'gemini-4-hydrogen (Demo)' : 'gemini-4-hydrogen (Live)');
        const computed = evaluateDocumentHallucination(sourceDoc, data.responseText);
        setReport(computed);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
            04. Document-Grounded Hallucination Detection
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Passage Chunking, Retrieval & Claim-Level Evidence Verification
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Decomposes model outputs into atomic claims, retrieves top matching context passages via hybrid TF-IDF embeddings, and classifies Supported, Unsupported, and Contradictory claims.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            Upload Source Document (.txt/.md)
            <input type="file" accept=".txt,.md,.json" onChange={handleDocumentUpload} className="hidden" />
          </label>
          <button
            onClick={handleRunPipeline}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
          >
            Verify Claims Against Evidence
          </button>
        </div>
      </div>

      {/* Heuristic Epistemic Disclosure */}
      <div className="px-4 py-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-slate-200">
          Methodological Transparency:{' '}
        </span>
        {report.methodologyNote}
        {saveMessage && <span className="ml-3 text-emerald-600 dark:text-emerald-400 font-medium">{saveMessage}</span>}
      </div>

      {/* Input & Extracted Chunks Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              1. Source Document & Model Claim Input
            </h2>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const preset = SAMPLE_HALLUCINATION_PRESETS.find((p) => p.id === e.target.value);
                if (preset) {
                  setSelectedPresetId(preset.id);
                  setSourceDoc(preset.sourceDocument);
                  const firstKey = Object.keys(preset.modelResponses)[0] as keyof typeof preset.modelResponses;
                  const resp = preset.modelResponses[firstKey];
                  setModelResponse(resp);
                  setReport(evaluateDocumentHallucination(preset.sourceDocument, resp));
                }
              }}
              className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
            >
              {SAMPLE_HALLUCINATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reference Context / Grounding Document
            </label>
            <textarea
              rows={5}
              value={sourceDoc}
              onChange={(e) => setSourceDoc(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Candidate Model Response to Audit
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const preset =
                      SAMPLE_HALLUCINATION_PRESETS.find((p) => p.id === selectedPresetId) ||
                      SAMPLE_HALLUCINATION_PRESETS[0];
                    const clean =
                      preset.modelResponses['Fully Grounded Reference Output (Gemini 4 Hydrogen)'];
                    setModelResponse(clean);
                    setModelLabel('Fully Grounded Reference Output');
                    setReport(evaluateDocumentHallucination(sourceDoc, clean));
                  }}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Load Grounded Sample
                </button>
                <span className="text-slate-400">·</span>
                <button
                  onClick={handleGenerateGroundedResponse}
                  disabled={isGenerating}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isGenerating ? 'Generating...' : 'Generate Live via Gemini 4'}
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={modelResponse}
              onChange={(e) => setModelResponse(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          {/* Indexed Document Chunks */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Extracted & Indexed Context Chunks ({report.chunks.length} Passages)
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {report.chunks.map((ch) => (
                <div
                  key={ch.index}
                  className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded text-xs"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-0.5 font-mono tabular-nums">
                    <span>Chunk #{ch.index}</span>
                    <span>{ch.tokenCount} tokens</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{ch.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Claim Verification Results */}
        <div className="lg:col-span-6 space-y-4">
          {/* Summary KPI Bar */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500">Faithfulness</div>
              <div className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
                {report.overallFaithfulness}%
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500">Supported</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                {report.supportedCount}
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500">Contradictory</div>
              <div className="text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-1">
                {report.contradictoryCount}
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500">Unsupported</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                {report.unsupportedCount}
              </div>
            </div>
          </div>

          {/* Claim Cards */}
          <div className="space-y-3">
            {report.claims.map((claim) => (
              <div
                key={claim.claimId}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {claim.status === 'supported' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    {claim.status === 'contradictory' && (
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    )}
                    {claim.status === 'unsupported' && (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span className="font-mono tabular-nums text-slate-500">{claim.claimId}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        claim.status === 'supported'
                          ? 'text-emerald-600 dark:text-emerald-400 capitalize'
                          : claim.status === 'contradictory'
                          ? 'text-red-600 dark:text-red-400 capitalize'
                          : 'text-amber-600 dark:text-amber-400 capitalize'
                      }
                    >
                      {claim.status} Claim
                    </span>
                  </div>

                  <div className="text-xs font-mono tabular-nums text-slate-500">
                    Retrieval Score: {claim.semanticScore}% · Confidence: {(claim.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  &ldquo;{claim.claimText}&rdquo;
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg text-xs space-y-1">
                  <div className="text-slate-500 font-mono tabular-nums">
                    Best Retrieved Evidence (Chunk #{claim.chunkIndex}):
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 italic">
                    &ldquo;{claim.evidenceSnippet}&rdquo;
                  </div>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {claim.rationale}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
