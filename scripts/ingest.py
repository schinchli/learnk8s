#!/usr/bin/env python3
"""
EKS Course Knowledge Ingestion Pipeline
Parses PPTX slides + notes.md + flashcard HTML → chunks → embeddings → Supabase pgvector

Usage:
  python3 scripts/ingest.py              # ingest everything
  python3 scripts/ingest.py --source slides
  python3 scripts/ingest.py --source notes
  python3 scripts/ingest.py --source flashcards
  python3 scripts/ingest.py --module 09     # single module
  python3 scripts/ingest.py --clear         # wipe table first

Requirements:
  pip3 install --user openai python-pptx supabase
"""

import os, sys, json, re, time, argparse
from pathlib import Path
from html.parser import HTMLParser
from pptx import Presentation
from openai import OpenAI
from supabase import create_client

# ── Config ─────────────────────────────────────────────────────────
REPO_ROOT     = Path(__file__).parent.parent
PPTX_BASE     = Path('/Users/schinchli/Downloads/200-COREKS-22-EN-PPTX.2.2.3-20260417145107 2/')
FLASHCARDS    = REPO_ROOT / 'course-flashcards'
EMBED_MODEL   = 'text-embedding-3-small'
EMBED_DIMS    = 1536

MODULE_TITLES = {
    '01': 'Kubernetes Fundamentals',
    '02': 'Amazon EKS Fundamentals',
    '03': 'Building and Maintaining an Amazon EKS Cluster',
    '04': 'Deploying Applications to Your Amazon EKS Cluster',
    '05': 'Managing Applications at Scale in Amazon EKS',
    '06': 'Managing Networking in Amazon EKS',
    '07': 'Configuring Observability in an Amazon EKS Cluster',
    '08': 'Managing Storage in Amazon EKS',
    '09': 'Managing Security in Amazon EKS',
}

PPTX_FILES = {
    '02': '02_AmazonEKSFundamentals_InstructorDeck.pptx',
    '03': '03_BuildingandMaintaininganAmazonEKSCluster_InstructorDeck.pptx',
    '04': '04_DeployingApplicationstoyourEKSCluster_InstructorDeck.pptx',
    '05': '05_ManagingApplicationsatScaleinAmazonEKS_InstructorDeck.pptx',
    '06': '06_ManagingNetworkinginAmazonEKS_InstructorDeck.pptx',
    '07': '07_ConfiguringObservabilityinanAmazonEKSCluster_InstructorDeck.pptx',
    '08': '08_ManagingStorageinAmazonEKS_InstructorDeck.pptx',
    '09': '09_ManagingSecurityinAmazonEKS_InstructorDeck.pptx',
}

# ── Clients ─────────────────────────────────────────────────────────
def get_clients():
    url   = os.environ.get('SUPABASE_URL')
    key   = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    okey  = os.environ.get('OPENAI_API_KEY')
    if not url  : raise RuntimeError('SUPABASE_URL not set')
    if not key  : raise RuntimeError('SUPABASE_SERVICE_ROLE_KEY not set')
    if not okey : raise RuntimeError('OPENAI_API_KEY not set')
    return OpenAI(api_key=okey), create_client(url, key)

# ── Embedding helpers ────────────────────────────────────────────────
def embed_batch(openai_client, texts: list[str]) -> list[list[float]]:
    """Embed up to 100 texts per call, with retry."""
    results = []
    for i in range(0, len(texts), 50):
        batch = [t[:8000] for t in texts[i:i+50]]  # truncate to token limit
        for attempt in range(3):
            try:
                resp = openai_client.embeddings.create(model=EMBED_MODEL, input=batch)
                results.extend([d.embedding for d in resp.data])
                time.sleep(0.25)
                break
            except Exception as e:
                if attempt == 2: raise
                print(f'    retrying embed ({e})...')
                time.sleep(2 ** attempt)
    return results

