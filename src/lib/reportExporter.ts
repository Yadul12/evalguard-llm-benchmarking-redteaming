import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StoredEvaluationRun } from './firebase';
import { PrecomputedModelBenchmark } from '../data/benchmarkDatasets';
import { RedTeamEvaluationResult } from '../data/redTeamLibrary';

export function downloadCsvFile(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateEvaluationPdfReport(params: {
  reportTitle: string;
  runs: StoredEvaluationRun[];
  benchmarks: PrecomputedModelBenchmark[];
  redTeamResults: RedTeamEvaluationResult[];
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 595, 76, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('EvalGuard AI — Enterprise LLM Evaluation & Red-Team Report', 36, 34);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Report: ${params.reportTitle}  |  Generated: ${nowStr}`, 36, 54);

  // Section 1: Benchmark Leaderboard
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text('1. Multi-Model Benchmark Leaderboard', 36, 104);

  autoTable(doc, {
    startY: 114,
    margin: { left: 36, right: 36 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [
      [
        'Model',
        'Mode',
        'Overall',
        'Accuracy',
        'Faithfulness',
        'Hallucination',
        'Safety Pass',
        'Latency (ms)',
      ],
    ],
    body: params.benchmarks.map((b) => [
      b.modelName,
      b.isSimulated ? 'Simulated Baseline' : 'Measured Live',
      `${b.overallScore.toFixed(1)}%`,
      `${b.accuracy.toFixed(1)}%`,
      `${b.faithfulness.toFixed(1)}%`,
      `${b.hallucinationRate.toFixed(1)}%`,
      `${b.safetyPassRate.toFixed(1)}%`,
      `${b.avgLatencyMs} ms`,
    ]),
  });

  // Section 2: Stored Evaluation Runs
  const afterBenchY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 240;
  doc.setFontSize(12);
  doc.text('2. Recorded Evaluation Runs', 36, afterBenchY + 26);

  autoTable(doc, {
    startY: afterBenchY + 36,
    margin: { left: 36, right: 36 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [['Run Name', 'Dataset', 'Models', 'Cases', 'Overall', 'Faithfulness', 'Mode']],
    body: params.runs.slice(0, 12).map((r) => [
      r.name,
      r.datasetName,
      r.modelNames,
      String(r.sampleCount),
      `${r.overallScore.toFixed(1)}%`,
      `${r.faithfulness.toFixed(1)}%`,
      r.isSimulated ? 'Simulated' : 'Measured',
    ]),
  });

  // Section 3: Red-Team Vulnerability Audit Summary
  const afterRunsY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 420;
  doc.setFontSize(12);
  doc.text('3. Red-Teaming Adversarial Findings Summary', 36, afterRunsY + 26);

  autoTable(doc, {
    startY: afterRunsY + 36,
    margin: { left: 36, right: 36 },
    headStyles: { fillColor: [153, 27, 27], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    head: [['Test ID', 'Category', 'Attack Vector', 'Model', 'Outcome', 'Evaluation Rationale']],
    body: params.redTeamResults.slice(0, 15).map((rt) => [
      rt.testId,
      rt.category,
      rt.title,
      rt.modelName,
      rt.outcome,
      rt.rationale.slice(0, 95),
    ]),
  });

  doc.save(`${params.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_evalguard_report.pdf`);
}
