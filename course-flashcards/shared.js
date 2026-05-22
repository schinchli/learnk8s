/* ===========================================================
   Shared interactions for course-flashcards/
   - Flip cards on click / space / Enter
   - Stepped animation player driver
   =========================================================== */

(function () {
  // ---- Flip cards ----
  function initCards() {
    document.querySelectorAll('.card').forEach((card) => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
      const toggle = () => {
        const flipped = card.classList.toggle('flipped');
        card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ---- Animation player ----
  // Each .anim-player has:
  //   data-anim-id="..."        — id used to find steps
  //   .anim-narration            — text container
  //   .anim-stage svg            — SVG scene
  //   .anim-controls .anim-btn   — prev/play/next
  //   .anim-progress             — dots get auto-populated
  // Steps are read from window.ANIMATIONS[id] = [{ narration, apply(svg) }, ...]
  function initAnimationPlayer(player) {
    const id = player.dataset.animId;
    const steps = (window.ANIMATIONS || {})[id];
    if (!steps || !steps.length) return;

    const stage = player.querySelector('.anim-stage svg');
    const narration = player.querySelector('.anim-narration');
    const progress = player.querySelector('.anim-progress');
    const counter = player.querySelector('.step-counter');
    const btnPrev = player.querySelector('[data-action="prev"]');
    const btnPlay = player.querySelector('[data-action="play"]');
    const btnNext = player.querySelector('[data-action="next"]');
    const btnReset = player.querySelector('[data-action="reset"]');

    progress.innerHTML = '';
    steps.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'anim-dot';
      dot.dataset.idx = i;
      dot.addEventListener('click', () => go(i));
      progress.appendChild(dot);
    });

    let current = 0;
    let timer = null;
    let playing = false;

    function render() {
      // Reset SVG: re-apply steps 0..current cumulatively from initial state.
      const reset = steps[0].reset;
      if (typeof reset === 'function') reset(stage);
      for (let i = 0; i <= current; i++) {
        if (typeof steps[i].apply === 'function') steps[i].apply(stage, i === current);
      }
      narration.textContent = steps[current].narration || '';
      progress.querySelectorAll('.anim-dot').forEach((d, i) => {
        d.classList.toggle('done', i < current);
        d.classList.toggle('current', i === current);
      });
      if (counter) counter.textContent = `Step ${current + 1} / ${steps.length}`;
      if (btnPrev) btnPrev.disabled = current === 0;
      if (btnNext) btnNext.disabled = current === steps.length - 1;
    }

    function go(idx) {
      current = Math.max(0, Math.min(steps.length - 1, idx));
      render();
    }
    function next() {
      if (current < steps.length - 1) go(current + 1);
      else stop();
    }
    function prev() { go(current - 1); }
    function play() {
      if (current === steps.length - 1) go(0);
      playing = true;
      btnPlay.textContent = '⏸ Pause';
      btnPlay.classList.add('play');
      tick();
    }
    function stop() {
      playing = false;
      btnPlay.textContent = '▶ Play';
      btnPlay.classList.remove('play');
      clearTimeout(timer);
    }
    function tick() {
      if (!playing) return;
      timer = setTimeout(() => {
        if (current >= steps.length - 1) { stop(); return; }
        next();
        tick();
      }, 3200);
    }

    if (btnPrev)  btnPrev.addEventListener('click', () => { stop(); prev(); });
    if (btnNext)  btnNext.addEventListener('click', () => { stop(); next(); });
    if (btnReset) btnReset.addEventListener('click', () => { stop(); go(0); });
    if (btnPlay)  btnPlay.addEventListener('click', () => playing ? stop() : play());

    render();
  }

  function initAllAnimations() {
    document.querySelectorAll('.anim-player').forEach(initAnimationPlayer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCards();
      initAllAnimations();
    });
  } else {
    initCards();
    initAllAnimations();
  }
})();
