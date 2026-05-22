/**
 * Browser validation for animated labs and flashcards.
 * Loads each HTML file in Chromium, captures JS errors and checks:
 * - No console errors
 * - SVG renders (has elements after load)
 * - Step navigation works (next/prev)
 * - Flashcard flip works
 * Run: node scripts/validate_browser.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE    = path.resolve(__dirname, '..');
const LABS    = fs.readdirSync(path.join(BASE, 'lab-1-deploying-pods'))
  .filter(f => f.startsWith('animated-lab') && f.endsWith('.html'))
  .map(f => ({ file: `lab-1-deploying-pods/${f}`, type: 'lab', name: f }));
const CARDS   = fs.readdirSync(path.join(BASE, 'course-flashcards'))
  .filter(d => d.match(/^module-\d+$/))
  .map(d => ({ file: `course-flashcards/${d}/index.html`, type: 'flashcard', name: d }));

const ALL = [...LABS, ...CARDS];

async function validateFile(page, { file, type, name }) {
  const errors   = [];
  const warnings = [];
  const result   = { name, type, file, ok: true, errors: [], warnings: [], details: {} };

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
    if (msg.type() === 'warning') warnings.push(msg.text().slice(0, 120));
  });
  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message.slice(0, 200)}`));

  try {
    const url = `file://${path.join(BASE, file)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(400); // let scripts run

    if (type === 'lab') {
      // Check SVG has rendered (has child elements)
      // try both engine SVG and legacy SVG IDs
      const svgId = await page.$('#lab-svg, #main-svg, svg[viewBox], .scene-svg');
      if (svgId) {
        const childCount = await svgId.evaluate(el => el.children.length);
        result.details.svgChildren = childCount;
        if (childCount === 0) warnings.push('SVG has no children after load');
      } else {
        warnings.push('No #lab-svg or #main-svg found');
      }

      // Check step count
      const stepCount = await page.$$eval('.step-item', els => els.length);
      result.details.steps = stepCount;

      // Test Next button navigation
      const nextBtn = await page.$('#btn-next, [data-action="next"]');
      if (nextBtn && stepCount > 1) {
        await nextBtn.click();
        await page.waitForTimeout(150);
        const svgAfter = await page.$('#lab-svg, #main-svg');
        const childAfter = svgAfter ? await svgAfter.evaluate(el => el.children.length) : 0;
        result.details.svgAfterNext = childAfter;
        if (childAfter === 0) warnings.push('SVG empty after clicking Next');
      }

      // Check nav bar exists
      const navbar = await page.$('#btn-play, .primary');
      result.details.hasNav = !!navbar;

      // Check Ask AI button
      const askBtn = await page.$('#ask-ai-btn');
      result.details.hasAskAI = !!askBtn;

    } else if (type === 'flashcard') {
      // Count flip cards
      const cardCount = await page.$$eval('.card', els => els.length);
      result.details.cards = cardCount;

      // Test flip — click first card
      const firstCard = await page.$('.card');
      if (firstCard) {
        await firstCard.click();
        await page.waitForTimeout(100);
        const flipped = await firstCard.evaluate(el => el.classList.contains('flipped'));
        result.details.flipWorks = flipped;
        if (!flipped) warnings.push('Card did not flip on click');
      }

      // Count animation players
      const animCount = await page.$$eval('.anim-player', els => els.length);
      result.details.animations = animCount;

      // Check Ask AI button
      const askBtn = await page.$('#ask-ai-btn');
      result.details.hasAskAI = !!askBtn;

      // Test animation play button
      const playBtn = await page.$('.anim-btn[data-action="play"]');
      if (playBtn) {
        await playBtn.click();
        await page.waitForTimeout(150);
        result.details.animPlayWorks = true;
      }
    }

    // Filter out known-benign errors (Ask AI can't reach API without deploy)
    const realErrors = errors.filter(e =>
      !e.includes('ask-ai.js') &&
      !e.includes('/api/ask') &&
      !e.includes('net::ERR_FILE_NOT_FOUND') && // ask-ai.js relative path in file:// context
      !e.includes('ERR_FAILED') &&
      !e.includes('favicon')
    );

    result.errors   = realErrors;
    result.warnings = warnings;
    result.ok       = realErrors.length === 0;

  } catch (e) {
    result.ok = false;
    result.errors = [`LOAD_ERROR: ${e.message.slice(0, 200)}`];
  }

  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const pass = [], fail = [], warn = [];

  for (const item of ALL) {
    const page = await browser.newPage();
    const r = await validateFile(page, item);
    await page.close();

    const d = r.details;
    let line = '';
    if (r.type === 'lab') {
      line = `steps=${d.steps||0} svgChildren=${d.svgChildren||0} svgAfterNext=${d.svgAfterNext||'?'} nav=${d.hasNav} askAI=${d.hasAskAI}`;
    } else {
      line = `cards=${d.cards||0} flip=${d.flipWorks} anims=${d.animations||0} askAI=${d.hasAskAI}`;
    }

    if (!r.ok) {
      fail.push(r);
      console.log(`  ✗ ${r.name.padEnd(52)} ${line}`);
      r.errors.forEach(e => console.log(`      ERROR: ${e}`));
    } else if (r.warnings.length) {
      warn.push(r);
      console.log(`  ⚠ ${r.name.padEnd(52)} ${line}`);
      r.warnings.forEach(w => console.log(`      WARN:  ${w}`));
    } else {
      pass.push(r);
      console.log(`  ✓ ${r.name.padEnd(52)} ${line}`);
    }
  }

  await browser.close();

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`PASS: ${pass.length}   WARN: ${warn.length}   FAIL: ${fail.length}   TOTAL: ${ALL.length}`);
  if (fail.length > 0) process.exit(1);
})();
