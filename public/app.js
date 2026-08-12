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
  const jumpGrid = el('jumpGrid');
  const realList = el('realList');
  const propList = el('propList');
  const partnerGrid = el('partnerGrid');

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

    // All [data-i18n] — plain text
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      node.textContent = get(key);
    });

    // All [data-i18n-html] — allows inline HTML like <strong>, <em>, <br>
    document.querySelectorAll('[data-i18n-html]').forEach(node => {
      const key = node.getAttribute('data-i18n-html');
      node.innerHTML = get(key);
    });

    // SVG text nodes
    document.querySelectorAll('[data-svg-i18n]').forEach(node => {
      const key = node.getAttribute('data-svg-i18n');
      node.textContent = SVG_I18N[lang][key] || node.textContent;
    });

    // Reality lists
    buildRealityLists();

    // Partner grid
    buildPartnerGrid();

    // Jump grid labels (numbers stay LTR, but rebuild for good measure)
    if (jumpGrid.children.length === 0) buildJumpGrid();

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

  // ═══════════ PARTNERS ═══════════
  function buildPartnerGrid() {
    partnerGrid.innerHTML = '';
    const roles = I18N[lang].partners.roles;
    PARTNER_LOGOS.forEach((name, i) => {
      const tile = document.createElement('div');
      tile.className = 'partner-tile';
      tile.innerHTML = `
        <div class="partner-logo-placeholder">[${name}]</div>
        <div class="partner-role">${roles[i] || ''}</div>
      `;
      partnerGrid.appendChild(tile);
    });
  }

  // ═══════════ CLICK STATE MACHINE ═══════════
  function renderClick(n) {
    currentClick = Math.max(0, Math.min(14, n));
    const c = I18N[lang].clicks[currentClick];

    // SVG reveals
    for (let i = 1; i <= 14; i++) {
      const g = svg.querySelector(`.reveal-${i}`);
      if (g) g.classList.toggle('active', i <= currentClick);
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

    // Jump grid state
    jumpGrid.querySelectorAll('.jump-btn').forEach((btn, i) => {
      btn.classList.remove('done', 'current');
      if (i < currentClick) btn.classList.add('done');
      if (i === currentClick) btn.classList.add('current');
    });
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

  function buildJumpGrid() {
    jumpGrid.innerHTML = '';
    for (let i = 0; i <= 14; i++) {
      const b = document.createElement('button');
      b.className = 'jump-btn';
      b.type = 'button';
      b.textContent = String(i).padStart(2, '0');
      b.setAttribute('aria-label', `Jump to click ${i}`);
      b.addEventListener('click', () => { stopPlay(); renderClick(i); });
      jumpGrid.appendChild(b);
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
    buildJumpGrid();
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
