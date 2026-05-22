/**
 * POST /api/ask  { question, module?, source?, stream? }
 *
 * RAG pipeline: embed question → retrieve top-k chunks → GPT-4o-mini → answer + sources
 */
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM = `You are an expert instructor for the AWS course "Running Containers on Amazon EKS" (course code 200-COREKS).
Your job: answer the student's question using ONLY the numbered course excerpts provided.

Rules:
- Be concise, precise, technically accurate.
- Use bullet points or numbered lists when listing multiple items.
- Cite sources by number, e.g. [1] or [2,3], when you use them.
- If the answer is not in the provided excerpts, say: "This isn't covered in the provided content."
- Never invent AWS service names, pricing, or behaviour.`

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { question, module: filterModule, source: filterSource } = req.body || {}
  if (!question?.trim()) {
    return res.status(400).json({ error: '`question` is required' })
  }

  try {
    // 1. Embed question
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question.slice(0, 8000),
    })
    const embedding = embRes.data[0].embedding

    // 2. Retrieve context — pull slightly more so we can rank by source type
    const { data: raw, error } = await supabase.rpc('eks_search', {
      query_embedding: embedding,
      match_count:     10,
      filter_module:   filterModule || null,
      filter_source:   filterSource || null,
    })
    if (error) throw new Error(error.message)

    // De-duplicate very similar content (same title, different source type) — keep highest sim
    const seen = new Set()
    const chunks = raw.filter(r => {
      const key = `${r.module}:${r.title?.slice(0, 60)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)

    if (!chunks.length) {
      return res.json({
        question,
        answer: "I couldn't find relevant content in the course material for that question.",
        sources: [],
      })
    }

    // 3. Build context block
    const context = chunks
      .map((c, i) =>
        `[${i + 1}] Module ${c.module} (${c.module_title}) — ${c.source_type}` +
        (c.topic ? ` — ${c.topic}` : '') +
        `\n${c.content}`
      )
      .join('\n\n---\n\n')

    // 4. Call GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Course excerpts:\n\n${context}\n\n---\n\nStudent question: ${question}`,
        },
      ],
    })

    const answer = completion.choices[0].message.content

    return res.json({
      question,
      answer,
      sources: chunks.map(c => ({
        module:       c.module,
        module_title: c.module_title,
        source_type:  c.source_type,
        topic:        c.topic,
        title:        c.title,
        similarity:   Math.round(c.similarity * 1000) / 1000,
      })),
      usage: completion.usage,
    })
  } catch (err) {
    console.error('[ask]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
