"""Chat API — SSE streaming endpoint."""
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.graph_builder import get_graph_builder
from services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        gb = get_graph_builder()
        _llm_service = LLMService(
            schema=gb.get_schema_description(),
            tables=list(gb.tables.keys()),
        )
    return _llm_service


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    gb = get_graph_builder()
    llm = get_llm_service()

    async def event_stream():
        try:
            async for chunk in llm.answer(
                question=req.question,
                execute_sql_fn=gb.execute_sql,
                conversation_history=req.history,
            ):
                # Each chunk → one SSE event
                payload = json.dumps({"content": chunk})
                yield f"data: {payload}\n\n"
        except Exception as e:
            logger.error("Stream error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'content': f'Error: {e}'})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/health")
async def chat_health():
    key = os.getenv("GROQ_API_KEY", "")
    return {
        "groq_key_set": bool(key and key != "your_groq_api_key_here"),
        "tables_loaded": len(get_graph_builder().tables),
    }
