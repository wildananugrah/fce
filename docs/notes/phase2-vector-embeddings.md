# Phase 2: Vector Embeddings for Product/Brand References

**Status:** Planned (not yet implemented)
**Priority:** Implement when users start uploading larger/multiple documents and need better reference quality

## Why

Phase 1 (current) injects the first ~5000 characters of reference chunks into AI prompts. This is blind selection — it takes chunks in order, not by relevance. For small references it works, but for large PDFs or many documents, the AI gets irrelevant context (e.g., table of contents instead of the useful content about the topic being generated).

Vector embeddings solve this by finding the most **semantically relevant** chunks for each generation request.

## What to Implement

1. **pgvector extension** — enable in PostgreSQL (`CREATE EXTENSION vector`)
2. **Embedding model** — use Google Gemini's embedding API or OpenAI's `text-embedding-3-small`
3. **Schema change** — add `embedding` vector column to `DocumentChunk` table
4. **Embedding pipeline** — after text extraction, generate embeddings for each chunk (async job)
5. **Retrieval at generation time** — embed the user's prompt/topic, find top-K most similar chunks via cosine similarity
6. **Replace blind selection** — instead of `LIMIT by char count`, use `ORDER BY embedding <=> query_embedding LIMIT K`

## Architecture

```
Document uploaded → Text extracted → Chunks created → Embedding job generates vectors
                                                           ↓
User generates content → User prompt embedded → Top-K similar chunks retrieved → Injected as context
```

## Dependencies

- `pgvector` PostgreSQL extension
- Embedding model API (Gemini `text-embedding-004` or OpenAI `text-embedding-3-small`)
- Prisma pgvector support (or raw SQL queries for vector operations)

## Cost Estimate

- Embedding: ~$0.02 per 1M tokens (text-embedding-3-small)
- Storage: minimal (1536-dimensional float vector per chunk)
- Query: one embedding call per generation request

## When to Start

- When users upload 3+ documents per product/brand
- When generation quality doesn't reflect reference content well
- When users report "the AI isn't using my uploaded materials"
