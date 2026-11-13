"""
EvalGuard AI — FastAPI Evaluation & Red-Teaming Microservice
Provides REST endpoints for standalone Python/Docker deployment alongside the React frontend.
"""

import re
import math
from typing import List, Optional
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(
    title="EvalGuard AI API",
    description="LLM Evaluation, Benchmarking, Hallucination Detection & Red-Teaming Engine",
    version="1.0.0",
)


class EvaluationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    reference_context: str = Field(default="")
    reference_answer: str = Field(..., min_length=1)
    model_name: str = Field(default="gemini-4-hydrogen")
    model_response: str = Field(..., min_length=1)


class EvaluationMetricsResponse(BaseModel):
    model_name: str
    exact_match: float
    precision: float
    recall: float
    f1: float
    semantic_similarity: float
    faithfulness: float
    hallucination_rate: float
    overall_score: float


def tokenize(text: str) -> List[str]:
    cleaned = re.sub(r"[^\w\s.%$-]", " ", (text or "").lower())
    return [w for w in cleaned.split() if len(w) > 1]


def compute_metrics(req: EvaluationRequest) -> EvaluationMetricsResponse:
    pred_tokens = tokenize(req.model_response)
    ref_tokens = tokenize(req.reference_answer)
    if not pred_tokens or not ref_tokens:
        return EvaluationMetricsResponse(
            model_name=req.model_name,
            exact_match=0.0,
            precision=0.0,
            recall=0.0,
            f1=0.0,
            semantic_similarity=0.0,
            faithfulness=0.0,
            hallucination_rate=100.0,
            overall_score=0.0,
        )

    exact = 100.0 if " ".join(pred_tokens) == " ".join(ref_tokens) else 0.0
    ref_set = set(ref_tokens)
    overlap = sum(1 for t in pred_tokens if t in ref_set)
    precision = min(100.0, (overlap / len(pred_tokens)) * 100.0)
    recall = min(100.0, (overlap / len(ref_tokens)) * 100.0)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    ctx_tokens = set(tokenize(req.reference_context or req.reference_answer))
    ctx_overlap = sum(1 for t in pred_tokens if t in ctx_tokens)
    faithfulness = min(100.0, (ctx_overlap / max(1, len(pred_tokens))) * 115.0)
    hallucination_rate = max(0.0, 100.0 - faithfulness)
    sem_sim = min(100.0, (f1 * 0.6 + faithfulness * 0.4))
    overall = round(f1 * 0.45 + faithfulness * 0.35 + sem_sim * 0.20, 1)

    return EvaluationMetricsResponse(
        model_name=req.model_name,
        exact_match=round(exact, 1),
        precision=round(precision, 1),
        recall=round(recall, 1),
        f1=round(f1, 1),
        semantic_similarity=round(sem_sim, 1),
        faithfulness=round(faithfulness, 1),
        hallucination_rate=round(hallucination_rate, 1),
        overall_score=overall,
    )


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "EvalGuard FastAPI Engine"}


@app.post("/api/evaluate", response_model=EvaluationMetricsResponse)
def evaluate_endpoint(payload: EvaluationRequest):
    return compute_metrics(payload)