def upsert_chunks(sb, chunks: list[dict], openai_client) -> int:
    if not chunks:
        return 0
    texts = [c['content'] for c in chunks]
    print(f'  embedding {len(texts)} chunks...')
    embeddings = embed_batch(openai_client, texts)

    rows = []
    for chunk, emb in zip(chunks, embeddings):
        rows.append({
            'module':       chunk['module'],
            'module_title': chunk.get('module_title', ''),
            'source_type':  chunk['source_type'],
            'topic':        chunk.get('topic'),
            'title':        (chunk.get('title') or '')[:500],
            'content':      chunk['content'][:4000],
            'embedding':    emb,
            'metadata':     chunk.get('metadata', {}),
        })

    inserted = 0
    for i in range(0, len(rows), 50):
        sb.table('eks_knowledge').insert(rows[i:i+50]).execute()
        inserted += len(rows[i:i+50])
    return inserted

# ── Source 1: PPTX slides ────────────────────────────────────────────
def ingest_slides(openai_client, sb, only_module=None) -> int:
    total = 0
    modules = {only_module: PPTX_FILES[only_module]} if only_module else PPTX_FILES

    for mod, fname in modules.items():
        path = PPTX_BASE / fname
        if not path.exists():
            print(f'  [skip] {fname} — not found at {path}')
            continue

        prs = Presentation(str(path))
        mod_title = MODULE_TITLES.get(mod, '')
        chunks = []
        current_topic = mod_title

        for slide_idx, slide in enumerate(prs.slides):
            texts = [
                s.text.strip()
                for s in slide.shapes
                if hasattr(s, 'text') and s.text.strip()
            ]
            if not texts:
                continue

            # Section divider slides (only 1-2 short text elements)
            if len(texts) <= 2 and all(len(t) < 80 for t in texts):
                candidate = texts[0].replace('\n', ' ').strip()
                if candidate and 'running containers' not in candidate.lower():
                    current_topic = candidate
                continue

            slide_num = slide_idx + 1
            title = texts[0].replace('\x0b', ' ').replace('\n', ' ').strip()
            body  = '\n'.join(texts[1:]).replace('\x0b', '\n')

            # Update topic from title keywords
            if 'knowledge check' in title.lower():
                current_topic = 'Knowledge Check'
            elif 'module summary' in title.lower():
                current_topic = 'Module Summary'
            elif 'lab ' in title.lower():
                current_topic = 'Lab Exercise'

            content = f"{title}\n\n{body}".strip()
            chunks.append({
                'module':       mod,
                'module_title': mod_title,
                'source_type':  'slide',
                'topic':        current_topic,
                'title':        title[:500],
                'content':      content,
                'metadata':     {'slide': slide_num, 'pptx': fname},
            })

        n = upsert_chunks(sb, chunks, openai_client)
        print(f'  Module {mod} slides: {n} chunks upserted')
        total += n

    return total


# ── Source 2: notes.md sections ───────────────────────────────────────
def ingest_notes(openai_client, sb, only_module=None) -> int:
    total = 0
    modules = [only_module] if only_module else ['02','03','04','05','06','07','08','09']

    for mod in modules:
        path = FLASHCARDS / f'module-{mod}' / 'notes.md'
        if not path.exists():
            continue

        text = path.read_text(encoding='utf-8')
        mod_title = MODULE_TITLES.get(mod, '')
        chunks = []

        # Split on ## level headers
        sections = re.split(r'\n(?=## )', text)
        for section in sections:
            section = section.strip()
            if not section or len(section) < 60:
                continue

            lines = section.split('\n')
            raw_title = lines[0].lstrip('#').strip()
            body = '\n'.join(lines[1:]).strip()
            if not body:
                continue

            # Further split very long sections on ### headers
            subsections = re.split(r'\n(?=### )', body)
            for sub in subsections:
                sub = sub.strip()
                if not sub or len(sub) < 40:
                    continue
                sub_lines = sub.split('\n')
                sub_title = sub_lines[0].lstrip('#').strip() if sub_lines[0].startswith('#') else raw_title
                sub_body = '\n'.join(sub_lines[1:]).strip() if sub_lines[0].startswith('#') else sub

                content = f"Study notes — {raw_title}: {sub_title}\n\n{sub_body}"
                chunks.append({
                    'module':       mod,
                    'module_title': mod_title,
                    'source_type':  'notes',
                    'topic':        raw_title[:120],
                    'title':        sub_title[:500],
                    'content':      content,
                    'metadata':     {'section': raw_title},
                })

        n = upsert_chunks(sb, chunks, openai_client)
        print(f'  Module {mod} notes: {n} chunks upserted')
        total += n

    return total


