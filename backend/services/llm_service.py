"""
LLM Service — Groq Integration
Fixed: proper async generator typing, robust error handling, correct meta chunk delivery.
"""
import json
import logging
import os
import re
from typing import AsyncGenerator, Optional

from groq import AsyncGroq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT_TEMPLATE = """You are a data analyst for an Order-to-Cash (O2C) business system.
You ONLY answer questions about the SAP O2C dataset described below. For anything else, reply: OFF_TOPIC

{schema}

RULES:
- Only answer about: sales orders, deliveries, billing documents, journal entries, business partners, products, payments, plants.
- Never fabricate data. All answers must come from query results.
- Only SELECT statements allowed. No DROP/DELETE/UPDATE/INSERT.
- If question is off-topic (coding, weather, math, opinions, etc.), reply exactly: OFF_TOPIC

To answer, write ONE SQL query between <SQL> and </SQL> tags.
Tables available: {tables}

SQL tips:
- Column names are case-sensitive.
- IDs are stored as text strings.
- Use LIMIT 50 unless doing aggregates.
- For flow tracing, JOIN across tables using the foreign keys described in the schema.

Example:
Question: Which billing documents link to sales order 1000001?
<SQL>SELECT BillingDocument, BillingDate, NetValue FROM billing_document_headers WHERE SalesOrder = '1000001'</SQL>
"""

OFF_TOPIC_RESPONSE = (
    "This system only answers questions about the Order-to-Cash dataset — "
    "sales orders, deliveries, billing documents, journal entries, business partners, products, and payments. "
    "Please ask a question about the business data."
)


class LLMService:
    def __init__(self, schema: str, tables: list[str]):
        if not GROQ_API_KEY:
            logger.error("GROQ_API_KEY is not set! Add it to backend/.env")
        self.client = AsyncGroq(api_key=GROQ_API_KEY)
        self.system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            schema=schema,
            tables=", ".join(tables),
        )

    async def _is_off_topic(self, question: str) -> bool:
        """Fast pre-check with small model."""
        try:
            resp = await self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                max_tokens=5,
                temperature=0,
                messages=[{"role": "user", "content":
                    f"Is this question about an Order-to-Cash business dataset "
                    f"(sales orders, deliveries, billing, payments, customers, products)? "
                    f"Answer only YES or NO.\nQuestion: {question}"}],
            )
            answer = (resp.choices[0].message.content or "").strip().upper()
            return answer.startswith("NO")
        except Exception as e:
            logger.warning("Pre-check failed: %s — defaulting to NOT off-topic", e)
            return False

    def _extract_sql(self, text: str) -> Optional[str]:
        match = re.search(r"<SQL>(.*?)</SQL>", text, re.DOTALL | re.IGNORECASE)
        if match:
            sql = match.group(1).strip()
            if re.match(r"^\s*SELECT", sql, re.IGNORECASE):
                return sql
        return None

    async def answer(
        self,
        question: str,
        execute_sql_fn,
        conversation_history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Pipeline: guardrail → SQL gen → SQL exec → stream answer.
        First chunk is always __META__{...} carrying sql + row_count.
        """
        # ── Guardrail ────────────────────────────────────────────────────────
        if await self._is_off_topic(question):
            yield f"__META__{json.dumps({'sql': None, 'row_count': 0})}"
            yield OFF_TOPIC_RESPONSE
            return

        # ── Build message history ────────────────────────────────────────────
        messages = [{"role": "system", "content": self.system_prompt}]
        if conversation_history:
            for m in conversation_history[-6:]:
                if m.get("role") in ("user", "assistant") and m.get("content"):
                    messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": question})

        # ── Step 1: Generate SQL ─────────────────────────────────────────────
        generated_sql: Optional[str] = None
        sql_results_str = "(no results)"
        row_count = 0

        try:
            sql_resp = await self.client.chat.completions.create(
                model=MODEL,
                max_tokens=500,
                temperature=0,
                messages=messages,
            )
            sql_text = sql_resp.choices[0].message.content or ""
            logger.info("SQL generation response: %s", sql_text[:300])

            if "OFF_TOPIC" in sql_text:
                yield f"__META__{json.dumps({'sql': None, 'row_count': 0})}"
                yield OFF_TOPIC_RESPONSE
                return

            generated_sql = self._extract_sql(sql_text)

        except Exception as e:
            logger.error("SQL generation failed: %s", e)
            yield f"__META__{json.dumps({'sql': None, 'row_count': 0})}"
            yield f"Sorry, I encountered an error generating the query: {e}"
            return

        # ── Step 2: Execute SQL ──────────────────────────────────────────────
        if generated_sql:
            try:
                rows = execute_sql_fn(generated_sql)
                row_count = len(rows)
                sql_results_str = json.dumps(rows[:50], default=str) if rows else "[] (no rows)"
                logger.info("SQL returned %d rows", row_count)
            except Exception as e:
                sql_results_str = f"SQL error: {e}"
                logger.warning("SQL execution error [%s]: %s", generated_sql, e)
        else:
            logger.warning("No SQL extracted from: %s", sql_text[:200] if 'sql_text' in dir() else "N/A")

        # ── Yield metadata ───────────────────────────────────────────────────
        yield f"__META__{json.dumps({'sql': generated_sql, 'row_count': row_count})}"

        # ── Step 3: Stream natural language answer ───────────────────────────
        answer_messages = messages + [
            {"role": "assistant", "content": sql_text if generated_sql else "I could not generate a SQL query."},
            {"role": "user", "content": (
                f"Query results: {sql_results_str}\n\n"
                f"Now answer the user's question: '{question}'\n"
                f"- Be direct and concise (under 200 words).\n"
                f"- Use specific values from the results.\n"
                f"- If results are empty, say so clearly.\n"
                f"- Do not mention SQL or technical details."
            )},
        ]

        try:
            stream = await self.client.chat.completions.create(
                model=MODEL,
                max_tokens=500,
                temperature=0.2,
                messages=answer_messages,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            logger.error("Answer streaming failed: %s", e)
            yield f"\n\n[Error generating answer: {e}]"
