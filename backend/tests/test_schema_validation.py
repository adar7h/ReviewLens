"""
Unit tests for schema validation and strict type constraints (Core Requirement 2 & 3).
"""

import pytest
from pydantic import ValidationError
from backend.models import ReviewAnalysis


def test_valid_schema():
    analysis = ReviewAnalysis(
        sentiment="positive",
        topics=["quality", "price"],
        summary="Customer loves the product and considers it good value.",
        needs_reply=False,
    )
    assert analysis.sentiment == "positive"
    assert len(analysis.topics) == 2
    assert analysis.needs_reply is False


def test_invalid_sentiment_rejected():
    with pytest.raises(ValidationError):
        ReviewAnalysis(
            sentiment="ecstatic",  # Not in ["positive", "neutral", "negative"]
            topics=["quality"],
            summary="Invalid sentiment test.",
            needs_reply=False,
        )


def test_invalid_topic_rejected():
    with pytest.raises(ValidationError):
        ReviewAnalysis(
            sentiment="positive",
            topics=["quality", "hallucinated_topic"],  # Not in allowed list
            summary="Invalid topic test.",
            needs_reply=False,
        )


def test_empty_topics_rejected():
    with pytest.raises(ValidationError):
        ReviewAnalysis(
            sentiment="neutral",
            topics=[],
            summary="Empty topics test.",
            needs_reply=False,
        )


def test_blank_summary_rejected():
    with pytest.raises(ValidationError):
        ReviewAnalysis(
            sentiment="positive",
            topics=["quality"],
            summary="   ",
            needs_reply=False,
        )
