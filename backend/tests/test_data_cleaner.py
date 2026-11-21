"""
Unit tests for CSV cleaning, HTML stripping, rating parsing, and deduplication.
"""

import pytest
from backend.data_cleaner import (
    calculate_agreement_rate,
    check_rating_mismatch,
    clean_html_and_whitespace,
    compute_text_hash,
    parse_and_clean_csv,
    parse_rating,
)
from backend.models import CleanedReview, ReviewAnalysis


def test_clean_html_and_whitespace():
    raw = "<b>Love it!</b>\nKeeps my desk clean, and the bamboo smells nice."
    cleaned = clean_html_and_whitespace(raw)
    assert "<b>" not in cleaned
    assert "</b>" not in cleaned
    assert "Love it! Keeps my desk clean, and the bamboo smells nice." == cleaned


def test_parse_rating_valid_and_invalid():
    assert parse_rating("5") == 5
    assert parse_rating("1") == 1
    assert parse_rating("4.0") == 4
    # Missing / empty
    assert parse_rating("") is None
    assert parse_rating(None) is None
    # String word instead of number (R022)
    assert parse_rating("five") is None
    assert parse_rating("unknown") is None
    # Out of range
    assert parse_rating("0") is None
    assert parse_rating("6") is None


def test_compute_text_hash_deterministic():
    text1 = "Super soft fabric, colours did not fade after 3 washes."
    text2 = "  Super soft fabric, colours did not fade after 3 washes.  \n"
    assert compute_text_hash(text1) == compute_text_hash(text2)


def test_parse_and_clean_csv_handles_edge_cases():
    sample_csv = """review_id,product,rating,date,review_text
R001,Cotton Bedsheet Set,5,2026-10-02,"Super soft fabric."
R005,Cotton Bedsheet Set,5,2026-10-07,""
R010,Ceramic Coffee Mug (Set of 2),,2026-10-09,"Good quality but overpriced."
R012,Wireless Earbuds X2,1,2026-10-03,"Left earbud stopped working after 2 days."
R015,Wireless Earbuds X2,1,2026-10-03,"Left earbud stopped working after 2 days."
R022,Running Shoes Pro,five,2026-10-11,"Best shoes ever."
"""
    reviews = parse_and_clean_csv(sample_csv)
    assert len(reviews) == 6

    # R001: standard valid
    assert reviews[0].review_id == "R001"
    assert reviews[0].rating == 5
    assert not reviews[0].is_empty
    assert not reviews[0].is_duplicate

    # R005: empty review text flagged
    assert reviews[1].review_id == "R005"
    assert reviews[1].is_empty is True

    # R010: missing rating treated as None (unknown)
    assert reviews[2].review_id == "R010"
    assert reviews[2].rating is None

    # R012: first occurrence
    assert reviews[3].review_id == "R012"
    assert not reviews[3].is_duplicate

    # R015: duplicate text of R012
    assert reviews[4].review_id == "R015"
    assert reviews[4].is_duplicate is True
    assert reviews[4].duplicate_of == "R012"

    # R022: invalid string rating 'five' treated as None
    assert reviews[5].review_id == "R022"
    assert reviews[5].rating is None


def test_check_rating_mismatch_and_agreement():
    # 5 stars but negative text -> mismatch!
    assert check_rating_mismatch(5, "negative") is True
    # 1 star but positive text -> mismatch!
    assert check_rating_mismatch(1, "positive") is True
    # 5 stars with positive text -> agreement!
    assert check_rating_mismatch(5, "positive") is False
    # None rating -> no mismatch
    assert check_rating_mismatch(None, "negative") is False

    r1 = CleanedReview(
        review_id="R1", product="P", rating=5,
        analysis=ReviewAnalysis(sentiment="positive", topics=["quality"], summary="Good", needs_reply=False)
    )
    r2 = CleanedReview(
        review_id="R2", product="P", rating=5,
        analysis=ReviewAnalysis(sentiment="negative", topics=["quality"], summary="Terrible", needs_reply=True)
    )
    rate = calculate_agreement_rate([r1, r2])
    assert rate == 50.0
