/* ═══════════════════════════════════════════════════════════
   MIZAN · App · i18n + mobile menu + 14-click architecture
   ═══════════════════════════════════════════════════════════ */

(() => {
  // ═══════════ STATE ═══════════
  let lang = 'ar';
  let currentClick = 0;
  let playInterval = null;

  // ═══════════ DOM ═══════════
  const el = (id) => document.getElementById(id);
  const html = document.documentElement;
  const langToggle = el('langToggle');
  const navToggle = el('navToggle');
  const navLinks = el('navLinks');
  const svg = el('archSvg');
  const badge = el('clickBadge');
  const title = el('narrativeTitle');
  const body = el('narrativeBody');
  const progressNum = el('progressNum');
  const progressFill = el('progressFill');
  const prevBtn = el('prevBtn');
  const nextBtn = el('nextBtn');
  const playBtn = el('playBtn');
  const resetBtn = el('resetBtn');
  const stepTimeline = el('stepTimeline');
  const realList = el('realList');
  const propList = el('propList');
  const matrixGrid = el('matrixGrid');
  const pillarSteps = el('pillarSteps');
  const pillarBullets = el('pillarBullets');

  // ═══════════ I18N HELPERS ═══════════
  function get(path, obj = I18N[lang]) {
    return path.split('.').reduce((o, k) => (o ? o[k] : ''), obj) || '';
  }

  function applyI18n() {
    // Update html direction + lang
    html.setAttribute('lang', lang);
    html.setAttribute('dir', I18N[lang].dir);
    html.setAttribute('data-lang', lang);

    // Update <title> and meta description
    document.title = get('meta.title');
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', get('meta.description'));

    // Language toggle button label — shows the *other* language
    langToggle.querySelector('.lang-current').textContent = lang === 'ar' ? 'EN' : 'ع';

    // All [data-i18n] — auto-detects HTML in value; uses innerHTML if present,
    // textContent otherwise. All translations are static (no user input) so safe.
    const hasHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s);
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      const val = get(key);
      if (hasHtml(val)) node.innerHTML = val;
      else node.textContent = val;
    });

    // All [data-i18n-html] — explicit HTML
    document.querySelectorAll('[data-i18n-html]').forEach(node => {
      const key = node.getAttribute('data-i18n-html');
      node.innerHTML = get(key);
    });

    // SVG text nodes — accept either "svg.foo" or plain "foo" key form.
    document.querySelectorAll('[data-svg-i18n]').forEach(node => {
      const raw = node.getAttribute('data-svg-i18n');
      const key = raw.replace(/^svg\./, '');
      const val = SVG_I18N[lang] && SVG_I18N[lang][key];
      if (val) node.textContent = val;
    });

    // Reality lists
    buildRealityLists();

    // MIZAN INDEX — matrix + pillars (lang-dependent text)
    buildMatrixGrid();
    buildPillarLists();

    // Step timeline (built once, but re-render state)
    if (stepTimeline && stepTimeline.children.length === 0) buildStepTimeline();

    // Update current click narrative
    renderClick(currentClick);
  }

  function setLang(newLang) {
    if (newLang !== 'ar' && newLang !== 'en') return;
    lang = newLang;
    localStorage.setItem('mizan-lang', lang);
    applyI18n();
  }

  function toggleLang() {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }

  // ═══════════ REALITY LISTS ═══════════
  function buildRealityLists() {
    realList.innerHTML = '';
    propList.innerHTML = '';
    I18N[lang].reality_lists.real.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = item;
      realList.appendChild(li);
    });
    I18N[lang].reality_lists.prop.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = item;
      propList.appendChild(li);
    });
  }

  // ═══════════ MIZAN INDEX · matrix + pillars ═══════════
  // Matrix cell class per (row=performance, col=capability-tier)
  // Row 0 = 100+ Excellence  ·  Row 4 = <50 Below Threshold
  // Col 0 = T1 Collection    ·  Col 4 = T5 Hazardous + PoP
  const MATRIX_MAP = [
    // row 0 (Excellence)
    ['tier-strong','tier-strong','tier-excellent','tier-excellent','tier-excellent'],
    // row 1 (Strong)
    ['tier-strong','tier-strong','tier-strong','tier-excellent','tier-excellent'],
    // row 2 (Standard)
    ['tier-standard','tier-standard','tier-standard','tier-strong','tier-strong'],
    // row 3 (Probation)
    ['tier-probation','tier-probation','tier-probation','tier-probation','tier-probation'],
    // row 4 (Below Threshold)
    ['tier-below','tier-below','tier-below','tier-below','tier-below'],
  ];
  // Highlight cell — T4 × Excellence (REMIT)
  const HERO_CELL = { row: 0, col: 3 };

  function buildMatrixGrid() {
    if (!matrixGrid) return;
    matrixGrid.innerHTML = '';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = document.createElement('div');
        cell.className = 'matrix-cell ' + MATRIX_MAP[r][c];
        if (r === HERO_CELL.row && c === HERO_CELL.col) cell.classList.add('hero-cell');
        matrixGrid.appendChild(cell);
      }
    }
  }

  function buildPillarLists() {
    if (pillarSteps) {
      pillarSteps.innerHTML = '';
      const steps = (I18N[lang].index.p2 && I18N[lang].index.p2.steps) || [];
      steps.forEach(txt => {
        const li = document.createElement('li');
        li.textContent = txt;
        pillarSteps.appendChild(li);
      });
    }
    if (pillarBullets) {
      pillarBullets.innerHTML = '';
      const bullets = (I18N[lang].index.p3 && I18N[lang].index.p3.bullets) || [];
      bullets.forEach(txt => {
        const li = document.createElement('li');
        li.textContent = txt;
        pillarBullets.appendChild(li);
      });
    }
  }

  // ═══════════ CLICK STATE MACHINE ═══════════
  function renderClick(n) {
    const prev = currentClick;
    currentClick = Math.max(0, Math.min(14, n));
    const c = I18N[lang].clicks[currentClick];

    // SVG reveals
    for (let i = 1; i <= 14; i++) {
      const g = svg.querySelector(`.reveal-${i}`);
      if (!g) continue;
      const wasActive = g.classList.contains('active');
      const shouldBeActive = i <= currentClick;
      g.classList.toggle('active', shouldBeActive);
      // Pulse only the newest step forward
      g.classList.remove('newly-active');
      if (shouldBeActive && !wasActive && currentClick > prev) {
        // Trigger pulse via reflow
        void g.offsetWidth;
        g.classList.add('newly-active');
      }
    }

    // Narrative
    badge.textContent = c.badge;
    title.innerHTML = c.title;
    body.innerHTML = c.body;

    // Progress
    progressNum.textContent = String(currentClick).padStart(2, '0');
    progressFill.style.width = (currentClick / 14 * 100) + '%';

    // Controls
    prevBtn.disabled = currentClick === 0;
    nextBtn.disabled = currentClick === 14;

    // Step timeline state
    if (stepTimeline) {
      stepTimeline.querySelectorAll('.step-dot').forEach((btn, i) => {
        btn.classList.remove('done', 'current');
        if (i < currentClick) btn.classList.add('done');
        if (i === currentClick) btn.classList.add('current');
      });
      // Scroll the current dot into view so mobile users can see progress
      const curDot = stepTimeline.querySelector('.step-dot.current');
      if (curDot && stepTimeline.scrollWidth > stepTimeline.clientWidth) {
        const inline = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        curDot.scrollIntoView({ behavior: inline, block: 'nearest', inline: 'center' });
      }
    }
  }

  function nextClick() { if (currentClick < 14) renderClick(currentClick + 1); }
  function prevClick() { if (currentClick > 0) renderClick(currentClick - 1); }
  function resetClick() { stopPlay(); renderClick(0); }

  function startPlay() {
    if (currentClick >= 14) renderClick(0);
    playBtn.classList.add('playing');
    playBtn.textContent = get('arch.pause');
    playInterval = setInterval(() => {
      if (currentClick >= 14) stopPlay();
      else nextClick();
    }, 3500);
  }

  function stopPlay() {
    if (playInterval) clearInterval(playInterval);
    playInterval = null;
    playBtn.classList.remove('playing');
    playBtn.textContent = get('arch.play');
  }

  function togglePlay() { playInterval ? stopPlay() : startPlay(); }

  function buildStepTimeline() {
    if (!stepTimeline) return;
    stepTimeline.innerHTML = '';
    for (let i = 0; i <= 14; i++) {
      const b = document.createElement('button');
      b.className = 'step-dot';
      b.type = 'button';
      b.textContent = String(i).padStart(2, '0');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Step ${i}`);
      b.addEventListener('click', () => { stopPlay(); renderClick(i); });
      stepTimeline.appendChild(b);
    }
  }

  // ═══════════ MOBILE NAV ═══════════
  function toggleMobileNav() {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.classList.toggle('open', open);
  }

  function closeMobileNav() {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.classList.remove('open');
  }

  // ═══════════ KEYBOARD ═══════════
  function handleKeydown(e) {
    const arch = document.getElementById('architecture');
    const rect = arch.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.8 && rect.bottom > window.innerHeight * 0.2;
    if (!inView) return;

    // In Arabic (RTL) the intuitive "next" is left arrow, but users toggle so
    // we accept both. Space always = next.
    if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); nextClick(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevClick(); }
    else if (e.key.toLowerCase() === 'p') togglePlay();
    else if (e.key.toLowerCase() === 'r') resetClick();
  }

  // ═══════════ SMOOTH SCROLL ═══════════
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          closeMobileNav();
          const offset = -100;
          const y = target.getBoundingClientRect().top + window.pageYOffset + offset;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      });
    });
  }

  // ═══════════ AUTO-NUDGE ARCHITECTURE ═══════════
  function initArchAutoNudge() {
    const arch = document.getElementById('architecture');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && currentClick === 0) {
          setTimeout(() => { if (currentClick === 0) renderClick(1); }, 900);
          observer.disconnect();
        }
      });
    }, { threshold: 0.35 });
    observer.observe(arch);
  }

  // ═══════════ INIT ═══════════
  function init() {
    // Detect language: URL param > localStorage > default AR
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const storedLang = localStorage.getItem('mizan-lang');
    lang = (urlLang === 'en' || urlLang === 'ar') ? urlLang
         : (storedLang === 'en' || storedLang === 'ar') ? storedLang
         : 'ar';

    // Build dynamic content
    buildStepTimeline();
    applyI18n();
    renderClick(0);

    // Event listeners
    langToggle.addEventListener('click', toggleLang);
    navToggle.addEventListener('click', toggleMobileNav);
    prevBtn.addEventListener('click', () => { stopPlay(); prevClick(); });
    nextBtn.addEventListener('click', () => { stopPlay(); nextClick(); });
    playBtn.addEventListener('click', togglePlay);
    resetBtn.addEventListener('click', resetClick);
    document.addEventListener('keydown', handleKeydown);

    initSmoothScroll();
    initArchAutoNudge();

    // Close mobile nav on outside click
    document.addEventListener('click', (e) => {
      if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) {
        closeMobileNav();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
