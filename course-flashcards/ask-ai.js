/**
 * Ask AI panel — drop into any EKS course page.
 * Reads data-module="02" from the <script> tag (optional).
 * Calls /api/ask with module filter + Claude generation.
 *
 * Usage: <script src="../ask-ai.js" data-module="02"></script>
 * Or lab pages: <script src="ask-ai.js" data-module="03"></script>
 */
(function () {
  const scriptTag = document.currentScript || document.querySelector('script[src*="ask-ai"]');
  const MODULE = scriptTag?.dataset?.module || null;

  // Detect API base: Vercel deployment or localhost dev
  const API_BASE = (() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
    // learnk8s Vercel deployment — update after `vercel --prod`
    return window.location.origin;
  })();

  // ── Inject styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
#ask-ai-btn {
  position:fixed; bottom:22px; right:22px; z-index:9000;
  width:52px; height:52px; border-radius:50%;
  background:linear-gradient(135deg,#38bdf8,#818cf8);
  border:none; cursor:pointer; font-size:1.3em;
  box-shadow:0 4px 20px rgba(56,189,248,.4);
  transition:transform .15s, box-shadow .15s;
  display:flex; align-items:center; justify-content:center;
}
#ask-ai-btn:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(56,189,248,.6); }
#ask-ai-backdrop {
  display:none; position:fixed; inset:0; z-index:9001;
  background:rgba(0,0,0,.6); backdrop-filter:blur(4px);
}
#ask-ai-backdrop.open { display:flex; align-items:center; justify-content:center; }
#ask-ai-modal {
  background:#11151c; border:1px solid #1f2738; border-radius:16px;
  width:min(720px,96vw); max-height:85vh; display:flex; flex-direction:column;
  box-shadow:0 24px 80px rgba(0,0,0,.6);
}
#ask-ai-header {
  padding:16px 20px; border-bottom:1px solid #1f2738;
  display:flex; align-items:center; gap:12px;
}
#ask-ai-header h2 { margin:0; font-size:1em; font-weight:700; color:#f1f5f9; flex:1; }
#ask-ai-header .mod-badge {
  background:rgba(56,189,248,.15); color:#38bdf8; border:1px solid rgba(56,189,248,.3);
  border-radius:6px; padding:2px 9px; font-size:.75em; font-weight:700;
}
#ask-ai-close {
  background:none; border:none; color:#94a3b8; font-size:1.2em;
  cursor:pointer; padding:4px; border-radius:6px; line-height:1;
}
#ask-ai-close:hover { background:rgba(255,255,255,.08); color:#f1f5f9; }
#ask-ai-body { flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
#ask-ai-welcome { text-align:center; color:#475569; padding:20px 0; font-size:.88em; }
#ask-ai-welcome .chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:12px; }
.ai-chip {
  background:#1f2738; border:1px solid #334155; border-radius:20px;
  padding:5px 13px; font-size:.8em; cursor:pointer; color:#94a3b8;
  transition:background .1s, color .1s, border-color .1s;
}
.ai-chip:hover { background:rgba(56,189,248,.1); border-color:#38bdf8; color:#38bdf8; }
.ai-msg { display:flex; gap:9px; align-items:flex-start; }
.ai-msg.user { flex-direction:row-reverse; }
.ai-avatar {
  width:28px; height:28px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:.75em; font-weight:700; margin-top:2px;
}
.ai-msg.user .ai-avatar { background:rgba(56,189,248,.2); color:#38bdf8; }
.ai-msg.bot  .ai-avatar { background:rgba(129,140,248,.2); color:#818cf8; }
.ai-bubble {
  max-width:82%; padding:10px 14px; border-radius:12px;
  font-size:.87em; line-height:1.6; color:#f1f5f9;
}
.ai-msg.user .ai-bubble { background:rgba(56,189,248,.12); border:1px solid rgba(56,189,248,.25); border-radius:12px 12px 0 12px; }
.ai-msg.bot  .ai-bubble { background:#1f2738; border:1px solid #2a3347; border-radius:12px 12px 12px 0; white-space:pre-wrap; }
.ai-sources { margin-top:8px; padding-top:7px; border-top:1px solid #2a3347; display:flex; flex-wrap:wrap; gap:5px; }
.ai-src-chip {
  font-size:.7em; background:#11151c; border:1px solid #2a3347;
  border-radius:16px; padding:2px 9px; color:#64748b;
  display:inline-flex; align-items:center; gap:4px;
}
.ai-src-dot { width:6px; height:6px; border-radius:50%; }
.ai-typing { display:flex; gap:4px; align-items:center; padding:2px 0; }
.ai-typing span { width:7px; height:7px; background:#475569; border-radius:50%; animation:aib 1s infinite; }
.ai-typing span:nth-child(2) { animation-delay:.15s; }
.ai-typing span:nth-child(3) { animation-delay:.3s; }
@keyframes aib { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
#ask-ai-footer { padding:12px 16px; border-top:1px solid #1f2738; display:flex; gap:9px; align-items:flex-end; }
#ask-ai-input {
  flex:1; background:#1f2738; color:#f1f5f9; border:1px solid #334155;
  border-radius:10px; padding:9px 13px; font-size:.88em; resize:none;
  outline:none; font-family:inherit; min-height:42px; max-height:130px; line-height:1.5;
}
#ask-ai-input:focus { border-color:#38bdf8; }
#ask-ai-send {
  background:#38bdf8; color:#06080d; border:none; border-radius:10px;
  padding:9px 16px; font-size:.88em; font-weight:700; cursor:pointer;
  transition:background .12s; white-space:nowrap;
}
#ask-ai-send:hover { background:#7dd3fc; }
#ask-ai-send:disabled { background:#1f2738; color:#475569; cursor:not-allowed; }
`;
  document.head.appendChild(style);

  // ── DOM ────────────────────────────────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
<button id="ask-ai-btn" title="Ask AI about this module">✦</button>
<div id="ask-ai-backdrop">
  <div id="ask-ai-modal">
    <div id="ask-ai-header">
      <h2>✦ Ask AI about this course</h2>
      ${MODULE ? `<span class="mod-badge">Module ${MODULE}</span>` : ''}
      <button id="ask-ai-close" title="Close">✕</button>
    </div>
    <div id="ask-ai-body">
      <div id="ask-ai-welcome">
        <div>Ask anything about the EKS course content — grounded in slides, notes and flashcards.</div>
        <div class="chips">
          ${MODULE ? `<span class="ai-chip" data-q="Summarise the key concepts in module ${MODULE}">📋 Summarise this module</span>` : ''}
          <span class="ai-chip" data-q="What are the most important exam topics I need to remember?">📝 Exam tips</span>
          <span class="ai-chip" data-q="Explain the difference between the control plane and data plane in EKS">Control vs data plane</span>
          <span class="ai-chip" data-q="When should I use Fargate vs EC2 managed node groups?">Fargate vs nodes</span>
          <span class="ai-chip" data-q="How does IRSA work and why is it better than node IAM roles?">IRSA explained</span>
        </div>
      </div>
    </div>
    <div id="ask-ai-footer">
      <textarea id="ask-ai-input" rows="1" placeholder="Ask a question…"></textarea>
      <button id="ask-ai-send">Send</button>
    </div>
  </div>
</div>
`);

  // ── Logic ──────────────────────────────────────────────────────
  const btn       = document.getElementById('ask-ai-btn');
  const backdrop  = document.getElementById('ask-ai-backdrop');
  const closeBtn  = document.getElementById('ask-ai-close');
  const body      = document.getElementById('ask-ai-body');
  const input     = document.getElementById('ask-ai-input');
  const sendBtn   = document.getElementById('ask-ai-send');

  function open()  { backdrop.classList.add('open');    input.focus(); }
  function close() { backdrop.classList.remove('open'); }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  document.querySelectorAll('.ai-chip').forEach(chip =>
    chip.addEventListener('click', () => {
      const q = chip.dataset.q || chip.textContent;
      input.value = q;
      sendMessage();
    })
  );

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 130) + 'px';
  });
  sendBtn.addEventListener('click', sendMessage);

  function srcDotColor(type) {
    return type === 'slide' ? '#38bdf8' : type === 'flashcard' ? '#818cf8' : '#27AE60';
  }

  function addMsg(role, html, sources) {
    document.getElementById('ask-ai-welcome')?.remove();
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'ai-avatar';
    avatar.textContent = role === 'user' ? 'You' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    bubble.innerHTML = html;

    if (sources?.length) {
      const row = document.createElement('div');
      row.className = 'ai-sources';
      sources.slice(0, 4).forEach(s => {
        const chip = document.createElement('span');
        chip.className = 'ai-src-chip';
        chip.innerHTML = `<span class="ai-src-dot" style="background:${srcDotColor(s.source_type)}"></span>M${s.module} · ${s.source_type} · ${(s.similarity * 100).toFixed(0)}%`;
        row.appendChild(chip);
      });
      bubble.appendChild(row);
    }

    div.appendChild(avatar); div.appendChild(bubble);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  function addTyping() {
    const div = document.createElement('div');
    div.className = 'ai-msg bot'; div.id = 'ai-typing';
    div.innerHTML = '<div class="ai-avatar">AI</div><div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
    body.appendChild(div); body.scrollTop = body.scrollHeight;
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmt(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`(.+?)`/g,'<code style="background:#0d1117;padding:1px 5px;border-radius:3px;font-size:.85em">$1</code>')
      .replace(/\n/g,'<br>');
  }

  async function sendMessage() {
    const q = input.value.trim();
    if (!q) return;
    sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    addMsg('user', esc(q));
    addTyping();

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, module: MODULE || undefined }),
      });
      const data = await res.json();
      document.getElementById('ai-typing')?.remove();

      if (data.error) {
        addMsg('bot', `<span style="color:#E74C3C">Error: ${esc(data.error)}</span>`);
      } else {
        const modelBadge = data.model?.includes('haiku') ? '<span style="opacity:.45;font-size:.7em;margin-left:8px">⚡ Haiku</span>' : '<span style="opacity:.45;font-size:.7em;margin-left:8px">🧠 Sonnet</span>';
        addMsg('bot', fmt(data.answer) + modelBadge, data.sources);
      }
    } catch (err) {
      document.getElementById('ai-typing')?.remove();
      addMsg('bot', `<span style="color:#E74C3C">Could not reach API: ${esc(err.message)}. Deploy to Vercel first.</span>`);
    }

    sendBtn.disabled = false;
  }
})();
