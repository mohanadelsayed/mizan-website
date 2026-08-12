/* ═══════════════════════════════════════════════════════════
   MIZAN · Interactive Architecture · 14-Click State Machine
   Mirrors the exact click sequence from slide 9 of the sponsor keynote
   delivered at the CEBC × SGG Roundtable · Four Seasons Cairo · 11 Aug 2026
   ═══════════════════════════════════════════════════════════ */

const CLICKS = [
  { // 0 · Baseline
    badge: "◆ Click 00 · Baseline",
    title: "The empty stage",
    body: "Every element you're about to see was authored deliberately. Press <strong>Next</strong> or use the controls to walk through the 14 clicks — the same sequence delivered at the Four Seasons Cairo sponsor keynote on 11 August 2026."
  },
  { // 1 · PRO
    badge: "◆ Click 01 · The Anchor",
    title: "PRO — Producer Responsibility Organization",
    body: "At the heart sits the <strong>PRO</strong> — the entity <em>Law 202/2020, Article 17</em> authorises. Not a private company. Not a government body. A third operational layer between them, proposed under Egyptian law."
  },
  { // 2 · ChemiCan
    badge: "◆ Click 02 · The Operator",
    title: "ChemiCan · Build & Operate",
    body: "The PRO needs an operator. <strong>ChemiCan</strong> is proposed as the exclusive operator — building the platform, running the compliance engine, retaining IP, and holding a first-negotiation right on any future EPR decree."
  },
  { // 3 · International Partners
    badge: "◆ Click 03 · The Standing",
    title: "International Partners",
    body: "We are not working alone. <strong>Landbell</strong> (Germany), <strong>ERION</strong> (Italy), and the <strong>WEEE Forum</strong> (Brussels) stand behind the technical model — bringing 20 years of European PRO experience to the Egyptian design."
  },
  { // 4 · Producers
    badge: "◆ Click 04 · The Trigger",
    title: "Producers · Attract & Calculate",
    body: "Producers enter the system <strong>automatically</strong> — via <em>NAFEZA</em> (every import declaration) and <em>e-Invoicing</em> (every domestic sale). Obligation calculation happens without human intervention. Every kilogram, every producer, every quarter."
  },
  { // 5 · e-Finance
    badge: "◆ Click 05 · The Escrow",
    title: "EPR Pay → e-Finance",
    body: "Fees <strong>never touch us</strong>. They never touch the PRO. They flow directly into sovereign escrow at <strong>e-Finance</strong> — the government payment gateway. This is the ring-fenced fund principle — the money is legally trapped in a single purpose."
  },
  { // 6 · WMRA
    badge: "◆ Click 06 · The Sovereign",
    title: "WMRA · 5% Statutory Allocation",
    body: "<strong>WMRA</strong> holds a proposed <em>statutory 5%</em>. Not a fee for work — a legal allocation. The regulator retains full sovereignty <strong>without carrying operational burden</strong>."
  },
  { // 7 · Manage / Delegate
    badge: "◆ Click 07 · The Delegation",
    title: "WMRA delegates to PRO",
    body: "WMRA delegates day-to-day scheme management to the PRO. This is <strong>Article 17 in operation</strong>: the sovereign regulator sets the frame, and the specialised contracted entity runs it."
  },
  { // 8 · Recyclers → Work Order
    badge: "◆ Click 08 · The Routing",
    title: "Recyclers · Work Order",
    body: "The PRO issues work orders to WMRA-licensed recyclers. Selection is <strong>never by discretion</strong> — it is governed by the <em>MIZAN INDEX</em>, an algorithmic scoring system open to all 44 licensed operators."
  },
  { // 9 · Proof of Treatment
    badge: "◆ Click 09 · The Return",
    title: "Proof of Treatment",
    body: "Recyclers return <em>chain-of-custody</em> documentation — weight tickets, treatment records, sub-stream breakdown. <strong>The audit trail closes</strong>."
  },
  { // 10 · Clearing Data
    badge: "◆ Click 10 · The Ledger",
    title: "Clearing · Data · Audit",
    body: "The data flows through the platform. Auditable reports are generated for <strong>every tonne, every producer, every quarter</strong> — traceable and open to WMRA, to the Alliance, and to independent audit."
  },
  { // 11 · Payment Authorization
    badge: "◆ Click 11 · The Trigger",
    title: "Payment Authorization",
    body: "<strong>Only now</strong> does the PRO authorize payment to e-Finance to release the funds. <em>No payment before proof of work.</em> No advance. No trust-based release."
  },
  { // 12 · Pay % Recyclers
    badge: "◆ Click 12 · The Field Layer",
    title: "Recyclers receive 30%",
    body: "Recyclers receive their <strong>30%</strong> — for the work actually performed. They also keep the value of the <em>recovered metals</em>: copper, gold, aluminum, rare-earth. The margin structure rewards real recovery."
  },
  { // 13 · Pay % ChemiCan
    badge: "◆ Click 13 · The Operator's Share",
    title: "PRO receives 30%",
    body: "The PRO / ChemiCan receives <strong>30%</strong> as an operating fee — covering the platform, the audits, customer support, compliance monitoring. <em>This is not profit.</em> This is running the system."
  },
  { // 14 · Certificate
    badge: "◆ Click 14 · The Two-Certificate",
    title: "One certificate · Two assets",
    body: "The producer receives <strong>two assets in one certificate</strong>: (1) EPR Compliance Discharge — legal obligation closed; (2) <strong>Carbon Credit</strong> via <em>GOEIC EVVU</em> — verifiable, sellable in international markets, and providing <strong>CBAM cover</strong>. This is what separates Mizan from every non-carbon EPR scheme worldwide."
  }
];

