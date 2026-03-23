# ContextGraph — Order to Cash Explorer

An interactive graph visualization and natural language query system for Order-to-Cash (O2C) business process data. Built with FastAPI, React, NetworkX, SQLite, and Groq (LLaMA 3.3 70B).

---

## Live Demo

🔗 **[https://dogde-ai-assignment.vercel.app](https://dogde-ai-assignment.vercel.app)**

> **Note:** The backend runs on Render's free tier and may take 30–60 seconds to wake up on first load. The graph will appear once the backend is ready.

**Backend API:** [https://dogdeai-assignment.onrender.com](https://dogdeai-assignment.onrender.com)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (Vite) — deployed on Vercel             │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Graph Canvas    │  │  Chat Panel                  │ │
│  │  (Canvas API)    │  │  (Streaming SSE)             │ │
│  │  - Expand nodes  │  │  - NL queries                │ │
│  │  - Inspect meta  │  │  - SQL disclosure            │ │
│  │  - Node highlight│  │  - Guardrail warnings        │ │
│  │  - Dark/Light    │  │  - Conversation memory       │ │
│  └──────────────────┘  └──────────────────────────────┘ │
└───────────────────┬─────────────────────────────────────┘
                    │ REST + SSE
┌───────────────────▼─────────────────────────────────────┐
│  FastAPI Backend — deployed on Render                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ /api/graph/* │  │ /api/chat/*  │  │ Graph Builder │  │
│  │ - summary    │  │ - /stream    │  │ (startup)     │  │
│  │ - initial    │  │              │  │               │  │
│  │ - /node/:id  │  └──────┬───────┘  └───────┬───────┘  │
│  │ - /search    │         │                  │          │
│  └──────────────┘  ┌──────▼───────┐          │          │
│                    │  LLM Service │          │          │
│                    │  (Groq)      │          │          │
│                    │  Guardrails  │          │          │
│                    │  NL → SQL    │          │          │
│                    └──────┬───────┘          │          │
└───────────────────────────┼──────────────────┼──────────┘
                            │                  │
              ┌─────────────▼──┐  ┌────────────▼──────────┐
              │   SQLite DB    │  │  NetworkX DiGraph      │
              │  (raw tables)  │  │  (in-memory)           │
              │  LLM runs SQL  │  │  traversal + export    │
              └────────────────┘  └───────────────────────-┘
```

---

## Key Design Decisions

### 1. Storage: NetworkX + SQLite (dual-layer)

**Why two stores?**

- **NetworkX DiGraph** (in-memory): Graph traversal, neighbor expansion, subgraph extraction for visualization. NetworkX lets us express complex graph operations (BFS, shortest path, connected components) in pure Python with no external service dependency.
- **SQLite** (persistent): The LLM generates SQL queries against structured tables. SQL is far more reliable and verifiable than a graph query language — the LLM can construct valid `SELECT` statements that return precise, auditable results. No graph database server to set up or manage.

**Tradeoff**: For very large datasets (millions of nodes), a dedicated graph DB like Neo4j would be faster for deep traversals. For this scale (1025 nodes, 4231 edges), NetworkX in memory is adequate and zero-dependency.

### 2. LLM Integration: Groq + LLaMA 3.3 70B

**Why Groq?**
- Fastest free inference available (~300 tokens/sec).
- LLaMA 3.3 70B has strong SQL generation capability.
- Free tier is sufficient for demo usage.

**Two-model pipeline**:
- Pre-check: `llama-3.1-8b-instant` (fast, cheap) classifies whether the question is O2C-related.
- Main: `llama-3.3-70b-versatile` generates SQL and formulates the natural language answer.

**NL → SQL prompting strategy**:
The system prompt includes the full schema (table names, column names, sample values, and foreign key relationships). The LLM is instructed to output SQL in `<SQL>...</SQL>` tags, which are parsed and validated before execution. Only `SELECT` statements are allowed. The schema context ensures the LLM generates queries grounded in the actual dataset rather than hallucinating column names.

### 3. Guardrails (three-layer)

| Layer | Method | Handles |
|---|---|---|
| Pre-check | Fast 8b model, YES/NO classification | Obvious off-topic (coding, weather, opinions) |
| System prompt | `OFF_TOPIC` keyword instruction | Domain boundary enforcement |
| SQL validation | Regex: only `SELECT` allowed | Injection / destructive SQL prevention |

When either guardrail triggers, the user receives a polite redirect message rather than an error. The system explicitly restricts responses to the Order-to-Cash dataset domain.

### 4. Graph Modeling

**Entities (nodes) — 19 types:**
- SalesOrder, SalesOrderItem, ScheduleLine
- Delivery, DeliveryItem
- BillingDoc, BillingItem, BillingCancel
- JournalEntry, Payment
- BusinessPartner, BPAddress, CustomerCompany, CustomerSalesArea
- Product, ProductDesc, ProductPlant, ProductStorage, Plant

**Relationships (directed edges) — 12 types:**
- `SalesOrderItem → SalesOrder` (ITEM_OF)
- `Delivery → SalesOrder` (DELIVERS)
- `BillingDoc → SalesOrder` (BILLED_FROM)
- `JournalEntry → BillingDoc` (JOURNAL_FOR)
- `Payment → BillingDoc` (PAYS)
- and more...

**Why directed?** The O2C flow is naturally directional: an order triggers delivery, which triggers billing, which triggers journal entries. Directed edges make it easy to traverse the flow forward or backward.

### 5. Node Highlighting from Chat

When the agent responds with entity IDs (e.g., billing doc `91150187`, journal entry `9400635958`), the frontend extracts those IDs using regex patterns tuned for O2C document numbers (7–10 digit ranges). Matching nodes are then highlighted on the graph canvas with a colored glow ring, creating a direct visual link between the chat response and the graph.

### 6. Streaming

Chat responses stream via Server-Sent Events (SSE). The backend yields tokens as they arrive from Groq. A `__META__` prefix carries SQL metadata (the generated query + row count) so the frontend can display the collapsible SQL disclosure without waiting for the full response.

---

## Project Structure

```
context-graph/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, CORS
│   ├── requirements.txt
│   ├── .env.example
│   ├── data/                    # Dataset CSV/Excel files
│   ├── routes/
│   │   ├── graph.py             # Graph visualization API
│   │   └── chat.py              # LLM chat API (streaming)
│   └── services/
│       ├── graph_builder.py     # NetworkX + SQLite ingestion
│       └── llm_service.py       # Groq NL→SQL pipeline + guardrails
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── vercel.json              # Vercel API proxy config
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx              # Layout + theme toggle
        ├── index.css            # Design system (light/dark themes)
        └── components/
            ├── GraphCanvas.jsx  # Canvas-based force graph + highlighting
            ├── NodeInspector.jsx # Node metadata panel
            └── ChatPanel.jsx    # Streaming chat with SQL disclosure
```

---

## Setup & Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A free [Groq API key](https://console.groq.com)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## Example Queries

```
Which products are associated with the highest number of billing documents?
Trace the full flow of billing document 91150187
Show sales orders that were delivered but not billed
Which business partners have the highest total order value?
Find journal entries linked to billing documents in April 2025
How many deliveries are there per sales order on average?
Show all billing documents with negative amounts (credit memos)
Find incomplete order-to-cash flows
```

---

## Guardrail Examples

| Query | Response |
|---|---|
| "What is the capital of France?" | Off-topic redirect |
| "Write me a poem" | Off-topic redirect |
| "What's 2+2?" | Off-topic redirect |
| "Who is Elon Musk?" | Off-topic redirect |
| "Who are the top customers?" | ✅ Answered with data |
| "Find billing documents with no payment" | ✅ Answered with data |

---

## Evaluation Criteria Alignment

| Area | Implementation |
|---|---|
| Graph modelling | 19 entity types, 12 directed relationship types, realistic O2C flow |
| Graph visualization | Force-directed canvas graph, node expansion, metadata inspection, node highlighting from chat |
| Conversational query | NL → SQL → natural language answer, grounded in dataset |
| Database choice | SQLite (LLM SQL queries) + NetworkX (graph traversal) — each used for its strength |
| LLM prompting | Schema-grounded prompting, SQL in tags, two-step pipeline, streaming SSE |
| Guardrails | Three-layer: fast model pre-check + system prompt + SQL validation |

---

## Bonus Features Implemented

- ✅ Natural language → SQL translation (with collapsible SQL disclosure in UI)
- ✅ Streaming responses (SSE)
- ✅ Conversation memory (last 3 turns sent as context)
- ✅ Node expansion (click any node → fetch and render neighbors)
- ✅ Node highlighting from chat (mentioned entity IDs glow on graph)
- ✅ Graph search (search by entity ID or label)
- ✅ Graph statistics panel (node/edge counts by type)
- ✅ Light/Dark theme toggle
- ✅ Deployed on Vercel (frontend) + Render (backend)
