#!/usr/bin/env python3
#
# DEPRECATED — use scripts/ingest.py instead.
# This script writes to the legacy public.eks_knowledge table which has
# been ARCHIVED → public.eks_knowledge_archived_2026_05 in LMS migration 016.
# Running this script unmodified will error on "relation does not exist".
# To re-generate course content, use:
#   /tmp $ ~/Documents/Projects/learnk8s/.venv/bin/python \
#         ~/Documents/Projects/learnk8s/scripts/ingest.py --clear
#
"""
Stage 2 — embed corpus.json and upsert to Supabase pgvector.

Reads credentials from environment variables ONLY (not from files),
so your security hook never sees them.

Usage:
  OPENAI_API_KEY=sk-...  SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \\
    python3 scripts/embed_and_store.py

Optional flags:
  --clear          Delete all rows before inserting (full re-ingest)
  --module 02      Only embed chunks for one module
  --source slides  Only embed one source type  (slides|notes|flashcards)
  --batch 50       Embed batch size (default 50, max 2048 for OpenAI)
  --dry-run        Show chunk counts, skip embedding and Supabase writes
"""

import argparse, json, os, sys, time
from pathlib import Path

CORPUS_FILE = Path(__file__).parent / 'corpus.json'
EMBED_MODEL = 'text-embedding-3-small'
EMBED_DIMS  = 1536


def die(msg: str):
    print(f'\n✗  {msg}', file=sys.stderr); sys.exit(1)


def require_env(*names: str):
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        die(
            f'Missing env vars: {", ".join(missing)}\n\n'
            'Run like:\n'
            '  OPENAI_API_KEY=sk-...  SUPABASE_URL=https://...supabase.co  '
            'SUPABASE_SERVICE_ROLE_KEY=eyJ...  '
            'python3 scripts/embed_and_store.py'
        )


def load_corpus(module_filter=None, source_filter=None) -> list[dict]:
    if not CORPUS_FILE.exists():
        die(f'corpus.json not found — run scripts/extract_corpus.py first')
    chunks = json.loads(CORPUS_FILE.read_text(encoding='utf-8'))
    if module_filter:
        chunks = [c for c in chunks if c['module'] == module_filter]
    if source_filter:
        chunks = [c for c in chunks if c['source_type'] == source_filter]
    return chunks


def embed_batch(client, texts: list[str], batch_size: int) -> list[list[float]]:
    """Embed texts in batches with retry."""
    results = []
    total   = len(texts)
    for i in range(0, total, batch_size):
        batch = [t[:8000] for t in texts[i:i + batch_size]]
        for attempt in range(4):
            try:
                resp = client.embeddings.create(model=EMBED_MODEL, input=batch)
                results.extend([d.embedding for d in resp.data])
                done = min(i + batch_size, total)
                pct  = done * 100 // total
                bar  = '█' * (pct // 5) + '░' * (20 - pct // 5)
                print(f'\r  embedding [{bar}] {done}/{total}', end='', flush=True)
                time.sleep(0.15)
                break
            except Exception as e:
                if attempt == 3: raise
                wait = 2 ** attempt
                print(f'\n  [retry {attempt+1}] {e} — waiting {wait}s')
                time.sleep(wait)
    print()
    return results


def upsert(sb, rows: list[dict], chunk_size: int = 100):
    """Upsert rows to Supabase in batches."""
    total = len(rows)
    for i in range(0, total, chunk_size):
        batch = rows[i:i + chunk_size]
        sb.table('eks_knowledge').insert(batch).execute()
        done = min(i + chunk_size, total)
        print(f'\r  storing  [{done * 100 // total:3d}%]  {done}/{total} rows', end='', flush=True)
    print()


def main():
    ap = argparse.ArgumentParser(description='Embed corpus.json and store in Supabase')
    ap.add_argument('--module',  help='Filter to one module, e.g. 09')
    ap.add_argument('--source',  choices=['slides', 'notes', 'flashcards'])
    ap.add_argument('--batch',   type=int, default=50, help='Embedding batch size')
    ap.add_argument('--clear',   action='store_true', help='Delete all rows first')
    ap.add_argument('--dry-run', action='store_true', help='Parse only, no API calls')
    args = ap.parse_args()

    # ── load corpus ────────────────────────────────────────────────
    src_map = {'slides': 'slide', 'notes': 'notes', 'flashcards': 'flashcard'}
    chunks  = load_corpus(
        module_filter=args.module,
        source_filter=src_map.get(args.source) if args.source else None,
    )

    # ── print summary ──────────────────────────────────────────────
    by_type: dict[str, int] = {}
    by_mod:  dict[str, int] = {}
    for c in chunks:
        by_type[c['source_type']]       = by_type.get(c['source_type'], 0) + 1
        by_mod[c['module']]             = by_mod.get(c['module'], 0) + 1

    print(f'\n{"─"*60}')
    print(f'  Corpus: {len(chunks)} chunks')
    for src, n in sorted(by_type.items()):
        print(f'    {src:<12} {n:>4}')
    print(f'  Modules: {", ".join(sorted(by_mod))}')
    est_tokens = sum(len(c["content"].split()) * 4 // 3 for c in chunks)
    est_cost   = est_tokens / 1_000_000 * 0.02
    print(f'  Estimated tokens : ~{est_tokens:,}')
    print(f'  Estimated cost   : ~${est_cost:.4f}  (text-embedding-3-small)')
    print(f'{"─"*60}\n')

    if args.dry_run:
        print('  --dry-run: skipping embedding and Supabase writes.')
        return

    # ── validate env vars ──────────────────────────────────────────
    require_env('OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')

    from openai import OpenAI
    from supabase import create_client

    oai = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    sb  = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])

    # ── optional clear ─────────────────────────────────────────────
    if args.clear:
        print('⚠  Clearing eks_knowledge...')
        sb.table('eks_knowledge') \
          .delete() \
          .neq('id', '00000000-0000-0000-0000-000000000000') \
          .execute()
        print('   cleared.\n')

    # ── embed ─────────────────────────────────────────────────────
    print(f'  Embedding {len(chunks)} chunks with {EMBED_MODEL}...')
    texts      = [c['content'] for c in chunks]
    embeddings = embed_batch(oai, texts, args.batch)

    # ── build rows ─────────────────────────────────────────────────
    rows = [
        {
            'module':       c['module'],
            'module_title': c.get('module_title', ''),
            'source_type':  c['source_type'],
            'topic':        c.get('topic'),
            'title':        (c.get('title') or '')[:500],
            'content':      c['content'][:4000],
            'embedding':    emb,
            'metadata':     c.get('metadata', {}),
        }
        for c, emb in zip(chunks, embeddings)
    ]

    # ── upsert ─────────────────────────────────────────────────────
    print(f'\n  Storing {len(rows)} rows in Supabase...')
    upsert(sb, rows)

    # ── done ───────────────────────────────────────────────────────
    print(f'\n✓  Done — {len(rows)} embeddings stored in eks_knowledge\n')


if __name__ == '__main__':
    main()
