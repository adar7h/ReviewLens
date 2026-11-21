"""
Pydantic data models and schemas for ReviewLens.
Validates LLM outputs, cleaned CSV data, and dashboard aggregation models.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


SentimentType = Literal["positive", "neutral", "negative"]

TopicType = Literal[
    "quality",
    "delivery",
    "price",
    "packaging",
    "support",
    "size_fit",
    "other",
]

ALLOWED_SENTIMENTS = {"positive", "neutral", "negative"}
ALLOWED_TOPICS = {
    "quality",
    "delivery",
    "price",
    "packaging",
    "support",
    "size_fit",
    "other",
}


class ReviewAnalysis(BaseModel):
    """Structured analysis output required from the LLM for every valid review."""
    sentiment: SentimentType = Field(
        ...,
        description="Must be one of positive, neutral, negative",
    )
    topics: List[TopicType] = Field(
        ...,
        min_length=1,
        description="One or more topics from allowed list",
    )
    summary: str = Field(
        ...,
        min_length=3,
        description="One line concise summary in English",
    )
    needs_reply: bool = Field(
        ...,
        description="True if store owner should respond (complaints, unresolved issues)",
    )

    @field_validator("sentiment", mode="before")
    @classmethod
    def validate_sentiment(cls, v: str) -> str:
        clean = str(v).strip().lower()
        if clean not in ALLOWED_SENTIMENTS:
            raise ValueError(f"Invalid sentiment '{v}'. Must be one of {ALLOWED_SENTIMENTS}")
        return clean

    @field_validator("topics", mode="before")
    @classmethod
    def validate_topics(cls, v: list) -> list:
        if isinstance(v, str):
            v = [v]
        clean_topics = []
        for item in v:
            topic = str(item).strip().lower()
            if topic in ALLOWED_TOPICS:
                if topic not in clean_topics:
                    clean_topics.append(topic)
            else:
                raise ValueError(f"Invalid topic '{item}'. Allowed: {ALLOWED_TOPICS}")
        if not clean_topics:
            raise ValueError("Topics cannot be empty")
        return clean_topics

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, v: str) -> str:
        s = v.strip().replace("\n", " ")
        if not s:
            raise ValueError("Summary cannot be blank")
        return s


class CleanedReview(BaseModel):
    """Represents a row parsed and cleaned from the uploaded CSV."""
    review_id: str
    product: str
    rating: Optional[int] = None  # None if missing or invalid ("unknown")
    rating_raw: str = ""
    date: str = ""
    review_text: str = ""
    cleaned_text: str = ""
    text_hash: str = ""
    is_duplicate: bool = False
    is_empty: bool = False
    duplicate_of: Optional[str] = None
    rating_mismatch: bool = False
    analysis_failed: bool = False
    cached: bool = False
    analysis: Optional[ReviewAnalysis] = None
    suggested_reply: Optional[str] = None


class BatchProcessStats(BaseModel):
    """Execution telemetry for cost, speed, and cache performance."""
    total_reviews_in_file: int = 0
    valid_reviews_count: int = 0
    empty_reviews_count: int = 0
    duplicate_reviews_count: int = 0
    ai_calls_made: int = 0
    served_from_cache: int = 0
    analysis_failed_count: int = 0
    processing_time_seconds: float = 0.0
    estimated_cost_usd: float = 0.0


class TopInsight(BaseModel):
    topic: str
    count: int
    sample_quote: str


class DashboardSummary(BaseModel):
    """Aggregated stats for the single-screen dashboard."""
    total_analyzed: int
    positive_count: int
    neutral_count: int
    negative_count: int
    positive_pct: float
    neutral_pct: float
    negative_pct: float
    needs_reply_count: int
    rating_agreement_pct: float
    top_complaints: List[TopInsight]
    top_praises: List[TopInsight]
    stats: BatchProcessStats


class SuggestedReplyRequest(BaseModel):
    review_id: str
    product: str
    review_text: str
    sentiment: str
    topics: List[str]
    summary: str


class SuggestedReplyResponse(BaseModel):
    review_id: str
    suggested_reply: str
