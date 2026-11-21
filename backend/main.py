"""
FastAPI Backend Application for ReviewLens.
Provides endpoints for CSV upload, AI review insights, on-click reply generation,
and health checks.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Load environment variables from .env
load_dotenv()

from backend.ai_service import AIService
from backend.cache import ReviewCache
from backend.models import (
    CleanedReview,
    ReviewAnalysis,
    SuggestedReplyRequest,
    SuggestedReplyResponse,
)
from backend.processor import ReviewProcessor

app = FastAPI(
    title="ReviewLens API",
    description="AI Review Insights for Store Owners (CEDCOSS Assessment)",
    version="1.0.0",
)

# Configure CORS
origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize core services
cache = ReviewCache()
ai_service = AIService()
processor = ReviewProcessor(cache=cache, ai_service=ai_service)


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "provider": ai_service.provider,
        "cache_entries_count": cache.count(),
    }


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload and analyze customer reviews from a CSV file.
    Cleans data, validates against schema, caches results, and computes dashboard metrics.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a standard .csv file.",
        )

    try:
        content_bytes = await file.read()
        content_str = content_bytes.decode("utf-8-sig", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    if not content_str.strip():
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")

    reviews, summary = processor.process_csv_content(content_str)
    return {"reviews": reviews, "summary": summary}


@app.get("/api/sample")
def load_sample_reviews():
    """Loads and processes the pre-bundled reviews.csv file for 1-click live demo."""
    sample_path = os.path.join(os.path.dirname(__file__), "..", "reviews.csv")
    if not os.path.exists(sample_path):
        sample_path = "reviews.csv"
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail="Bundled reviews.csv not found.")

    with open(sample_path, "r", encoding="utf-8") as f:
        content = f.read()

    reviews, summary = processor.process_csv_content(content)
    return {"reviews": reviews, "summary": summary}


@app.post("/api/suggest-reply", response_model=SuggestedReplyResponse)
def suggest_reply(req: SuggestedReplyRequest):
    """
    Generates a suggested customer support reply on-click (Core Requirement 7).
    """
    analysis_obj = ReviewAnalysis(
        sentiment=req.sentiment if req.sentiment in ("positive", "neutral", "negative") else "negative",
        topics=req.topics or ["quality"],
        summary=req.summary or "Customer inquiry",
        needs_reply=True,
    )
    dummy_review = CleanedReview(
        review_id=req.review_id,
        product=req.product,
        review_text=req.review_text,
        cleaned_text=req.review_text,
        analysis=analysis_obj,
    )

    reply = ai_service.generate_suggested_reply(dummy_review)

    # Save to SQLite cache if text hash available
    from backend.data_cleaner import compute_text_hash
    t_hash = compute_text_hash(dummy_review.cleaned_text)
    cache.update_reply(t_hash, reply)

    return SuggestedReplyResponse(review_id=req.review_id, suggested_reply=reply)


# Serve React Frontend Build if present
dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        file_path = os.path.join(dist_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
