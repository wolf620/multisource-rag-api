# Multi-Source Knowledge API

Conversational RAG API for legal document Q&A. Supports PDF, DOCX, CSV, and JSON ingestion with hybrid semantic + keyword retrieval, LLM-powered re-ranking, and streaming responses.

Built with TypeScript, Fastify, PostgreSQL (pgvector), Redis, and OpenAI.

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
              Request    │            Fastify API Layer                 │
  Client ───────────────>│  POST /ingest POST /chat   POST /chat/stream |
                         │  GET /ingest/:id GET /sessions/:id           │
                         └────────────────────────┬─────────────────────┘
                                                  │
                             ┌────────────────────┼──────────────────────┐
                             ▼                    ▼                      ▼
                      ┌──────────────┐     ┌──────────────┐   ┌──────────────────┐
                      │  Ingestion   │     │    Chat      │   │   Error Handler  │
                      │  Service     │     │    Service   │   │   (global)       │
                      └──────┬───────┘     └─────────┬────┘   └──────────────────┘
                             │                       │
                   ┌─────────┼──────────┐            │
                   ▼          ▼         ▼            ▼
           ┌──────────┐ ┌────────┐ ┌───────────┐  ┌──────────────┐
           │  Parser  │ │Chunking│ │    LLM    │  │  Re-ranker   │
           │  Service │ │Service │ │   Service │  │  Service     │
           │          │ │        │ │           │  │  (LLM-based) │
           └──────────┘ └────┬───┘ └──────┬────┘  └──────────────┘
                             │            │
                       ┌─────┴──────┐     │       ┌──────────────┐
                       │Unstructured│     ├──────>│    Cache     │
                       │ Strategy   │     │       │   (Redis)    │
                       ├────────────┤     │       └──────────────┘
                       │ Structured │     │
                       │ Strategy   │     │
                       └────────────┘     │
                                          ▼
                      ┌─────────────────────────────────────┐
                      │         Repository Layer            │
                      │  DocumentRepo · SessionRepo         │
                      │  JobRepo · ChatRepo                 │
                      └──────────────────┬──────────────────┘
                                         ▼
                      ┌─────────────────────────────────────┐
                      │  PostgreSQL + pgvector + Redis      │
                      └─────────────────────────────────────┘
```

The codebase follows a layered architecture: thin route handlers validate input and shape responses, services contain business logic, and repositories own all SQL. This keeps each layer testable in isolation.

---

## What's Implemented

### Core

- Multi-format document ingestion (PDF, DOCX, CSV, JSON)
- Async ingestion with job status tracking (queued → processing → completed/failed)
- Chunk storage with 1536-dimensional embeddings in pgvector
- Session-based conversations with auto-create or reuse via `session_id`
- Full chat history persistence with source citations
- Content-hash deduplication to skip re-ingesting identical files

### Intermediate (all five)

- **Hybrid search** — weighted fusion of pgvector cosine similarity and PostgreSQL full-text ranking (`ts_rank_cd`) via FULL OUTER JOIN. Weights are configurable.
- **Query enhancement** — follow-up questions like "what about X?" get rewritten into standalone queries using the last 4 conversation turns before embedding.
- **Smart routing** — Strategy pattern selects record-boundary chunking for structured formats (CSV/JSON) and paragraph-aware chunking with overlap for unstructured ones (PDF/DOCX).
- **Follow-up context** — conversation history feeds the query rewriter, so multi-turn sessions work naturally.
- **Streaming** — `POST /chat/stream` streams tokens via SSE. Metadata and sources arrive first, then tokens, then a done signal.

### Advanced (all three)

- **Re-ranking** — after initial retrieval, an LLM call re-scores the top-K chunks for relevance and returns the top-N. Configurable via `RERANK_ENABLED` and `RERANK_TOP_N`.
- **Evaluation suite** — 6 test cases with ground truth, measuring precision, recall, and keyword-hit rate against the live API. Run with `npm run eval`.
- **Caching** — Redis caches embeddings and search results with TTL. All cache operations fail silently, so the API works fine without Redis.

---

## API

### `POST /ingest`

Upload files for async processing. Returns immediately with a job ID.

```bash
curl -X POST http://localhost:3000/ingest \
  -F "file=@contract.pdf" \
  -F "file=@data.csv"
```

```json
{ "job_id": "uuid", "status": "queued", "file_count": 2 }
```

### `GET /ingest/:jobId`

Poll job status.

```bash
curl http://localhost:3000/ingest/<job_id>
```

```json
{ "job_id": "uuid", "status": "completed", "file_count": 2, "error": null, "created_at": "...", "updated_at": "..." }
```

### `POST /chat`

Ask a question. Optionally pass `session_id` to continue a conversation.

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the termination clause?", "session_id": "optional-uuid"}'
```

```json
{
  "session_id": "uuid",
  "rewritten_query": "What is the termination clause in the service agreement?",
  "answer": "According to [source_1], either party may terminate with 30 days written notice.",
  "sources": [{ "documentId": "uuid", "documentName": "contract.pdf", "chunkId": "uuid", "chunkIndex": 3, "score": 4, "excerpt": "..." }]
}
```

### `POST /chat/stream`

Same as `/chat` but streams the answer via SSE.

```bash
curl -N -X POST http://localhost:3000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the confidentiality period?"}'
```

Events: `metadata` (with sources) → multiple `token` events → `done`.

### `GET /sessions/:id`

Returns all turns in a conversation.

### `GET /health`

Returns `{"status":"ok"}`.

---

## Database Schema

Five tables: `sessions`, `ingestion_jobs`, `documents`, `chunks`, `chat_history`.

