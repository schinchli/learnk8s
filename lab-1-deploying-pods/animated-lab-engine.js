/**
 * Shared engine for all EKS course animated labs.
 * Each lab HTML provides:  window.LAB_CONFIG + window.LAB_STEPS
 * then includes this file.
 */
(function () {
  const cfg   = window.LAB_CONFIG  || {};
  const STEPS = window.LAB_STEPS   || [];
  const TOTAL = STEPS.length;
  let current = 0, playing = false, timer = null;

  /* ── CSS ─────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
:root{--bg:#06080d;--panel:#11151c;--panel2:#1f2738;--text:#f1f5f9;--muted:#94a3b8;--accent:#38bdf8;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:radial-gradient(ellipse at top,rgba(56,189,248,.05),transparent 60%),var(--bg);
  color:var(--text);font-family:-apple-system,system-ui,Roboto,sans-serif;min-height:100vh;}
header{padding:14px 24px;background:linear-gradient(135deg,${cfg.color1||'rgba(56,189,248,.85)'},${cfg.color2||'rgba(129,140,248,.85)'}),var(--bg);
  border-bottom:1px solid rgba(255,255,255,.06);box-shadow:0 4px 20px rgba(0,0,0,.4);display:flex;align-items:center;gap:14px;}
header .badge{background:rgba(255,255,255,.15);border-radius:6px;padding:2px 10px;font-size:.72em;font-weight:700;letter-spacing:.06em;}
header h1{margin:0;font-size:1.25em;font-weight:800;}
header p{margin:3px 0 0;opacity:.82;font-size:.84em;}
.layout{display:grid;grid-template-columns:290px 1fr;gap:10px;padding:10px;max-width:1580px;margin:0 auto;}
.navbar{grid-column:1/-1;background:var(--panel);border:1px solid var(--panel2);border-radius:12px;
  padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;}
.nav-btns{display:flex;gap:7px;}
button{background:var(--panel2);color:var(--text);border:1px solid #475569;border-radius:6px;
  padding:7px 13px;font-size:.88em;cursor:pointer;transition:background .12s;}
button:hover{background:#2d3748;}
button:disabled{opacity:.3;cursor:not-allowed;}
button.primary{background:rgba(56,189,248,.18);border-color:var(--accent);color:var(--accent);}
.step-meta{flex:1;min-width:0;}
.step-title{font-weight:700;color:var(--accent);font-size:.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.step-narr{color:var(--muted);font-size:.83em;margin-top:3px;line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.pbar{width:100%;height:4px;background:#1e293b;border-radius:3px;margin-top:7px;overflow:hidden;}
.pfill{height:100%;background:linear-gradient(90deg,${cfg.color1||'#38bdf8'},${cfg.color2||'#818cf8'});border-radius:3px;transition:width .3s;}
.ctr{font-size:.76em;color:var(--muted);font-family:ui-monospace,monospace;white-space:nowrap;}
.steps-panel{background:var(--panel);border:1px solid var(--panel2);border-radius:12px;
  overflow-y:auto;max-height:660px;padding:10px;}
.steps-panel h2{font-size:.68em;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;
  margin:0 0 8px;padding:0 4px;}
.step-item{display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:8px;
  margin-bottom:3px;cursor:pointer;border:1px solid transparent;transition:background .1s,border-color .1s;font-size:.83em;}
.step-item:hover{background:rgba(255,255,255,.04);}
.step-item.active{background:rgba(56,189,248,.08);border-color:rgba(56,189,248,.25);}
.step-item.done .snum{background:rgba(39,174,96,.2);border-color:#27AE60;color:#27AE60;}
.step-item.active .snum{background:rgba(56,189,248,.2);border-color:var(--accent);color:var(--accent);}
.snum{min-width:20px;height:20px;border-radius:50%;background:var(--panel2);border:1px solid #475569;
  display:flex;align-items:center;justify-content:center;font-size:.72em;font-weight:700;flex-shrink:0;margin-top:1px;}
.slabel{line-height:1.4;}
.diagram-panel{background:var(--panel);border:1px solid var(--panel2);border-radius:12px;
  padding:14px;display:flex;align-items:center;justify-content:center;min-height:660px;}
#lab-svg{width:100%;height:100%;max-height:640px;}
.bot-rail{grid-column:1/-1;background:var(--panel);border:1px solid var(--panel2);border-radius:12px;
  padding:9px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.lbtn{background:var(--panel2);color:var(--text);border:1px solid #475569;border-radius:6px;
  padding:5px 12px;font-size:.8em;text-decoration:none;display:inline-flex;align-items:center;gap:5px;transition:background .1s;}
.lbtn:hover{background:#2d3748;color:var(--accent);}
.hint-r{font-size:.76em;color:var(--muted);margin-left:auto;}
kbd{background:#334155;border:1px solid #475569;border-bottom-width:2px;border-radius:4px;
  padding:1px 6px;font-family:ui-monospace;font-size:.75em;}
aside.rail{position:fixed;top:0;left:0;bottom:0;width:56px;z-index:200;
  background:#0c1018;border-right:1px solid #1f2738;display:flex;flex-direction:column;
  align-items:center;padding:10px 0;gap:3px;}
.rail-brand{width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,#4A90E2,#9B59B6);
  display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:.85em;
  text-decoration:none;margin-bottom:7px;box-shadow:0 4px 12px rgba(74,144,226,.3);}
.rail-lnk{width:42px;height:42px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:1.2em;color:#fff;text-decoration:none;transition:background .12s;position:relative;}
.rail-lnk:hover{background:rgba(255,255,255,.08);}
.rail-lnk.active{background:rgba(56,189,248,.18);}
.rail-lnk.active::before{content:'';position:absolute;left:-6px;top:9px;bottom:9px;width:3px;
  background:var(--accent);border-radius:0 2px 2px 0;}
body{padding-left:56px;}
@media(max-width:820px){.layout{grid-template-columns:1fr;}.steps-panel{max-height:200px;}}
`;
  document.head.appendChild(style);

  /* ── SVG helpers (global) ─────────────────────────────────────── */
  const NS = 'http://www.w3.org/2000/svg';
  window.svgEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };
  window.clearSVG = svg => { while (svg.firstChild) svg.removeChild(svg.firstChild); };
  window.rr = (svg, x, y, w, h, fill, stroke, rx = 8, sw = 1.5) =>
    svg.appendChild(svgEl('rect', { x, y, width: w, height: h, rx, fill, stroke, 'stroke-width': sw }));
  window.tx = (svg, x, y, t, size = 11, weight = 400, fill = '#f1f5f9', anchor = 'middle') => {
    const el = svgEl('text', { x, y, 'font-size': size, 'font-weight': weight, fill,
      'font-family': 'system-ui,sans-serif', 'text-anchor': anchor });
    el.textContent = t; svg.appendChild(el); return el;
  };
  window.ln = (svg, x1, y1, x2, y2, stroke = '#475569', sw = 1.5) =>
    svg.appendChild(svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw }));
  window.arr = (svg, x1, y1, x2, y2, color = '#38bdf8') => {
    const id = 'ar' + Math.random().toString(36).slice(2);
    let defs = svg.querySelector('defs');
    if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
    const mk = svgEl('marker', { id, markerWidth: 7, markerHeight: 7, refX: 5, refY: 3, orient: 'auto' });
    mk.appendChild(svgEl('polygon', { points: '0 0,7 3,0 6', fill: color }));
    defs.appendChild(mk);
    svg.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 2, 'marker-end': `url(#${id})` }));
  };
  window.arrH = (svg, x1, y, x2, c = '#38bdf8') => arr(svg, x1, y, x2 - 5, y, c);
  window.arrV = (svg, x, y1, y2, c = '#38bdf8') => arr(svg, x, y1, x, y2 - 5, c);

  /* ── DOM ─────────────────────────────────────────────────────── */
  function buildDOM() {
    document.body.innerHTML = `
<aside class="rail">
  <a href="index.html" class="rail-brand" title="Dashboard">K8</a>
  ${(cfg.railLinks || []).map(l => `<a href="${l.href}" class="rail-lnk${l.active?' active':''}" title="${l.title}">${l.icon}</a>`).join('')}
</aside>
<header>
  <div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:3px">
      <span class="badge">${cfg.badge||'MODULE'}</span>
      <h1>${cfg.icon||''} ${cfg.title||''}</h1>
    </div>
    <p>${cfg.subtitle||''}</p>
  </div>
</header>
<div class="layout">
  <div class="navbar">
    <div class="nav-btns">
      <button id="btn-prev" disabled>◀ Prev</button>
      <button id="btn-play" class="primary">▶ Auto-play</button>
      <button id="btn-next">Next ▶</button>
    </div>
    <div class="step-meta">
      <div class="step-title" id="stitle">—</div>
      <div class="step-narr" id="snarr">—</div>
      <div class="pbar"><div class="pfill" id="pfill" style="width:0%"></div></div>
    </div>
    <div class="ctr" id="sctr">1 / ${TOTAL}</div>
  </div>
  <div class="steps-panel"><h2>Steps</h2><div id="slist"></div></div>
  <div class="diagram-panel"><svg id="lab-svg" viewBox="0 0 820 600" preserveAspectRatio="xMidYMid meet"></svg></div>
  <div class="bot-rail">
    ${(cfg.bottomLinks || []).map(l => `<a href="${l.href}" class="lbtn">${l.label}</a>`).join('')}
    <span class="hint-r"><kbd>←</kbd><kbd>→</kbd> navigate · <kbd>Space</kbd> play/pause</span>
  </div>
</div>`;
  }

  /* ── Step list ───────────────────────────────────────────────── */
  function buildList() {
    const container = document.getElementById('slist');
    let lastSec = '';
    STEPS.forEach((s, i) => {
      if (s.section !== lastSec) {
        const h = document.createElement('div');
        h.style.cssText = 'font-size:.65em;color:#475569;text-transform:uppercase;letter-spacing:.08em;padding:7px 9px 2px;';
        h.textContent = s.section || '';
        container.appendChild(h);
        lastSec = s.section;
      }
      const el = document.createElement('div');
      el.className = 'step-item';
      el.innerHTML = `<div class="snum">${i + 1}</div><div class="slabel">${s.title}</div>`;
      el.addEventListener('click', () => { stopPlay(); go(i); });
      container.appendChild(el);
    });
  }

  /* ── Render ──────────────────────────────────────────────────── */
  const svg = () => document.getElementById('lab-svg');
  function render() {
    const s = STEPS[current];
    document.getElementById('stitle').textContent = s.title;
    document.getElementById('snarr').textContent  = s.narration || '';
    document.getElementById('sctr').textContent   = `${current + 1} / ${TOTAL}`;
    document.getElementById('pfill').style.width  = `${((current + 1) / TOTAL) * 100}%`;
    document.getElementById('btn-prev').disabled  = current === 0;
    document.getElementById('btn-next').disabled  = current === TOTAL - 1;
    document.querySelectorAll('.step-item').forEach((el, i) => {
      el.classList.toggle('active', i === current);
      el.classList.toggle('done', i < current);
    });
    document.querySelector('.step-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (s.render) s.render(svg());
  }

  function go(idx) { current = Math.max(0, Math.min(TOTAL - 1, idx)); render(); }
  function stopPlay() {
    playing = false; clearTimeout(timer);
    const b = document.getElementById('btn-play');
    if (b) b.textContent = '▶ Auto-play';
  }
  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    if (current >= TOTAL - 1) { stopPlay(); return; }
    timer = setTimeout(() => { go(current + 1); if (playing) tick(); }, 3600);
  }
  function togglePlay() {
    playing = !playing;
    document.getElementById('btn-play').textContent = playing ? '⏸ Pause' : '▶ Auto-play';
    if (playing) { if (current >= TOTAL - 1) go(0); tick(); }
    else clearTimeout(timer);
  }

  /* ── Event listeners ─────────────────────────────────────────── */
  function wireEvents() {
    document.getElementById('btn-prev').addEventListener('click', () => { stopPlay(); go(current - 1); });
    document.getElementById('btn-next').addEventListener('click', () => { stopPlay(); go(current + 1); });
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'l') { stopPlay(); go(current + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'h') { stopPlay(); go(current - 1); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  function init() { buildDOM(); buildList(); wireEvents(); render(); }
})();
