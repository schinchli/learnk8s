-- EKS Course Knowledge Base
-- Run once in Supabase SQL Editor or via: supabase db push

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Knowledge chunks table
create table if not exists eks_knowledge (
  id           uuid    default gen_random_uuid() primary key,
  module       text    not null,          -- '02' … '09'
  module_title text,
  source_type  text    not null,          -- 'slide' | 'flashcard' | 'notes'
  topic        text,
  title        text,
  content      text    not null,
  embedding    vector(1536),
  metadata     jsonb   default '{}'::jsonb,
  created_at   timestamptz default now()
);

-- 3. HNSW index for fast cosine similarity
create index if not exists eks_knowledge_embedding_idx
  on eks_knowledge using hnsw (embedding vector_cosine_ops);

create index if not exists eks_knowledge_module_idx
  on eks_knowledge (module);

create index if not exists eks_knowledge_source_idx
  on eks_knowledge (source_type);

-- 4. Similarity search function
create or replace function eks_search(
  query_embedding  vector(1536),
  match_count      int     default 8,
  filter_module    text    default null,
  filter_source    text    default null,
  min_similarity   float   default 0.30
)
returns table (
  id           uuid,
  module       text,
  module_title text,
  source_type  text,
  topic        text,
  title        text,
  content      text,
  metadata     jsonb,
  similarity   float
)
language plpgsql
as $$
begin
  return query
  select
    ek.id,
    ek.module,
    ek.module_title,
    ek.source_type,
    ek.topic,
    ek.title,
    ek.content,
    ek.metadata,
    1 - (ek.embedding <=> query_embedding) as similarity
  from eks_knowledge ek
  where
    (filter_module is null or ek.module = filter_module)
    and (filter_source is null or ek.source_type = filter_source)
    and (1 - (ek.embedding <=> query_embedding)) >= min_similarity
  order by ek.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 5. Row-level security
alter table eks_knowledge enable row level security;

-- Public read (flashcards are study content, not sensitive)
drop policy if exists "Public read eks_knowledge" on eks_knowledge;
create policy "Public read eks_knowledge"
  on eks_knowledge for select to anon
  using (true);

-- Service role full access for ingestion
drop policy if exists "Service role full access" on eks_knowledge;
create policy "Service role full access"
  on eks_knowledge for all to service_role
  using (true)
  with check (true);