// ═══════════ STATE MACHINE ═══════════
let currentClick = 0;
let playInterval = null;

const svg = document.getElementById('archSvg');
const badge = document.getElementById('clickBadge');
const title = document.getElementById('narrativeTitle');
const body = document.getElementById('narrativeBody');
const progressNum = document.getElementById('progressNum');
const progressFill = document.getElementById('progressFill');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playBtn = document.getElementById('playBtn');
const resetBtn = document.getElementById('resetBtn');
const jumpGrid = document.getElementById('jumpGrid');

// ═══════════ RENDER STATE ═══════════
function renderState(n) {
  currentClick = Math.max(0, Math.min(14, n));

  // Update SVG reveals
  for (let i = 1; i <= 14; i++) {
    const el = svg.querySelector(`.reveal-${i}`);
    if (el) el.classList.toggle('active', i <= currentClick);
  }

  // Update narrative panel
  const c = CLICKS[currentClick];
  badge.innerHTML = c.badge;
  title.innerHTML = c.title;
  body.innerHTML = c.body;

  // Update progress
  progressNum.textContent = String(currentClick).padStart(2, '0');
  progressFill.style.width = (currentClick / 14 * 100) + '%';

  // Update controls
  prevBtn.disabled = currentClick === 0;
  nextBtn.disabled = currentClick === 14;

  // Update jump grid
  const buttons = jumpGrid.querySelectorAll('.jump-btn');
  buttons.forEach((btn, i) => {
    btn.classList.remove('current', 'done');
    if (i < currentClick) btn.classList.add('done');
    if (i === currentClick) btn.classList.add('current');
  });
}

// ═══════════ CONTROLS ═══════════
function next() { if (currentClick < 14) renderState(currentClick + 1); }
function prev() { if (currentClick > 0) renderState(currentClick - 1); }
function reset() { stopPlay(); renderState(0); }

function togglePlay() {
  if (playInterval) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  if (currentClick >= 14) renderState(0);
  playBtn.classList.add('playing');
  playBtn.innerHTML = '⏸ Pause';
  playInterval = setInterval(() => {
    if (currentClick >= 14) {
      stopPlay();
    } else {
      next();
    }
  }, 3500);
}

function stopPlay() {
  if (playInterval) clearInterval(playInterval);
  playInterval = null;
  playBtn.classList.remove('playing');
  playBtn.innerHTML = '▶ Play All';
}

// ═══════════ BUILD JUMP GRID ═══════════
function buildJumpGrid() {
  jumpGrid.innerHTML = '';
  for (let i = 0; i <= 14; i++) {
    const b = document.createElement('button');
    b.className = 'jump-btn';
    b.textContent = String(i).padStart(2, '0');
    b.setAttribute('aria-label', `Jump to click ${i}`);
    b.addEventListener('click', () => { stopPlay(); renderState(i); });
    jumpGrid.appendChild(b);
  }
}

// ═══════════ KEYBOARD ═══════════
function handleKeydown(e) {
  // Only when architecture section is in view
  const rect = document.getElementById('architecture').getBoundingClientRect();
  const inView = rect.top < window.innerHeight * 0.8 && rect.bottom > window.innerHeight * 0.2;
  if (!inView) return;

  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (e.key === 'r' || e.key === 'R') { reset(); }
  else if (e.key === 'p' || e.key === 'P') { togglePlay(); }
}

// ═══════════ INIT ═══════════
document.addEventListener('DOMContentLoaded', () => {
  buildJumpGrid();
  renderState(0);

  prevBtn.addEventListener('click', () => { stopPlay(); prev(); });
  nextBtn.addEventListener('click', () => { stopPlay(); next(); });
  playBtn.addEventListener('click', togglePlay);
  resetBtn.addEventListener('click', reset);
  document.addEventListener('keydown', handleKeydown);

  // Auto-advance to click 1 when architecture scrolls into view (subtle nudge)
  const archSection = document.getElementById('architecture');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && currentClick === 0) {
        setTimeout(() => { if (currentClick === 0) renderState(1); }, 900);
        observer.disconnect();
      }
    });
  }, { threshold: 0.4 });
  observer.observe(archSection);
});

// ═══════════ SMOOTH SCROLL FOR NAV ═══════════
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const targetId = link.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      const yOffset = -120;
      const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  });
});
