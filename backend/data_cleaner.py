"""
Data cleaning and CSV parser module for ReviewLens.
Handles bad rows, empty reviews, missing/invalid ratings, HTML sanitization,
and deduplication.
"""

import csv
import hashlib
import io
import re
from typing import List, Optional, Tuple
from backend.models import CleanedReview


HTML_TAG_PATTERN = re.compile(r"<[^>]+>")


def clean_html_and_whitespace(text: str) -> str:
    """Strips HTML tags and normalizes excessive internal whitespace while preserving emojis & unicode."""
    if not text:
        return ""
    # Strip HTML tags like <b>...</b>
    no_html = HTML_TAG_PATTERN.sub("", text)
    # Normalize multiple newlines and carriage returns
    normalized = re.sub(r"\r\n|\r|\n", " ", no_html)
    # Strip leading and trailing whitespace
    return normalized.strip()


def parse_rating(val: str) -> Optional[int]:
    """
    Parses a rating value.
    Returns 1..5 as int if valid, else None (treated as 'unknown').
    Handles cases like empty (''), non-numeric ('five'), or out-of-range ratings.
    """
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str:
        return None
    
    # Try parsing integer or float representation (e.g., '5' or '5.0')
    try:
        num = float(val_str)
        int_num = int(num)
        if int_num == num and 1 <= int_num <= 5:
            return int_num
    except (ValueError, TypeError):
        pass

    # Unrecognized or string like 'five'
    return None


def compute_text_hash(text: str) -> str:
    """
    Computes a deterministic SHA-256 hash of normalized text for caching
    and deduplication.
    """
    # Lowercase and whitespace-condensed for robust matching
    normalized = " ".join(text.lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def parse_and_clean_csv(csv_content: str) -> List[CleanedReview]:
    """
    Parses a CSV string, handles multiline fields, skips/flags empty reviews,
    marks missing/invalid ratings as unknown (None), and marks duplicate reviews.
    """
    f = io.StringIO(csv_content.strip())
    reader = csv.DictReader(f)
    
    cleaned_reviews: List[CleanedReview] = []
    seen_hashes: dict[str, str] = {}  # hash -> first review_id

    for row_idx, row in enumerate(reader, start=1):
        # Normalize dict keys (lowercase and stripped)
        normalized_row = {
            (k.strip().lower() if k else f"col_{i}"): (v.strip() if v else "")
            for i, (k, v) in enumerate(row.items())
        }

        review_id = normalized_row.get("review_id") or f"R{row_idx:03d}"
        product = normalized_row.get("product") or "Unknown Product"
        raw_rating = normalized_row.get("rating", "")
        date = normalized_row.get("date") or ""
        raw_text = normalized_row.get("review_text", "")

        cleaned = clean_html_and_whitespace(raw_text)
        rating = parse_rating(raw_rating)
        is_empty = (len(cleaned) == 0)

        t_hash = compute_text_hash(cleaned) if not is_empty else ""
        is_duplicate = False
        duplicate_of = None

        if not is_empty:
            if t_hash in seen_hashes:
                is_duplicate = True
                duplicate_of = seen_hashes[t_hash]
            else:
                seen_hashes[t_hash] = review_id

        review = CleanedReview(
            review_id=review_id,
            product=product,
            rating=rating,
            rating_raw=raw_rating,
            date=date,
            review_text=raw_text,
            cleaned_text=cleaned,
            text_hash=t_hash,
            is_empty=is_empty,
            is_duplicate=is_duplicate,
            duplicate_of=duplicate_of,
        )
        cleaned_reviews.append(review)

    return cleaned_reviews


def check_rating_mismatch(rating: Optional[int], sentiment: Optional[str]) -> bool:
    """
    Flags whether the star rating contradicts the AI sentiment.
    Examples:
      - 5 stars with 'negative' sentiment -> Mismatch
      - 1 or 2 stars with 'positive' sentiment -> Mismatch
    """
    if rating is None or sentiment is None:
        return False
    
    sentiment_lower = sentiment.lower()
    if rating >= 4 and sentiment_lower == "negative":
        return True
    if rating <= 2 and sentiment_lower == "positive":
        return True
    return False


def calculate_agreement_rate(reviews: List[CleanedReview]) -> float:
    """
    Calculates the % of reviews where star rating agrees with AI sentiment,
    among reviews with known star ratings and valid sentiment.
    """
    evaluable = [
        r for r in reviews
        if r.rating is not None and r.analysis is not None and not r.analysis_failed
    ]
    if not evaluable:
        return 0.0

    agreements = 0
    for r in evaluable:
        assert r.analysis is not None
        if not check_rating_mismatch(r.rating, r.analysis.sentiment):
            agreements += 1

    return round((agreements / len(evaluable)) * 100, 1)
