"""
Context Graph — FastAPI Application
Order-to-Cash graph explorer with LLM-powered natural language queries.
"""
import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build graph on startup
    logger.info("Initializing graph builder...")
    from services.graph_builder import get_graph_builder
    get_graph_builder()
    logger.info("Application ready.")
    yield


app = FastAPI(
    title="Context Graph — Order to Cash",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
from routes.graph import router as graph_router
from routes.chat import router as chat_router

app.include_router(graph_router)
app.include_router(chat_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve React frontend (after build)
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = FRONTEND_DIST / "index.html"
        return FileResponse(str(index))
