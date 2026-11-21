"""
Integration tests for SQLite Caching and end-to-end processing pipeline.
"""

import os
import tempfile
import pytest
from backend.ai_service import AIService
from backend.cache import ReviewCache
from backend.models import ReviewAnalysis
from backend.processor import ReviewProcessor


def test_sqlite_cache_roundtrip():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        cache = ReviewCache(db_path=db_path)
        sample_hash = "abcdef1234567890"
        analysis = ReviewAnalysis(
            sentiment="positive",
            topics=["quality"],
            summary="High quality item.",
            needs_reply=False,
        )
        cache.set(sample_hash, analysis, suggested_reply="Glad you liked it!")

        cached = cache.get(sample_hash)
        assert cached is not None
        cached_analysis, reply = cached
        assert cached_analysis.sentiment == "positive"
        assert reply == "Glad you liked it!"
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_full_pipeline_with_caching_and_duplicates():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        cache = ReviewCache(db_path=db_path)
        ai_service = AIService()
        ai_service.provider = "mock"
        processor = ReviewProcessor(cache=cache, ai_service=ai_service)

        csv_content = """review_id,product,rating,date,review_text
R001,Cotton Bedsheet Set,5,2026-10-02,"Super soft fabric, colours did not fade after 3 washes."
R002,Cotton Bedsheet Set,5,2026-10-02,"Super soft fabric, colours did not fade after 3 washes."
R005,Cotton Bedsheet Set,5,2026-10-07,""
"""
        # Run 1: first upload
        reviews, summary = processor.process_csv_content(csv_content)
        assert len(reviews) == 3
        # 2 non-empty reviews received analysis (1 via AI, 1 duplicate populated via cache)
        assert summary.total_analyzed == 2
        assert summary.stats.ai_calls_made == 1
        assert summary.stats.duplicate_reviews_count == 1
        assert summary.stats.empty_reviews_count == 1

        # Run 2: upload identical file -> served from cache without any new AI calls
        reviews2, summary2 = processor.process_csv_content(csv_content)
        assert summary2.stats.ai_calls_made == 0
        assert summary2.stats.served_from_cache >= 1
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
