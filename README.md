# ContextGraph — Order to Cash Explorer

An interactive graph visualization and natural language query system for Order-to-Cash (O2C) business process data. Built with FastAPI, React, NetworkX, SQLite, and Groq (LLaMA 3.3 70B).

---

## Live Demo

> Add your deployed link here after deployment.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (Vite)                                   │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Graph Canvas    │  │  Chat Panel                  │ │
│  │  (React Flow)    │  │  (Streaming SSE)             │ │
│  │  - Expand nodes  │  │  - NL queries                │ │
│  │  - Inspect meta  │  │  - SQL disclosure            │ │
│  │  - Minimap       │  │  - Guardrail warnings        │ │
│  └──────────────────┘  └──────────────────────────────┘ │
└───────────────────┬─────────────────────────────────────┘
                    │ REST + SSE
┌───────────────────▼─────────────────────────────────────┐
│  FastAPI Backend                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ /api/graph/* │  │ /api/chat/*  │  │ Graph Builder │  │
│  │ - summary    │  │ - /stream    │  │ (startup)     │  │
│  │ - initial    │  │ - /ask       │  │               │  │
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

- **NetworkX DiGraph** (in-memory): Graph traversal, neighbor expansion, subgraph extraction for the visualization. NetworkX lets us express complex graph operations (BFS, shortest path, connected components) in pure Python with no external service.
- **SQLite** (persistent): The LLM generates SQL queries against structured tables. SQL is far more reliable and verifiable than a graph query language — the LLM can construct valid `SELECT` statements that return precise, auditable results. This also means no graph database server to set up or manage.

**Tradeoff**: For very large datasets (millions of nodes), a dedicated graph DB like Neo4j would be faster for deep traversals. For this scale (thousands to low tens-of-thousands of records), NetworkX in memory is adequate and zero-dependency.

### 2. LLM Integration: Groq + LLaMA 3.3 70B

**Why Groq?**
- Fastest free inference available (~300 tokens/sec vs ~30 for OpenAI free tier).
- LLaMA 3.3 70B has strong SQL generation capability.
- Free tier is sufficient for demo usage.

**Two-model pipeline**:
- Pre-check: `llama-3.1-8b-instant` (fast, cheap) classifies whether the question is O2C-related.
- Main: `llama-3.3-70b-versatile` generates SQL and formulates the natural language answer.

**NL → SQL strategy**:
The system prompt includes the full schema (table names, column names, sample values, and foreign key relationships). The LLM is instructed to output SQL in `<SQL>...</SQL>` tags, which is parsed and validated before execution. Only `SELECT` statements are allowed.

### 3. Guardrails (two-layer)

| Layer | Method | Handles |
|---|---|---|
| Pre-check | Fast 8b model, YES/NO classification | Obvious off-topic (coding, weather, opinion) |
| System prompt | `OFF_TOPIC` keyword instruction | Domain boundary enforcement |
| SQL validation | Regex: only `SELECT` allowed | Injection / destructive SQL |

When either guardrail triggers, the user receives a polite redirect message rather than an error.

### 4. Graph Modeling

**Entities (nodes)**:
- SalesOrder, SalesOrderItem
- Delivery, DeliveryItem
- BillingDoc, BillingItem
- JournalEntry
- Customer, Material, Payment

**Relationships (directed edges)**:
- `SalesOrderItem → SalesOrder` (ITEM_OF)
- `Delivery → SalesOrder` (DELIVERS)
- `BillingDoc → SalesOrder` (BILLED_FROM)
- `JournalEntry → BillingDoc` (JOURNAL_FOR)
- etc. (12 total relationship types)

**Why directed?** The O2C flow is naturally directional: an order triggers delivery, which triggers billing, which triggers journal entries. Directed edges make it easy to traverse the flow forward or backward.

### 5. Streaming

Chat responses stream via Server-Sent Events (SSE). The backend yields tokens as they arrive from Groq. A `__META__` prefix carries SQL metadata (the generated query + row count) so the frontend can display the collapsible SQL disclosure without waiting for the full response.

---

## Project Structure

```
context-graph/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, CORS
│   ├── requirements.txt
│   ├── .env.example
│   ├── data/                    # ← Place dataset CSV/Excel files here
│   ├── routes/
│   │   ├── graph.py             # Graph visualization API
│   │   └── chat.py              # LLM chat API (streaming)
│   └── services/
│       ├── graph_builder.py     # NetworkX + SQLite ingestion
│       └── llm_service.py       # Groq NL→SQL pipeline + guardrails
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx              # Layout: header, graph, chat panel
        ├── index.css            # Design system (dark theme)
        └── components/
            ├── GraphCanvas.jsx  # React Flow with expand-on-click
            ├── EntityNode.jsx   # Typed, colored node component
            ├── NodeInspector.jsx # Slide-in metadata sidebar
            └── ChatPanel.jsx    # Streaming chat with SQL disclosure
```

---

## Setup & Running

### Prerequisites
- Python 3.11+
- Node.js 18+
- A free [Groq API key](https://console.groq.com)

### 1. Dataset

Place the dataset files in `backend/data/`. The system expects files named:

```
backend/data/
├── sales_orders.csv          (or .xlsx)
├── sales_order_items.csv
├── deliveries.csv
├── delivery_items.csv
├── billing_documents.csv
├── billing_items.csv
├── journal_entries.csv
├── customers.csv
├── materials.csv
└── payments.csv              (optional)
```

If files are missing, the app runs with built-in sample data so you can explore the UI.

**Single Excel workbook**: If the dataset is one `.xlsx` file with multiple sheets, name the sheets to match the table names above (case-insensitive, spaces → underscores). The loader will auto-detect sheets.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### 4. Production Build

```bash
cd frontend
npm run build
# Then just run the backend — it serves the built frontend
cd ../backend
uvicorn main:app --port 8000
# Open http://localhost:8000
```

---

## Example Queries

These are tested and work with the full dataset:

```
Which products are associated with the highest number of billing documents?
Trace the full flow of billing document 90000001
Show sales orders that were delivered but not billed
Which customers have the highest total order value?
Find journal entries linked to billing documents in April 2025
How many deliveries are there per sales order on average?
Show all billing documents with negative amounts (credit memos)
Which materials appear most frequently in sales order items?
```

---

## Guardrail Examples

| Query | Response |
|---|---|
| "What is the capital of France?" | Off-topic redirect |
| "Write me a poem" | Off-topic redirect |
| "What's 2+2?" | Off-topic redirect |
| "Who are the top customers?" | ✅ Answered with data |
| "Explain this code" | Off-topic redirect |

---

## Evaluation Criteria Alignment

| Area | Implementation |
|---|---|
| Code quality | Typed services, clear separation of routes/services, singleton pattern for graph builder |
| Graph modelling | 10 entity types, 12 directed relationship types, realistic O2C flow |
| Database choice | SQLite (SQL queries) + NetworkX (graph traversal) — each used for its strength |
| LLM integration | Schema-grounded prompting, SQL in tags, two-step pipeline, streaming |
| Guardrails | Two-layer: fast model pre-check + system prompt + SQL validation |

---

## Bonus Features Implemented

- ✅ Natural language → SQL translation (with SQL disclosure in UI)
- ✅ Streaming responses (SSE)
- ✅ Conversation memory (last 3 turns sent as context)
- ✅ Node expansion (click any node → fetch and render neighbors)
- ✅ Graph search (search by entity ID or label)
- ✅ Graph statistics panel (node/edge counts by type)