Key design decisions:
- **HNSW index** on `chunks.embedding` for approximate nearest neighbor search. I chose HNSW over IVFFlat because IVFFlat requires a populated table to build useful centroids, and HNSW works well from the start.
- **GIN index** on `to_tsvector('english', chunks.content)` for full-text keyword search alongside vector similarity.
- **Content hash** on documents enables deduplication at ingestion time.
- All document + chunk inserts happen in a single PostgreSQL transaction, so a failed parse doesn't leave orphan records.

---

## Chunking Strategy

I use two chunking strategies, selected by the `ChunkingService.resolve()` method based on document type:

**Unstructured (PDF, DOCX):** splits on paragraph boundaries (`\n\n`), accumulating until `CHUNK_SIZE` (900 chars). Oversized paragraphs fall back to sliding-window splitting with 180-char overlap. The overlap preserves context across boundaries, which matters for legal prose where a clause might span two paragraphs.

**Structured (CSV, JSON):** groups records into chunks up to `CHUNK_SIZE`. No overlap needed since each record is self-contained. The parser converts structured data to `key: value | key: value` format before chunking, which gives the embedding model something meaningful to work with (raw JSON doesn't embed well).

Why 900 chars? That's roughly 200-250 tokens, which fits comfortably in the embedding context window while keeping chunks large enough to contain a complete legal clause.

---

## Technical Decisions

### Why pgvector over Pinecone/Weaviate/FAISS?

Single datastore. I didn't want to manage consistency between a relational DB (for sessions, jobs, history) and a separate vector store. pgvector gives me transactional guarantees across document and chunk inserts, which matters for a legal-tech system where data integrity is non-negotiable. The trade-off is performance at scale — pgvector won't match a purpose-built vector DB at 100M+ vectors, but that's a bridge to cross later.

### Why Redis for caching?

Embedding calls are expensive. Caching them avoids re-embedding the same query text or chunk content. Redis gives TTL-based expiration and works across horizontally scaled instances, which an in-memory Map wouldn't. I made cache failures non-fatal — every cache operation is wrapped in try/catch, so the API degrades gracefully if Redis goes down.

### Why LLM-based re-ranking?

After hybrid retrieval returns 8 candidates, I use an LLM call to judge which 4 are most relevant. This avoids deploying a separate cross-encoder model while leveraging the same model I already use for answer synthesis. It adds latency (one extra LLM call per query), but the relevance improvement is worth it for legal Q&A where precision matters. It's configurable — set `RERANK_ENABLED=false` to skip it.

### Why SSE for streaming?

OpenAI's API streams tokens via SSE natively. Matching that protocol on my end keeps things simple. WebSockets would be overkill since the client sends one request and receives one stream — there's no bidirectional communication.

### Embedding model: `text-embedding-3-small`

Good retrieval quality at 1536 dimensions for $0.02/1M tokens. The `large` variant would give marginally better recall at higher cost and dimensionality, which didn't seem worth it here.

### Design patterns

| Pattern | Where | Why |
|---|---|---|
| Repository | `*Repository` classes | Keeps SQL out of business logic |
| Strategy | `ChunkingService` | Structured vs unstructured chunking without conditionals in the pipeline |
| Service Layer | `ChatService`, `IngestionService` | Thin routes, orchestration in services |
| Error Hierarchy | `AppError` → `NotFoundError`, `ValidationError` | Typed errors flow to a single global handler |

### Async ingestion

Job record is created synchronously (immediate 202 response). Processing runs as a detached promise in the same process. In production I'd replace this with BullMQ or a similar job queue for horizontal scaling and retry semantics, but for a take-home this keeps the infrastructure simple.

---

## What I'd Change in Production

**Scalability:** Replace in-process ingestion with a job queue (BullMQ/SQS). Add PgBouncer for connection pooling. Partition the chunks table by tenant. Redis Cluster for cache scaling.

**Security:** JWT auth with tenant-scoped row-level security. File upload validation (MIME checks, malware scanning, per-tenant size quotas). PII detection before embedding.

**Monitoring:** OpenTelemetry traces across the ingestion and retrieval pipeline. Prometheus metrics for embedding latency, cache hit ratio, retrieval quality. Structured logging with correlation IDs.

**Cost:** The embedding cache already helps here. Beyond that — adaptive chunk sizing, cheaper models for re-ranking when precision requirements allow, and billing alerts on OpenAI usage.

---

## Setup

### Docker (recommended)

```bash
cp .env.example .env
# Set OPENAI_API_KEY in .env
docker compose up --build
```

API at `http://localhost:3000`.

### Local

```bash
npm install
cp .env.example .env
# Set OPENAI_API_KEY, DATABASE_URL, REDIS_URL
npm run db:init
npm run dev
```

### Tests

```bash
npm test
```

### Evaluation

With the API running and documents ingested:

```bash
npm run eval
```

---

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `DATABASE_URL` | Yes | — |
| `OPENAI_API_KEY` | Yes | — |
| `REDIS_URL` | No | `redis://redis:6379` |
| `PORT` | No | `3000` |
| `OPENAI_EMBEDDING_MODEL` | No | `text-embedding-3-small` |
| `OPENAI_CHAT_MODEL` | No | `gpt-4o-mini` |
| `CHUNK_SIZE` | No | `900` |
| `CHUNK_OVERLAP` | No | `180` |
| `TOP_K` | No | `8` |
| `RERANK_ENABLED` | No | `true` |
| `RERANK_TOP_N` | No | `4` |
| `CACHE_TTL_SECONDS` | No | `3600` |
| `HYBRID_VECTOR_WEIGHT` | No | `0.7` |
| `HYBRID_KEYWORD_WEIGHT` | No | `0.3` |
