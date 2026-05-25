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
Embed a pre-generated JSON file and store in Supabase.
Usage:
  OPENAI_API_KEY=sk-... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    python3 scripts/embed_generated.py --file scripts/generated_module_01.json

  Also supports --all to embed all generated_module_*.json files.
"""
import os, sys, json, time, argparse
from pathlib import Path

REPO_ROOT   = Path(__file__).parent.parent
EMBED_MODEL = 'text-embedding-3-small'

def get_clients():
    for k in ('OPENAI_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'):
        if not os.environ.get(k): sys.exit(f'Missing {k}')
    from openai import OpenAI
    from supabase import create_client
    return (
        OpenAI(api_key=os.environ['OPENAI_API_KEY']),
        create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    )

def embed_and_store(oai, sb, chunks):
    texts = [c['content'] for c in chunks]
    print(f'  Embedding {len(texts)} chunks...')
    embeddings = []
    for i in range(0, len(texts), 50):
        batch = [t[:8000] for t in texts[i:i+50]]
        for attempt in range(3):
            try:
                resp = oai.embeddings.create(model=EMBED_MODEL, input=batch)
                embeddings.extend([d.embedding for d in resp.data])
                done = min(i+50, len(texts))
                print(f'\r  [{done*100//len(texts):3d}%] {done}/{len(texts)}', end='', flush=True)
                time.sleep(0.15); break
            except Exception as e:
                if attempt==2: raise
                time.sleep(2**attempt)
    print()
    rows = [{**c, 'embedding': emb, 'metadata': c.get('metadata',{})} for c, emb in zip(chunks, embeddings)]
    print(f'  Storing {len(rows)} rows...')
    for i in range(0, len(rows), 50):
        sb.table('eks_knowledge').insert(rows[i:i+50]).execute()
    return len(rows)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file',  help='Path to generated JSON file')
    ap.add_argument('--all',   action='store_true', help='Embed all generated_module_*.json files')
    ap.add_argument('--env',   default='.env.local')
    args = ap.parse_args()

    env_path = REPO_ROOT / args.env
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    oai, sb = get_clients()
    files = []
    if args.all:
        files = sorted((REPO_ROOT/'scripts').glob('generated_module_*.json'))
    elif args.file:
        files = [Path(args.file)]
    else:
        sys.exit('Provide --file or --all')

    total = 0
    for f in files:
        chunks = json.loads(f.read_text())
        mod = chunks[0].get('module','?') if chunks else '?'
        types = set(c['source_type'] for c in chunks)
        print(f'\n{f.name}  (module {mod}, {len(chunks)} chunks: {", ".join(sorted(types))})')
        n = embed_and_store(oai, sb, chunks)
        total += n
        print(f'  ✓ {n} stored')

    print(f'\n✓ Total: {total} chunks embedded and stored')

    # Show updated Supabase counts
    print('\nUpdated eks_knowledge counts:')
    res = sb.table('eks_knowledge').select('source_type', count='exact').execute()
    # Group manually
    rows = sb.rpc('exec_counts', {}).execute().data if False else None
    print('  (run: select source_type, count(*) from eks_knowledge group by source_type)')

if __name__ == '__main__':
    main()