# ── Source 3: Flashcard Q&A ───────────────────────────────────────────
class _FlashcardParser(HTMLParser):
    """Extract (question, answer) pairs from the flashcard HTML."""
    def __init__(self):
        super().__init__()
        self._in_q = self._in_a = False
        self._depth_q = self._depth_a = 0
        self._q = self._a = ''
        self._tag_stack = []
        self.cards: list[tuple[str,str]] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get('class', '')
        self._tag_stack.append((tag, cls))
        if tag == 'div' and cls == 'q':
            self._in_q = True; self._depth_q = len(self._tag_stack)
        elif tag == 'div' and cls == 'a':
            self._in_a = True; self._depth_a = len(self._tag_stack)

    def handle_endtag(self, tag):
        if self._tag_stack:
            self._tag_stack.pop()
        if self._in_q and len(self._tag_stack) < self._depth_q:
            self._in_q = False
        if self._in_a and len(self._tag_stack) < self._depth_a:
            self._in_a = False
            if self._q.strip() and self._a.strip():
                self.cards.append((self._q.strip(), self._a.strip()))
            self._q = self._a = ''

    def handle_data(self, data):
        if self._in_q: self._q += data
        elif self._in_a: self._a += data


def ingest_flashcards(openai_client, sb, only_module=None) -> int:
    total = 0
    modules = [only_module] if only_module else ['02','03','04','05','06','07','08','09']

    for mod in modules:
        path = FLASHCARDS / f'module-{mod}' / 'index.html'
        if not path.exists():
            continue

        parser = _FlashcardParser()
        parser.feed(path.read_text(encoding='utf-8'))

        mod_title = MODULE_TITLES.get(mod, '')
        chunks = []
        for q, a in parser.cards:
            # Clean HTML entities from extracted text
            q = re.sub(r'&[a-z]+;', ' ', q).strip()
            a = re.sub(r'&[a-z]+;', ' ', a).strip()
            if not q or not a:
                continue
            content = f"Q: {q}\n\nA: {a}"
            chunks.append({
                'module':       mod,
                'module_title': mod_title,
                'source_type':  'flashcard',
                'topic':        None,
                'title':        q[:500],
                'content':      content,
                'metadata':     {},
            })

        n = upsert_chunks(sb, chunks, openai_client)
        print(f'  Module {mod} flashcards: {n} chunks upserted')
        total += n

    return total


# ── CLI ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='Ingest EKS course content into Supabase pgvector')
    ap.add_argument('--source',  choices=['slides','notes','flashcards'], help='Only ingest one source type')
    ap.add_argument('--module',  help='Only ingest one module (e.g. 09)')
    ap.add_argument('--clear',   action='store_true', help='Delete all rows before ingesting')
    ap.add_argument('--env',     default='.env.local', help='Path to .env file')
    args = ap.parse_args()

    # Load .env if present
    env_path = REPO_ROOT / args.env
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    openai_client, sb = get_clients()

    if args.clear:
        print('⚠ Clearing eks_knowledge table...')
        sb.table('eks_knowledge').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print('  cleared.')

    total = 0
    sources = [args.source] if args.source else ['slides', 'notes', 'flashcards']

    for source in sources:
        print(f'\n── {source.upper()} ──')
        if source == 'slides':
            total += ingest_slides(openai_client, sb, args.module)
        elif source == 'notes':
            total += ingest_notes(openai_client, sb, args.module)
        elif source == 'flashcards':
            total += ingest_flashcards(openai_client, sb, args.module)

    print(f'\n✓ Done — {total} total chunks upserted')


if __name__ == '__main__':
    main()
