"""
Integration test for FastAPI API endpoints.
Tests health_check, load_sample_reviews, and suggest_reply route handlers.
"""

from backend.main import health_check, load_sample_reviews, suggest_reply
from backend.models import SuggestedReplyRequest


def test_health_endpoint():
    data = health_check()
    assert data["status"] == "healthy"
    assert "provider" in data


def test_sample_reviews_endpoint():
    data = load_sample_reviews()
    assert "reviews" in data
    assert "summary" in data
    assert len(data["reviews"]) == 30
    assert data["summary"].total_analyzed == 29
    assert data["summary"].stats.empty_reviews_count == 1
    assert data["summary"].stats.duplicate_reviews_count >= 1


def test_suggest_reply_endpoint():
    req = SuggestedReplyRequest(
        review_id="R007",
        product="Ceramic Coffee Mug (Set of 2)",
        review_text="One mug arrived broken. Customer support took 6 days to reply and still no refund.",
        sentiment="negative",
        topics=["quality", "support"],
        summary="Mug arrived broken and refund unresolved.",
    )
    res = suggest_reply(req)
    assert res.review_id == "R007"
    assert len(res.suggested_reply) > 20
    assert "help@reviewlens-store.com" in res.suggested_reply or "support" in res.suggested_reply.lower()
