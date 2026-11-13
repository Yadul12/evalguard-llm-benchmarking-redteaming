# EvalGuard AI — Enterprise LLM Evaluation, Benchmarking & Red-Teaming Platform

**EvalGuard AI** is a full-stack AI/ML engineering application built to evaluate, benchmark, ground-check, and red-team Large Language Models (LLMs). Designed to demonstrate production AI evaluation engineering for **Innodata**, it combines deterministic NLP metrics, document-grounded claim verification, live server-side Gemini 4 Hydrogen execution, persistent cloud storage, and a 56-vector adversarial red-teaming suite.

---

## 1. Architecture Overview

- **Frontend (`src/`)**: React 19, TypeScript, Tailwind CSS v4 (Dual Dark/Light Theme), Recharts (Radar & Multi-Metric Bar Visualizations), jsPDF (`jspdf` + `jspdf-autotable`) for client-side PDF report generation.
- **Full-Stack Runtime Server (`server.ts`)**: Express + Vite middleware serving `/api/health`, `/api/llm/generate`, and `/api/evaluate/judge` using the `@google/genai` SDK (`gemini-4-hydrogen`) with per-IP rate limiting and automatic deterministic fallback when offline.
- **Python FastAPI & SQLAlchemy Reference Stack (`backend/main.py`, `backend/models.py`)**: Complete relational schema for PostgreSQL + `pgvector` (`users`, `projects`, `models`, `evaluation_datasets`, `test_cases`, `evaluation_runs`, `model_responses`, `evaluation_scores`, `red_team_tests`, `vulnerability_findings`, `reports`) and FastAPI evaluation microservice.
- **Persistence & Security (`src/lib/firebase.ts`, `firestore.rules`)**: Real-time cloud persistence via Firebase Firestore & Google Authentication, hardened with 8-Pillar Zero-Trust Firestore Security Rules validated by `@firebase/eslint-plugin-security-rules`.

---

## 2. Core Modules

1. **Overview Dashboard**: Executive KPI strip (Mean Overall Score, Document Faithfulness, Mean Hallucination Rate, Red-Team Pass Rate), cross-model comparison chart, and interactive evaluation run drill-downs.
2. **Evaluation Workspace**:
   - **Interactive Mode**: Evaluate custom prompts, reference contexts, and reference ground-truth answers across multiple models simultaneously or query **Gemini 4 Hydrogen** live.
   - **Batch Runner**: Execute batch evaluations of **50, 100, 120, or all 210 test cases** or upload custom CSV/JSON datasets.
3. **Model Benchmarking**: 6-dimension Radar Chart, Latency vs. Hallucination Rate analysis, ranked Leaderboard clearly distinguishing **Measured Live** vs. **Simulated Reference Replay**, and Model Strengths/Weaknesses matrices.
4. **Hallucination Analysis**: Document-grounded pipeline that splits reference documents into indexed passages, extracts atomic claims from model outputs, retrieves top evidence chunks via hybrid TF-IDF cosine similarity, and classifies claims as **Supported**, **Unsupported**, or **Contradictory** (via numeric & negation polarity verification).
5. **Red Teaming Lab**: **56 controlled adversarial test cases** across 8 categories:
   - Prompt Injection
   - Jailbreak Attempts
   - System Prompt Extraction
   - Sensitive Information Leakage
   - Harmful Instruction Handling
   - Role Manipulation
   - Data Exfiltration
   - Context Manipulation
6. **Dataset Management**: Includes a downloadable **210-example labelled dataset** across Factual QA, Document-Grounded QA, Summarization, Instruction Following, and Safety. Supports CSV/JSON import, schema validation, deduplication, missing-value repair, and configurable Train/Eval splits (70/30, 80/20, 90/10).
7. **Reports & Analytics**: Automated Failure Mode & Root-Cause synthesis plus one-click **PDF Report** and **CSV Report** downloads.
8. **Settings & Metrics Reference**: Interactive composite weight sliders, provider telemetry, and formal mathematical documentation for every metric.

---

## 3. Evaluation Metrics & Limitations

| Metric | Mathematical Method | Documented Limitations |
| :--- | :--- | :--- |
| **Exact Match (EM)** | Normalized string equality or containment | Penalizes valid paraphrases unless paired with semantic similarity |
| **Precision / Recall / F1** | Content-word token overlap: $F_1 = \frac{2PR}{P+R}$ | Bag-of-words overlap ignores word order and synonym substitution |
| **Semantic Similarity** | Hybrid word + character 3-gram TF-IDF cosine similarity | High lexical similarity alone cannot prove factual truth if negation flips polarity |
| **Context Relevance** | Weighted prompt-entity recall + passage cosine similarity | Heuristic overlap may under-score highly abstractive synthesis |
| **Faithfulness & Hallucination Rate** | Claim-level passage retrieval + numeric/polarity contradiction check | Heuristic judgment; labeled transparently in the UI |
| **Instruction Following** | Constraint satisfaction ratio (JSON, list, word/sentence limits) | Nuanced stylistic tone constraints benefit from LLM-as-a-Judge |
| **Safety & Refusal Accuracy** | Toxicity, injection compromise, and refusal boundary verification | Borderline dual-use educational prompts are flagged for manual review |

---

## 4. Setup, Testing & Deployment

### Local Development
```bash
npm install
npm run dev
```
The application starts on `http://localhost:3000`.

### Automated Tests & Linting
```bash
npx tsx tests/runTests.ts
npx eslint firestore.rules
npm run lint
npm run build
```

### Docker Compose Deployment
```bash
docker compose up --build
```
