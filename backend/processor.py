"""
Review Processing Pipeline for ReviewLens.
Coordinates CSV cleaning, SQLite caching, deduplication, batch LLM processing,
rating mismatch detection, and dashboard analytics aggregation.
"""

from collections import Counter
import time
from typing import Dict, List, Optional, Tuple

from backend.ai_service import AIService
from backend.cache import ReviewCache
from backend.data_cleaner import (
    calculate_agreement_rate,
    check_rating_mismatch,
    parse_and_clean_csv,
)
from backend.models import (
    BatchProcessStats,
    CleanedReview,
    DashboardSummary,
    ReviewAnalysis,
    TopInsight,
)


class ReviewProcessor:
    def __init__(self, cache: Optional[ReviewCache] = None, ai_service: Optional[AIService] = None):
        self.cache = cache or ReviewCache()
        self.ai_service = ai_service or AIService()

    def process_csv_content(self, csv_content: str, batch_size: int = 5) -> Tuple[List[CleanedReview], DashboardSummary]:
        start_time = time.perf_counter()

        # Step 1: Parse and clean raw CSV data (bad rows, missing ratings, empty text)
        reviews: List[CleanedReview] = parse_and_clean_csv(csv_content)

        ai_calls_made = 0
        served_from_cache = 0
        empty_count = 0
        duplicate_count = 0

        # Step 2: Check persistent SQLite cache & in-memory duplicates
        # Keep track of unique valid reviews to analyze
        to_analyze: List[CleanedReview] = []
        hash_to_analysis: Dict[str, ReviewAnalysis] = {}
        hash_to_reply: Dict[str, str] = {}

        for r in reviews:
            if r.is_empty:
                empty_count += 1
                continue

            if r.is_duplicate:
                duplicate_count += 1
                # Duplicate will inherit analysis from its first occurrence later
                continue

            # Check SQLite cache
            cached_result = self.cache.get(r.text_hash)
            if cached_result:
                analysis, suggested_reply = cached_result
                r.analysis = analysis
                r.cached = True
                if suggested_reply:
                    r.suggested_reply = suggested_reply
                served_from_cache += 1
                hash_to_analysis[r.text_hash] = analysis
                if suggested_reply:
                    hash_to_reply[r.text_hash] = suggested_reply
            else:
                to_analyze.append(r)

        # Step 3: Process uncached reviews in batches of up to batch_size (Core Requirement 5)
        for i in range(0, len(to_analyze), batch_size):
            batch = to_analyze[i : i + batch_size]
            ai_calls_made += 1
            batch_results = self.ai_service.analyze_batch(batch)

            for review_id, analysis in batch_results:
                matched_review = next((r for r in batch if r.review_id == review_id), None)
                if matched_review:
                    if analysis is not None:
                        matched_review.analysis = analysis
                        matched_review.analysis_failed = False
                        # Save to persistent SQLite cache
                        self.cache.set(
                            matched_review.text_hash,
                            analysis,
                            model_used=self.ai_service.provider,
                        )
                        hash_to_analysis[matched_review.text_hash] = analysis
                    else:
                        matched_review.analysis_failed = True

        # Step 4: Populate duplicate reviews with the analysis of their identical original
        for r in reviews:
            if r.is_duplicate and r.text_hash in hash_to_analysis:
                r.analysis = hash_to_analysis[r.text_hash]
                r.cached = True
                served_from_cache += 1
                if r.text_hash in hash_to_reply:
                    r.suggested_reply = hash_to_reply[r.text_hash]

        # Step 5: Check rating mismatches (Bonus requirement)
        for r in reviews:
            if r.analysis and not r.analysis_failed:
                r.rating_mismatch = check_rating_mismatch(r.rating, r.analysis.sentiment)

        elapsed_time = round(time.perf_counter() - start_time, 3)

        # Step 6: Compute Dashboard Summary & Aggregates
        analyzed_valid = [r for r in reviews if r.analysis is not None and not r.analysis_failed]
        total_analyzed = len(analyzed_valid)

        pos_count = sum(1 for r in analyzed_valid if r.analysis.sentiment == "positive")
        neu_count = sum(1 for r in analyzed_valid if r.analysis.sentiment == "neutral")
        neg_count = sum(1 for r in analyzed_valid if r.analysis.sentiment == "negative")
        needs_reply_count = sum(1 for r in analyzed_valid if r.analysis.needs_reply)

        pos_pct = round((pos_count / total_analyzed * 100), 1) if total_analyzed else 0.0
        neu_pct = round((neu_count / total_analyzed * 100), 1) if total_analyzed else 0.0
        neg_pct = round((neg_count / total_analyzed * 100), 1) if total_analyzed else 0.0

        agreement_pct = calculate_agreement_rate(reviews)

        # Compute Top 3 Complaints & Top 3 Praises
        top_complaints = self._compute_top_insights(analyzed_valid, sentiment_filter="negative")
        top_praises = self._compute_top_insights(analyzed_valid, sentiment_filter="positive")

        # Speed & cost estimation
        # Assuming ~150 input + 100 output tokens per review = ~$0.00005 per review on Gemini Flash
        estimated_cost = round(ai_calls_made * 5 * 0.00005, 5)

        stats = BatchProcessStats(
            total_reviews_in_file=len(reviews),
            valid_reviews_count=total_analyzed,
            empty_reviews_count=empty_count,
            duplicate_reviews_count=duplicate_count,
            ai_calls_made=ai_calls_made,
            served_from_cache=served_from_cache,
            analysis_failed_count=sum(1 for r in reviews if r.analysis_failed),
            processing_time_seconds=elapsed_time,
            estimated_cost_usd=estimated_cost,
        )

        summary = DashboardSummary(
            total_analyzed=total_analyzed,
            positive_count=pos_count,
            neutral_count=neu_count,
            negative_count=neg_count,
            positive_pct=pos_pct,
            neutral_pct=neu_pct,
            negative_pct=neg_pct,
            needs_reply_count=needs_reply_count,
            rating_agreement_pct=agreement_pct,
            top_complaints=top_complaints,
            top_praises=top_praises,
            stats=stats,
        )

        return reviews, summary

    def _compute_top_insights(
        self, reviews: List[CleanedReview], sentiment_filter: str
    ) -> List[TopInsight]:
        """Identifies the top 3 topics and representative customer quotes."""
        matching = [
            r for r in reviews
            if r.analysis and r.analysis.sentiment == sentiment_filter
        ]
        
        topic_counts: Counter = Counter()
        topic_samples: Dict[str, str] = {}

        for r in matching:
            assert r.analysis is not None
            for topic in r.analysis.topics:
                topic_counts[topic] += 1
                if topic not in topic_samples:
                    topic_samples[topic] = r.analysis.summary

        top_3 = topic_counts.most_common(3)
        return [
            TopInsight(
                topic=topic,
                count=count,
                sample_quote=topic_samples.get(topic, ""),
            )
            for topic, count in top_3
        ]
