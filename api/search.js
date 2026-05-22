/**
 * GET /api/search?q=<query>[&module=02][&source=flashcard][&limit=8]
 * POST /api/search  { query, module?, source?, limit? }
 *
 * Returns the top-k semantically similar chunks from Supabase pgvector.
 */
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = req.body || {}
  const query        = req.query.q      || body.query  || ''
  const filterModule = req.query.module || body.module || null
  const filterSource = req.query.source || body.source || null
  const limit        = Math.min(parseInt(req.query.limit || body.limit || '8'), 20)

  if (!query.trim()) {
    return res.status(400).json({ error: '`q` query param is required' })
  }

  try {
    // 1. Embed the query
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.slice(0, 8000),
    })
    const embedding = embRes.data[0].embedding

    // 2. Similarity search in Supabase
    const { data, error } = await supabase.rpc('eks_search', {
      query_embedding: embedding,
      match_count:     limit,
      filter_module:   filterModule,
      filter_source:   filterSource,
    })
    if (error) throw new Error(error.message)

    // 3. Shape response
    return res.json({
      query,
      count: data.length,
      results: data.map(r => ({
        id:           r.id,
        module:       r.module,
        module_title: r.module_title,
        source_type:  r.source_type,
        topic:        r.topic,
        title:        r.title,
        content:      r.content,
        similarity:   Math.round(r.similarity * 1000) / 1000,
      })),
    })
  } catch (err) {
    console.error('[search]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
