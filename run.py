"""
ReviewLens Quick-Start Launcher.
Starts the unified full-stack application (FastAPI serving React frontend).
Run: python run.py
"""

import os
import sys
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"\n🚀 Starting ReviewLens on http://{host}:{port}")
    print(f"📊 Dashboard: http://localhost:{port}")
    print(f"📖 Swagger API Docs: http://localhost:{port}/docs\n")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
