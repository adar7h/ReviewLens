"""
SQLite Persistent Cache for ReviewLens.
Stores already-analyzed review hashes to eliminate redundant LLM API calls,
save cost, and ensure sub-second response times on repeat uploads.
"""

from contextlib import contextmanager
import json
import os
import sqlite3
from typing import Generator, Optional, Tuple
from backend.models import ReviewAnalysis


DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "cache.db")


class ReviewCache:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS review_cache (
                    text_hash TEXT PRIMARY KEY,
                    sentiment TEXT NOT NULL,
                    topics TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    needs_reply INTEGER NOT NULL,
                    suggested_reply TEXT,
                    model_used TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            conn.commit()

    def get(self, text_hash: str) -> Optional[Tuple[ReviewAnalysis, Optional[str]]]:
        """
        Retrieves cached analysis and optional suggested reply for a given text hash.
        Returns (ReviewAnalysis, suggested_reply) or None if not found.
        """
        if not text_hash:
            return None
        with self._connection() as conn:
            cursor = conn.execute(
                """
                SELECT sentiment, topics, summary, needs_reply, suggested_reply
                FROM review_cache
                WHERE text_hash = ?
                """,
                (text_hash,),
            )
            row = cursor.fetchone()
            if not row:
                return None

            try:
                topics_list = json.loads(row["topics"])
                analysis = ReviewAnalysis(
                    sentiment=row["sentiment"],
                    topics=topics_list,
                    summary=row["summary"],
                    needs_reply=bool(row["needs_reply"]),
                )
                suggested_reply = row["suggested_reply"]
                return analysis, suggested_reply
            except Exception:
                return None

    def set(
        self,
        text_hash: str,
        analysis: ReviewAnalysis,
        suggested_reply: Optional[str] = None,
        model_used: str = "default",
    ) -> None:
        """Saves a validated review analysis to the SQLite cache."""
        if not text_hash:
            return
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO review_cache (
                    text_hash, sentiment, topics, summary, needs_reply, suggested_reply, model_used
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(text_hash) DO UPDATE SET
                    sentiment = excluded.sentiment,
                    topics = excluded.topics,
                    summary = excluded.summary,
                    needs_reply = excluded.needs_reply,
                    suggested_reply = COALESCE(excluded.suggested_reply, review_cache.suggested_reply),
                    model_used = excluded.model_used;
                """,
                (
                    text_hash,
                    analysis.sentiment,
                    json.dumps(analysis.topics),
                    analysis.summary,
                    1 if analysis.needs_reply else 0,
                    suggested_reply,
                    model_used,
                ),
            )
            conn.commit()

    def update_reply(self, text_hash: str, suggested_reply: str) -> None:
        """Updates the suggested reply for an already cached review."""
        if not text_hash:
            return
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE review_cache
                SET suggested_reply = ?
                WHERE text_hash = ?;
                """,
                (suggested_reply, text_hash),
            )
            conn.commit()

    def count(self) -> int:
        """Returns the total number of cached entries."""
        with self._connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) AS total FROM review_cache")
            row = cursor.fetchone()
            return int(row["total"]) if row else 0

    def clear(self) -> None:
        """Clears all cached records (useful for testing)."""
        with self._connection() as conn:
            conn.execute("DELETE FROM review_cache;")
            conn.commit()
