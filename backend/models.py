"""
EvalGuard AI — Relational Schema (SQLAlchemy + PostgreSQL + pgvector)
Provides the complete relational data model for standalone FastAPI / Docker deployment.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(256), unique=True, nullable=False)
    display_name = Column(String(120), nullable=False)
    organization = Column(String(120), default="Innodata AI Lab")
    created_at = Column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    owner_uid = Column(String(128), ForeignKey("users.uid"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class LLMModel(Base):
    __tablename__ = "models"
    id = Column(Integer, primary_key=True, index=True)
    model_key = Column(String(120), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    provider = Column(String(120), nullable=False)
    version = Column(String(64), nullable=False)
    cost_per_1k_input = Column(Float, default=0.00015)
    cost_per_1k_output = Column(Float, default=0.0006)
    is_simulated = Column(Boolean, default=False)


class EvaluationDataset(Base):
    __tablename__ = "evaluation_datasets"
    id = Column(Integer, primary_key=True, index=True)
    owner_uid = Column(String(128), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    category = Column(String(80), nullable=False)
    record_count = Column(Integer, default=0)
    duplicate_count = Column(Integer, default=0)
    missing_value_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    test_cases = relationship("TestCase", back_populates="dataset", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("evaluation_datasets.id"), nullable=False, index=True)
    case_code = Column(String(64), nullable=False, index=True)
    question = Column(Text, nullable=False)
    reference_context = Column(Text, nullable=False)
    expected_answer = Column(Text, nullable=False)
    category = Column(String(80), nullable=False)
    expected_safety_behaviour = Column(String(32), default="safe_answer")
    split = Column(String(16), default="train")
    dataset = relationship("EvaluationDataset", back_populates="test_cases")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id = Column(Integer, primary_key=True, index=True)
    owner_uid = Column(String(128), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    dataset_name = Column(String(160), nullable=False)
    model_names = Column(String(500), nullable=False)
    sample_count = Column(Integer, default=1)
    overall_score = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=False)
    faithfulness = Column(Float, nullable=False)
    relevance = Column(Float, nullable=False)
    completeness = Column(Float, nullable=False)
    hallucination_rate = Column(Float, nullable=False)
    safety_pass_rate = Column(Float, nullable=False)
    avg_latency_ms = Column(Float, nullable=False)
    is_simulated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelResponse(Base):
    __tablename__ = "model_responses"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("evaluation_runs.id"), nullable=False, index=True)
    model_name = Column(String(120), nullable=False)
    prompt = Column(Text, nullable=False)
    response_text = Column(Text, nullable=False)
    latency_ms = Column(Float, default=0.0)
    token_count = Column(Integer, default=0)


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"
    id = Column(Integer, primary_key=True, index=True)
    response_id = Column(Integer, ForeignKey("model_responses.id"), nullable=False, index=True)
    exact_match = Column(Float, nullable=False)
    precision = Column(Float, nullable=False)
    recall = Column(Float, nullable=False)
    f1 = Column(Float, nullable=False)
    semantic_similarity = Column(Float, nullable=False)
    faithfulness = Column(Float, nullable=False)
    hallucination_rate = Column(Float, nullable=False)
    overall_score = Column(Float, nullable=False)


class RedTeamTest(Base):
    __tablename__ = "red_team_tests"
    id = Column(Integer, primary_key=True, index=True)
    test_code = Column(String(32), unique=True, nullable=False, index=True)
    category = Column(String(80), nullable=False, index=True)
    severity = Column(String(32), nullable=False)
    title = Column(String(160), nullable=False)
    test_input = Column(Text, nullable=False)
    expected_behaviour = Column(Text, nullable=False)


class VulnerabilityFinding(Base):
    __tablename__ = "vulnerability_findings"
    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("red_team_tests.id"), nullable=False, index=True)
    model_name = Column(String(120), nullable=False)
    model_response = Column(Text, nullable=False)
    outcome = Column(String(32), nullable=False)  # Passed | Failed | Needs manual review
    rationale = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReportRecord(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    owner_uid = Column(String(128), nullable=False, index=True)
    title = Column(String(160), nullable=False)
    report_type = Column(String(64), nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


Index("ix_eval_runs_owner_created", EvaluationRun.owner_uid, EvaluationRun.created_at)
