/* ═══════════════════════════════════════════════════════════════════
   MIZAN LIVE · Simulation controller + dual-loop engine
   State loop (drift-corrected setTimeout) + rAF render loop.
   Six persona controllers subscribed via event bus.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
'use strict';

const D = window.SIM_DATA;
const $ = (id) => document.getElementById(id);
const html = document.documentElement;

// ═══════════ URL & LANGUAGE ═══════════
function paramsIn() {
  const p = new URLSearchParams(location.search);
  return {
    seed: parseInt(p.get('seed') || '', 10) || Math.floor(Math.random() * 1e6),
    lang: (p.get('lang') === 'en' || p.get('lang') === 'ar') ? p.get('lang')
        : (localStorage.getItem('mizan-lang') === 'en' || localStorage.getItem('mizan-lang') === 'ar') ? localStorage.getItem('mizan-lang')
        : 'ar',
    persona: p.get('persona') || null,
    act: parseInt(p.get('act') || '1', 10),
    tab: parseInt(p.get('tab') || '0', 10),
  };
}
let uiLang = paramsIn().lang;

// ═══════════ EVENT BUS ═══════════
const bus = (function() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    emit(type, payload) {
      const set = listeners.get(type);
      if (!set) return;
      // Freeze payload in dev-like mode to catch mutations
      const frozen = payload && typeof payload === 'object' ? Object.freeze(payload) : payload;
      set.forEach(fn => { try { fn(frozen); } catch (e) { console.error(type, e); } });
    },
    off(type) { listeners.delete(type); },
    clear() { listeners.clear(); }
  };
})();

// ═══════════ WORLD STATE ═══════════
const world = {
  seed: paramsIn().seed,
  rng: null,
  tick: 0,             // total ticks since start
  simMinutes: 0,       // 1 tick = 30 sim-minutes at 1× (so 48 ticks = 1 sim day)
  speed: 1,            // 0.25 | 1 | 4 | 16
  running: false,

  // Live counters
  tonnesToday: 0,
  cumulativeTonnes: 0,
  escrowHeld: 0,
  escrowReleased: 0,
  obligationsCalculated: 0,
  certificatesIssued: 0,
  carbonCredits: 0,
  cbamCovers: 0,
  verificationsPending: 0,
  verificationsDone: 0,

  // Recent events (bounded)
  imports: [],        // producer imports
  workOrders: [],
  handoffs: [],
  proofs: [],
  citizenPoints: 0,
  citizenReturns: 0,

  // Producer session (Samsung Egypt POV)
  producer: {
    id: 'samsung',
    obligation_kg: 0,
    fee_egp: 0,
    flowA_credit: 0,   // take-back credit
    flowB_paid: 0,     // fee paid
    shipments: 0,
    certs: [],
  },

  // Refiner session (REMIT POV)
  refiner: {
    id: 'REMIT Cairo',
    tier: 4, score: 92,
    incoming: [],
    metals: { copper: 0, gold: 0, silver: 0, aluminum: 0 },
    revenueEscrow: 0,
    revenueMetals: 0,
  },

  // Collector session (Dr.WEEE POV)
  collector: {
    id: 'Dr.WEEE Haram',
    activeOrders: 0, completedOrders: 0,
    weeklyEarnings: 0, monthlyEarnings: 0,
    score: 88, rank: 3,
  },

  // WMRA session
  wmra: {
    verifyQueue: [],
    approvedToday: 0,
    rejectedToday: 0,
    statutory5pct: 0,
  },

  // Board session
  board: {
    pendingApprovals: [], approvedToday: 0,
    quarterlyFinancial: { wmra: 0, consortium: 0, ops: 0, collectors: 0, refiners: 0 },
    weeeForumProgress: [...D.WEEE_FORUM_CRITERIA],
  },

  // Follow-this-device
  followed: null,
};

// ═══════════ SIM CLOCK ═══════════
function formatSimTime() {
  const totalMin = world.simMinutes;
  const day = Math.floor(totalMin / (60 * 24)) + 1;
  const hour = Math.floor((totalMin % (60 * 24)) / 60);
  const min = Math.floor(totalMin % 60);
  const label = uiLang === 'ar' ? 'يوم' : 'Day';
  return `Q1 · ${label} ${String(day).padStart(2, '0')} · ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ═══════════ I18N ═══════════
function get(path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : ''), I18N[uiLang]) ?? '';
}
function applyI18n() {
  html.setAttribute('lang', uiLang);
  html.setAttribute('dir', I18N[uiLang].dir);
  html.setAttribute('data-lang', uiLang);
  document.title = get('sim.brand') + ' · ' + get('sim.landing.eyebrow');

  const hasHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s);
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.getAttribute('data-i18n');
    const val = get(key);
    if (hasHtml(val)) node.innerHTML = val;
    else node.textContent = val;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(node => {
    node.innerHTML = get(node.getAttribute('data-i18n-html'));
  });
  const lc = $('simLangCur');
  if (lc) lc.textContent = uiLang === 'ar' ? 'EN' : 'ع';
}

// ═══════════ NUMBER FORMATTING ═══════════
function fmt(n, opts = {}) {
  const locale = uiLang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.NumberFormat(locale, opts).format(n);
}
function fmtEgp(n) { return fmt(n, { maximumFractionDigits: 0 }); }
function fmtKg(n) { return fmt(n, { maximumFractionDigits: 1 }); }

// ═══════════ ENGINE — dual loop ═══════════
let stateTimer = null;
let renderRaf = null;
let lastStateTs = 0;
let lastRenderTs = 0;

// One "state tick" = 30 sim-minutes at speed 1× = 500ms real
const BASE_TICK_MS = 500;

function stateTick() {
  const now = performance.now();
  const drift = lastStateTs ? (now - lastStateTs) - (BASE_TICK_MS / world.speed) : 0;
  lastStateTs = now;

  advanceWorld();

  // Debounced localStorage (every 10 ticks)
  if (world.tick % 10 === 0) {
    try {
      localStorage.setItem('mizan-sim-lang', uiLang);
    } catch (e) {}
  }

  if (world.running) {
    const nextIn = Math.max(30, (BASE_TICK_MS / world.speed) - Math.max(0, drift));
    stateTimer = setTimeout(stateTick, nextIn);
  }
}

function advanceWorld() {
  world.tick++;
  world.simMinutes += 30; // 30 sim-minutes per tick

  const rng = world.rng;

  // Every tick, generate proportional volume of new events
  const baseKg = D.NATIONAL_BASELINE.annual_tonnes * 1000 / (365 * 48); // kg per tick per 100% coverage
  const rampUp = Math.min(1, 0.15 + world.tick / 200); // volume ramps over first few sim days
  const nationalKgThisTick = baseKg * rampUp * D.NATIONAL_BASELINE.ict_phase1_share;

  world.cumulativeTonnes += nationalKgThisTick / 1000;
  world.tonnesToday += nationalKgThisTick / 1000;
  if (world.simMinutes % (60 * 24) === 0) world.tonnesToday = 0; // reset daily

  // ── New import declarations (producer feed)
  if (world.tick % 2 === 0) {
    const producer = D.pickWeighted(rng, D.PRODUCERS, D.PRODUCERS.map(p => p.share));
    const device = D.pick(rng, D.DEVICES);
    const units = Math.floor(D.between(rng, 40, 800));
    const kg = units * device.avg_kg;
    const fee_egp = kg * device.fee_egp_per_kg;
    const gov = D.pickWeighted(rng, D.GOVERNORATES, D.GOVERNORATES.map(g => g.weight));
    const imp = { id: `IMP-${world.tick}`, producer, device, units, kg, fee_egp, gov, ts: world.simMinutes };
    world.imports.unshift(imp);
    if (world.imports.length > 30) world.imports.pop();
    world.obligationsCalculated++;
    world.escrowHeld += fee_egp;
    bus.emit('imports:new', imp);

    // Producer session tracking (Samsung POV)
    if (producer.id === world.producer.id) {
      world.producer.shipments++;
      world.producer.obligation_kg += kg;
      world.producer.fee_egp += fee_egp;
      world.producer.flowB_paid += fee_egp;
    }
  }

  // ── Work orders (consortium → collectors)
  if (world.tick % 3 === 0 && world.imports.length > 3) {
    const wo = generateWorkOrder(rng);
    world.workOrders.unshift(wo);
    if (world.workOrders.length > 20) world.workOrders.pop();
    if (wo.collector === world.collector.id) world.collector.activeOrders++;
    bus.emit('orders:new', wo);
  }

  // ── Weight scan events (collectors)
  if (world.tick % 2 === 1) {
    const collectorEvent = { ts: world.simMinutes, kg: D.between(rng, 8, 45), device: D.pick(rng, D.DEVICES) };
    bus.emit('weights:log', collectorEvent);
  }

  // ── Handoffs to refiner
  if (world.tick % 4 === 0) {
    const refiner = D.pick(rng, D.REFINERS);
    const kg = D.between(rng, 80, 320);
    const h = { id: `MAN-${world.tick}`, refiner, kg, ts: world.simMinutes };
    world.handoffs.unshift(h);
    if (world.handoffs.length > 20) world.handoffs.pop();
    if (refiner.name_en === world.refiner.id) {
      world.refiner.incoming.unshift(h);
      if (world.refiner.incoming.length > 15) world.refiner.incoming.pop();
      const p = extractMetals(h.kg);
      world.refiner.metals.copper += p.copper;
      world.refiner.metals.gold += p.gold;
      world.refiner.metals.silver += p.silver;
      world.refiner.metals.aluminum += p.aluminum;
      world.refiner.revenueMetals += (p.copper * D.PRICES_EGP.copper_per_tonne / 1000)
        + (p.gold / 1000 * D.PRICES_EGP.gold_per_kg)
        + (p.silver / 1000 * D.PRICES_EGP.silver_per_kg)
        + (p.aluminum * D.PRICES_EGP.aluminum_per_tonne / 1000);
    }
    bus.emit('handoffs:new', h);
  }

  // ── Proofs of treatment → WMRA verify queue
  if (world.tick % 5 === 0 && world.handoffs.length > 0) {
    const h = world.handoffs[Math.floor(rng() * Math.min(5, world.handoffs.length))];
    const proof = { id: `PROOF-${world.tick}`, refiner: h.refiner, kg: h.kg, ts: world.simMinutes };
    world.proofs.unshift(proof);
    if (world.proofs.length > 15) world.proofs.pop();
    world.verificationsPending++;
    world.wmra.verifyQueue.unshift(proof);
    if (world.wmra.verifyQueue.length > 10) world.wmra.verifyQueue.pop();
    bus.emit('proofs:new', proof);
  }

  // ── WMRA approves — releases escrow
  if (world.tick % 6 === 0 && world.wmra.verifyQueue.length > 3) {
    const p = world.wmra.verifyQueue.pop();
    world.verificationsPending = Math.max(0, world.verificationsPending - 1);
    world.verificationsDone++;
    world.wmra.approvedToday++;
    const release = p.kg * 55; // approx per-kg escrow release
    world.escrowReleased += release;
    world.escrowHeld = Math.max(0, world.escrowHeld - release);
    world.wmra.statutory5pct += release * D.SPLIT_PROPOSED.wmra;
    world.board.quarterlyFinancial.wmra += release * D.SPLIT_PROPOSED.wmra;
    world.board.quarterlyFinancial.consortium += release * D.SPLIT_PROPOSED.consortium;
    world.board.quarterlyFinancial.ops += release * D.SPLIT_PROPOSED.operations;
    world.board.quarterlyFinancial.collectors += release * D.SPLIT_PROPOSED.collectors;
    world.board.quarterlyFinancial.refiners += release * D.SPLIT_PROPOSED.refiners;
    if (p.refiner.name_en === world.refiner.id) world.refiner.revenueEscrow += release * D.SPLIT_PROPOSED.refiners;
    // Some of the collector share is Dr.WEEE
    if (Math.random() < 0.3) world.collector.weeklyEarnings += release * D.SPLIT_PROPOSED.collectors;
    bus.emit('verify:done', p);
  }

  // ── Certificates issued periodically
  if (world.tick % 7 === 0 && world.verificationsDone > 0) {
    world.certificatesIssued++;
    world.carbonCredits++;
    if (world.tick % 14 === 0) world.cbamCovers++;
    if (rng() < 0.15) {
      world.producer.certs.unshift({ ts: world.simMinutes, type: 'epr+carbon' });
      if (world.producer.certs.length > 8) world.producer.certs.pop();
    }
    bus.emit('certs:issued', null);
  }

  // ── Citizen returns occasionally
  if (world.tick % 11 === 0) {
    const pts = Math.floor(D.between(rng, 40, 200));
    world.citizenPoints += pts;
    world.citizenReturns++;
    bus.emit('citizen:return', { points: pts });
  }

  // ── Board approvals
  if (world.tick % 4 === 0) {
    world.board.pendingApprovals.unshift({ id: `APR-${world.tick}`, ts: world.simMinutes });
    if (world.board.pendingApprovals.length > 8) world.board.pendingApprovals.pop();
    world.board.approvedToday++;
    bus.emit('board:approval', null);
  }

  // ── Tick global
  bus.emit('tick', { tick: world.tick, simMinutes: world.simMinutes });
}

function extractMetals(kg) {
  // Simplified extraction — proportional to typical WEEE composition
  return {
    copper: kg * 0.14,   // 14% Cu
    gold: kg * 0.00025,  // 0.025% Au (mostly in PCBs)
    silver: kg * 0.001,  // 0.1% Ag
    aluminum: kg * 0.09, // 9% Al
  };
}

function generateWorkOrder(rng) {
  const refiner = D.pick(rng, D.REFINERS);
  const gov = D.pickWeighted(rng, D.GOVERNORATES, D.GOVERNORATES.map(g => g.weight));
  const collectors = ['Dr.WEEE Haram', 'Cairo Collectors Union', 'Delta Collect', 'Alex Recovery'];
  const collector = D.pick(rng, collectors);
  const kg = D.between(rng, 60, 280);
  return { id: `WO-${world.tick}`, refiner, gov, collector, kg, ts: world.simMinutes };
}

// ═══════════ RENDER LOOP (rAF, interpolated) ═══════════
function renderTick() {
  // Update clock
  const cv = $('simClockValue');
  if (cv) cv.textContent = formatSimTime();

  // Update hero + pulse tickers via animation
  updateNumberEl('heroTonnes', world.tonnesToday, 1);
  updateNumberEl('heroEscrow', world.escrowHeld, 0);
  updateNumberEl('heroCerts', world.certificatesIssued, 0);
  updateNumberEl('pulseTonnes', world.tonnesToday, 1);
  updateNumberEl('pulseEscrow', world.escrowHeld, 0);
  updateNumberEl('pulseCerts', world.certificatesIssued, 0);

  // Update persona chooser cards' KPIs
  const kpiMap = {
    producer:  fmtEgp(world.producer.fee_egp) + ' EGP',
    citizen:   fmt(world.citizenPoints) + ' pts',
    collector: fmt(world.collector.activeOrders),
    refiner:   fmtKg(world.refiner.metals.copper) + ' kg Cu',
    wmra:      fmt(world.verificationsPending),
    board:     fmt(world.board.pendingApprovals.length),
  };
  Object.keys(kpiMap).forEach(id => {
    const el = document.querySelector(`.sim-persona-kpi-val[data-persona="${id}"]`);
    if (el) el.textContent = kpiMap[id];
  });

  // Update national tickers if act 3 visible
  if (curAct === 3) updateNationalTickers();

  renderRaf = requestAnimationFrame(renderTick);
}
function updateNumberEl(id, target, decimals = 0) {
  const el = $(id);
  if (!el) return;
  const cur = parseFloat(el.dataset.cur || '0');
  const next = cur + (target - cur) * 0.18; // ease toward target
  el.dataset.cur = next;
  el.textContent = fmt(next, { maximumFractionDigits: decimals });
}

// ═══════════ ENGINE CONTROL ═══════════
function startEngine() {
  if (world.running) return;
  world.running = true;
  lastStateTs = 0;
  stateTick();
  if (!renderRaf) renderRaf = requestAnimationFrame(renderTick);
}
function stopEngine() {
  world.running = false;
  if (stateTimer) clearTimeout(stateTimer);
  if (renderRaf) cancelAnimationFrame(renderRaf);
  renderRaf = null;
}

// ═══════════ ACT NAVIGATION ═══════════
let curAct = 1;
function goToAct(n) {
  curAct = n;
  document.querySelectorAll('.sim-act').forEach(el => el.classList.toggle('active', parseInt(el.dataset.act, 10) === n));
  const p = paramsIn();
  const url = new URL(location.href);
  url.searchParams.set('act', String(n));
  if (curPersona) url.searchParams.set('persona', curPersona);
  url.searchParams.set('seed', String(world.seed));
  history.replaceState({}, '', url);

  if (n === 3) buildNational();
}

// ═══════════ ACT 1 — PERSONA GRID ═══════════
function buildPersonaGrid() {
  const grid = $('personaGrid');
  grid.innerHTML = '';
  D.PERSONAS.forEach(p => {
    const key = p.id;
    const card = document.createElement('button');
    card.className = 'sim-persona-card';
    card.dataset.persona = key;
    card.innerHTML = `
      <div class="sim-persona-glyph">${p.glyph}</div>
      <div class="sim-persona-name" data-i18n="sim.personas.${key}.name"></div>
      <div class="sim-persona-who" data-i18n="sim.personas.${key}.who"></div>
      <div class="sim-persona-kpi">
        <span class="sim-persona-kpi-label" data-i18n="sim.personas.${key}.kpi"></span>
        <span class="sim-persona-kpi-val" data-persona="${key}">—</span>
      </div>
      <div class="sim-persona-enter" data-i18n="sim.landing.enter"></div>
    `;
    card.addEventListener('click', () => enterPersona(key));
    grid.appendChild(card);
  });
  applyI18n();
}

// ═══════════ ACT 2 — DASHBOARDS ═══════════
let curPersona = null;
let curTab = 0;

function enterPersona(id) {
  curPersona = id;
  curTab = 0;
  const p = D.PERSONAS.find(x => x.id === id);
  if (!p) return;
  $('dashGlyph').textContent = p.glyph;
  $('dashName').textContent = uiLang === 'ar' ? get(`sim.personas.${id}.name`) : get(`sim.personas.${id}.name`);
  $('dashWho').textContent = get(`sim.personas.${id}.who`);
  buildTabs(id);
  renderTab(id, curTab);
  buildStoryTrack(id);
  buildPulse();
  goToAct(2);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function buildTabs(persona) {
  const tabsRoot = $('dashTabs');
  const labels = I18N[uiLang].sim[persona].tabs;
  const order = Object.keys(labels);
  tabsRoot.innerHTML = '';
  order.forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'sim-dash-tab' + (i === curTab ? ' active' : '');
    b.dataset.tab = i;
    b.dataset.tabKey = key;
    b.innerHTML = `<span class="sim-dash-tab-num">${String(i + 1).padStart(2, '0')}</span><span>${labels[key]}</span>`;
    b.addEventListener('click', () => { curTab = i; renderTab(persona, i); highlightTab(i); highlightStory(i); });
    tabsRoot.appendChild(b);
  });
}
function highlightTab(idx) {
  document.querySelectorAll('.sim-dash-tab').forEach((b, i) => b.classList.toggle('active', i === idx));
}

function buildStoryTrack(persona) {
  const track = $('storyTrack');
  const steps = I18N[uiLang].sim.story[persona] || [];
  track.innerHTML = '';
  steps.forEach((label, i) => {
    const s = document.createElement('div');
    s.className = 'sim-story-step' + (i === curTab ? ' current' : (i < curTab ? ' done' : ''));
    s.innerHTML = `<span class="sim-story-num">${String(i + 1).padStart(2, '0')}</span><span>${label}</span>`;
    s.addEventListener('click', () => { curTab = i; renderTab(persona, i); highlightTab(i); highlightStory(i); });
    track.appendChild(s);
  });
}
function highlightStory(idx) {
  document.querySelectorAll('.sim-story-step').forEach((s, i) => {
    s.classList.remove('current', 'done');
    if (i < idx) s.classList.add('done');
    if (i === idx) s.classList.add('current');
  });
}

// ═══════════ PERSONA TAB RENDERERS ═══════════
function renderTab(persona, tabIdx) {
  const root = $('dashContent');
  const labels = I18N[uiLang].sim[persona].tabs;
  const keys = Object.keys(labels);
  const tabKey = keys[tabIdx];
  const t = I18N[uiLang].sim[persona][tabKey] || { title: labels[tabKey] };

  root.innerHTML = '';
  root.appendChild(makeTitle(t.title || labels[tabKey]));

  const renderer = TAB_RENDERERS[persona] && TAB_RENDERERS[persona][tabKey];
  if (renderer) renderer(root, t);
  else root.appendChild(makeHint('Coming soon.'));
}

function makeTitle(text) {
  const el = document.createElement('div');
  el.className = 'sim-tab-title';
  el.textContent = text;
  return el;
}
function makeHint(text) {
  const el = document.createElement('div');
  el.className = 'sim-tab-hint';
  el.textContent = text;
  return el;
}
function makeMetric(label, value, sub) {
  const el = document.createElement('div');
  el.className = 'sim-metric';
  el.innerHTML = `
    <div class="sim-metric-label">${label}</div>
    <div class="sim-metric-value">${value}</div>
    ${sub ? `<div class="sim-metric-sub">${sub}</div>` : ''}
  `;
  return el;
}
function makeMetricRow(items) {
  const row = document.createElement('div');
  row.className = 'sim-metric-row';
  items.forEach(m => row.appendChild(m));
  return row;
}
function makeFeed(id) {
  const ul = document.createElement('ul');
  ul.className = 'sim-feed';
  ul.id = id;
  return ul;
}
function feedItem(time, main, right) {
  const li = document.createElement('li');
  li.className = 'sim-feed-item';
  li.innerHTML = `<span class="sim-feed-time">${time}</span><div class="sim-feed-main">${main}</div><div class="sim-feed-right">${right || ''}</div>`;
  return li;
}
function timeShort(simMinutes) {
  const h = Math.floor((simMinutes % (60 * 24)) / 60);
  const m = Math.floor(simMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ═══════════ PRODUCER TABS ═══════════
const TAB_RENDERERS = {
  producer: {
    obligation(root, t) {
      root.appendChild(makeHint(t.liveHint || ''));
      root.appendChild(makeMetricRow([
        makeMetric(t.declared, fmt(world.producer.shipments)),
        makeMetric(t.weight, fmtKg(world.producer.obligation_kg) + ' kg'),
        makeMetric(t.due, fmtEgp(world.producer.fee_egp) + ' EGP'),
      ]));
      const feedTitle = document.createElement('div');
      feedTitle.className = 'sim-tab-hint';
      feedTitle.textContent = t.feed;
      root.appendChild(feedTitle);
      const feed = makeFeed('prodFeed');
      root.appendChild(feed);
      renderProducerFeed();

      const off = bus.on('imports:new', () => renderProducerFeed());
      root.dataset.cleanup = registerCleanup(off);
    },
    credit(root, t) {
      const net = Math.max(0, world.producer.flowB_paid - world.producer.flowA_credit);
      root.appendChild(makeMetricRow([
        makeMetric(t.flowB, fmtEgp(world.producer.flowB_paid) + ' EGP'),
        makeMetric(t.flowA, fmtEgp(world.producer.flowA_credit) + ' EGP'),
        makeMetric(t.net, fmtEgp(net) + ' EGP'),
      ]));
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = t.via;
      root.appendChild(hint);
      // Simulate Flow A credit growing over time
      const off = bus.on('citizen:return', (e) => {
        world.producer.flowA_credit += e.points * 12;
        renderTab('producer', curTab);
      });
      root.dataset.cleanup = registerCleanup(off);
    },
    escrow(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.gateway, fmtEgp(world.producer.fee_egp) + ' EGP'),
        makeMetric(get('sim.national.tickers.escrow'), fmtEgp(world.escrowHeld) + ' EGP'),
      ]));
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = t.ringfenced;
      root.appendChild(hint);
      const feed = makeFeed('escrowFeed');
      root.appendChild(feed);
      const items = world.imports.filter(i => i.producer.id === world.producer.id).slice(0, 8);
      items.forEach(i => feed.appendChild(feedItem(timeShort(i.ts), `<b>${i.producer.name_en}</b> · ${i.units} × ${i.device.name_en}`, fmtEgp(i.fee_egp) + ' EGP')));
    },
    certs(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.epr, fmt(world.producer.certs.length)),
        makeMetric(t.carbon, fmt(world.producer.certs.length)),
      ]));
      const feed = makeFeed('certFeed');
      root.appendChild(feed);
      world.producer.certs.forEach((c, i) => {
        feed.appendChild(feedItem(timeShort(c.ts), `<b>${t.epr}</b> · #EPR-${String(2027001 + i).padStart(7, '0')}<br><span style="color:rgba(255,255,255,0.6)">${t.carbon} · GOEIC EVVU</span>`, `${t.issuedBy}: WMRA`));
      });
      if (world.producer.certs.length === 0) root.appendChild(makeHint('Awaiting first verification cycle.'));
    },
    cbam(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.coverage, fmt(Math.min(100, world.cbamCovers * 12)) + '%'),
        makeMetric(t.shipments, fmt(world.cbamCovers)),
      ]));
      const btn = document.createElement('button');
      btn.className = 'sim-btn sim-btn-ghost';
      btn.textContent = t.toggle;
      root.appendChild(btn);
    },
    quarterly(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.period, 'Q1 · 2027'),
        makeMetric(t.status, t.statusOn),
      ]));
      const btn = document.createElement('button');
      btn.className = 'sim-btn';
      btn.textContent = t.submit;
      root.appendChild(btn);
    },
  },

  citizen: {
    nearest(root, t) {
      const stores = [
        { name_ar: 'متجر ميزان · شيراتون النزهة', name_en: 'MIZAN Store · Sheraton El Nozha', distance: 0.6, eta: 4, open: true },
        { name_ar: 'كشك B.TECH · مصر الجديدة', name_en: 'B.TECH Kiosk · Heliopolis', distance: 2.3, eta: 12, open: true },
        { name_ar: 'راية · مدينة نصر', name_en: 'Raya · Nasr City', distance: 5.7, eta: 22, open: true },
      ];
      const feed = makeFeed('nearestFeed');
      root.appendChild(feed);
      stores.forEach(s => {
        feed.appendChild(feedItem(fmt(s.distance, { maximumFractionDigits: 1 }) + ' km', `<b>${uiLang === 'ar' ? s.name_ar : s.name_en}</b><br><span style="color:rgba(255,255,255,0.55)">${t.eta}: ${s.eta} min · ${t.openNow}</span>`, ''));
      });
    },
    value(root, t) {
      const dev = D.DEVICE_MODELS[3]; // laptop archetype
      root.appendChild(makeMetricRow([
        makeMetric(t.choose, dev.name_en),
        makeMetric(t.condition, uiLang === 'ar' ? 'يعمل جزئياً' : 'Partially working'),
        makeMetric(t.result, fmt(180) + ' pts'),
      ]));
      const btn = document.createElement('button');
      btn.className = 'sim-btn';
      btn.textContent = uiLang === 'ar' ? 'أعِد التقييم' : 'Re-evaluate';
      root.appendChild(btn);
    },
    points(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.title, fmt(world.citizenPoints) + ' pts'),
      ]));
      const grid = document.createElement('div');
      grid.className = 'sim-metric-row';
      [t.electricity, t.water, t.metro, t.voucher].forEach(label => {
        const c = document.createElement('button');
        c.className = 'sim-btn sim-btn-ghost';
        c.textContent = `${t.redeem} · ${label}`;
        c.style.textAlign = 'start';
        grid.appendChild(c);
      });
      root.appendChild(grid);
    },
    history(root, t) {
      const feed = makeFeed('histFeed');
      root.appendChild(feed);
      if (world.citizenReturns === 0) root.appendChild(makeHint(t.empty));
      for (let i = 0; i < Math.min(6, world.citizenReturns); i++) {
        feed.appendChild(feedItem(`Day ${i + 1}`, uiLang === 'ar' ? '<b>هاتف قديم</b>' : '<b>Old phone</b>', '+' + fmt(150 + i * 10) + ' pts'));
      }
    },
    impact(root, t) {
      const kg = world.citizenReturns * 2.4;
      root.appendChild(makeMetricRow([
        makeMetric(t.kgDiverted, fmtKg(kg) + ' kg'),
        makeMetric(t.co2, fmtKg(kg * 1.7) + ' kg'),
        makeMetric(t.waterSaved, fmt(kg * 8000) + ' L'),
      ]));
    },
    learn(root, t) {
      [t.l1, t.l2, t.l3].forEach(line => {
        const p = document.createElement('div');
        p.style.padding = '14px 16px';
        p.style.background = 'rgba(200,169,81,0.06)';
        p.style.border = '1px solid rgba(200,169,81,0.2)';
        p.style.borderRadius = '6px';
        p.style.marginBottom = '10px';
        p.style.lineHeight = '1.6';
        p.innerHTML = '<span style="color:var(--gold)">◆</span>&nbsp;&nbsp;' + line;
        root.appendChild(p);
      });
    },
  },

  collector: {
    queue(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.title, fmt(world.collector.activeOrders)),
      ]));
      const feed = makeFeed('woFeed');
      root.appendChild(feed);
      renderCollectorFeed();
      const off = bus.on('orders:new', () => renderCollectorFeed());
      root.dataset.cleanup = registerCleanup(off);
    },
    route(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.stops, fmt(6)),
        makeMetric(t.eta, '4h 20m'),
        makeMetric(t.km, fmt(87) + ' km'),
      ]));
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = uiLang === 'ar'
        ? 'الطرق مُحسَّنة بحسب الوزن والوقت وكفاءة استهلاك الوقود.'
        : 'Routes optimised for weight × time × fuel efficiency.';
      root.appendChild(hint);
    },
    scanner(root, t) {
      const box = document.createElement('div');
      box.style.padding = '18px';
      box.style.background = 'rgba(200,169,81,0.05)';
      box.style.border = '1px solid rgba(200,169,81,0.3)';
      box.style.borderRadius = '8px';
      box.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px">
          <div><div class="sim-metric-label">${t.device}</div><div class="sim-metric-value" style="font-size:16px">Laptop × 12</div></div>
          <div><div class="sim-metric-label">${t.weight}</div><div class="sim-metric-value">25.2</div></div>
          <div><div class="sim-metric-label">${t.batch}</div><div class="sim-metric-value" style="font-size:14px">DrW-2027-0142</div></div>
        </div>
        <button class="sim-btn">${t.log}</button>
      `;
      root.appendChild(box);
    },
    manifest(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.to, 'REMIT Cairo'),
        makeMetric(t.contents, fmtKg(320) + ' kg'),
        makeMetric(t.seal, 'MZN-SEAL-0918'),
      ]));
    },
    earnings(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.weekly, fmtEgp(world.collector.weeklyEarnings) + ' EGP'),
        makeMetric(t.monthly, fmtEgp(world.collector.weeklyEarnings * 4.2) + ' EGP'),
        makeMetric(t.perTonne, fmtEgp(1580) + ' EGP'),
      ]));
    },
    score(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.current, fmt(world.collector.score)),
        makeMetric(t.trend, '↗ +3 pts'),
        makeMetric(t.rank, '#' + fmt(world.collector.rank)),
      ]));
      const p = document.createElement('div');
      p.className = 'sim-progress';
      p.innerHTML = `<div class="sim-progress-fill" style="width:${world.collector.score}%"></div>`;
      root.appendChild(p);
    },
  },

  refiner: {
    incoming(root, t) {
      const feed = makeFeed('refInc');
      root.appendChild(feed);
      renderRefinerFeed();
      const off = bus.on('handoffs:new', () => renderRefinerFeed());
      root.dataset.cleanup = registerCleanup(off);
    },
    index(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.tier, 'T4'),
        makeMetric(t.score, fmt(world.refiner.score)),
        makeMetric(t.band, 'Excellence'),
      ]));
      const p = document.createElement('div');
      p.className = 'sim-progress';
      p.innerHTML = `<div class="sim-progress-fill" style="width:${world.refiner.score}%"></div>`;
      root.appendChild(p);
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = t.parity;
      root.appendChild(hint);
    },
    treatment(root, t) {
      const stages = uiLang === 'ar'
        ? ['استلام', 'تفكيك', 'فرم', 'فصل', 'استخلاص كيميائي', 'رفع الإثبات']
        : ['Receive', 'Dismantle', 'Shred', 'Sort', 'Chemical extraction', 'Upload proof'];
      const grid = document.createElement('div');
      grid.className = 'sim-metric-row';
      stages.forEach((s, i) => {
        const c = makeMetric(String(i + 1).padStart(2, '0'), s, i < 4 ? '✓' : '');
        grid.appendChild(c);
      });
      root.appendChild(grid);
      const btn = document.createElement('button');
      btn.className = 'sim-btn';
      btn.textContent = t.upload;
      root.appendChild(btn);
    },
    metals(root, t) {
      const cuKg = world.refiner.metals.copper;
      const auG = world.refiner.metals.gold;
      const agG = world.refiner.metals.silver;
      const alKg = world.refiner.metals.aluminum;
      const cuVal = cuKg / 1000 * D.PRICES_EGP.copper_per_tonne;
      const auVal = auG / 1000 * D.PRICES_EGP.gold_per_kg;
      const agVal = agG / 1000 * D.PRICES_EGP.silver_per_kg;
      const alVal = alKg / 1000 * D.PRICES_EGP.aluminum_per_tonne;
      root.appendChild(makeMetricRow([
        makeMetric(t.copper, fmtKg(cuKg) + ' kg', fmtEgp(cuVal) + ' EGP'),
        makeMetric(t.gold, fmt(auG, { maximumFractionDigits: 2 }) + ' g', fmtEgp(auVal) + ' EGP'),
        makeMetric(t.silver, fmt(agG, { maximumFractionDigits: 1 }) + ' g', fmtEgp(agVal) + ' EGP'),
        makeMetric(t.aluminum, fmtKg(alKg) + ' kg', fmtEgp(alVal) + ' EGP'),
      ]));
      const total = cuVal + auVal + agVal + alVal;
      const totalMetric = makeMetric(t.value, fmtEgp(total) + ' EGP');
      totalMetric.classList.add('big');
      root.appendChild(totalMetric);
    },
    revenue(root, t) {
      const total = world.refiner.revenueEscrow + world.refiner.revenueMetals;
      root.appendChild(makeMetricRow([
        makeMetric(t.escrow, fmtEgp(world.refiner.revenueEscrow) + ' EGP'),
        makeMetric(t.metals, fmtEgp(world.refiner.revenueMetals) + ' EGP'),
        makeMetric(t.total, fmtEgp(total) + ' EGP'),
      ]));
    },
    weeelabex(root, t) {
      const checks = ['EN 50625-1', 'EN 50625-2-1', 'EN 50625-2-2', 'EN 50625-2-3', 'EN 50625-3-1', 'EN 50614'];
      const grid = document.createElement('div');
      grid.className = 'sim-metric-row';
      checks.forEach(c => grid.appendChild(makeMetric(c, '✓', 'compliant')));
      root.appendChild(grid);
    },
  },

  wmra: {
    verify(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(get('sim.national.tickers.verifications'), fmt(world.verificationsPending), t.title),
      ]));
      const feed = makeFeed('verifyFeed');
      root.appendChild(feed);
      renderWmraFeed();
      const off = bus.on('proofs:new', () => renderWmraFeed());
      const off2 = bus.on('verify:done', () => renderWmraFeed());
      root.dataset.cleanup = registerCleanup(off, off2);
    },
    audit(root, t) {
      const box = document.createElement('div');
      box.innerHTML = `
        <input type="text" placeholder="${t.search}" style="width:100%;padding:12px 14px;border-radius:4px;border:1px solid rgba(200,169,81,0.3);background:rgba(255,255,255,0.06);color:white;font-family:var(--font-mono);font-size:13px" />
      `;
      root.appendChild(box);
      const feed = makeFeed('auditFeed');
      root.appendChild(feed);
      const sample = ['IMP-0421 → WO-0424 → MAN-0429 → PROOF-0434 → EPR-0117 · Samsung Egypt · 218 kg · issued',
                     'IMP-0416 → WO-0420 → MAN-0423 → PROOF-0429 → EPR-0116 · OPPO Egypt · 142 kg · issued',
                     'IMP-0410 → WO-0414 → MAN-0418 → PROOF-0421 → EPR-0115 · HP Middle East · 380 kg · issued'];
      sample.forEach(s => feed.appendChild(feedItem('AUDIT', s, '')));
    },
    kpis(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.total, fmtKg(world.cumulativeTonnes) + ' t'),
        makeMetric(t.producers, fmt(D.NATIONAL_BASELINE.producers_registered_q1)),
        makeMetric(t.collectors, fmt(D.NATIONAL_BASELINE.collectors_registered_q1)),
        makeMetric(t.flags, fmt(Math.max(0, 12 - world.wmra.approvedToday))),
      ]));
    },
    heatmap(root, t) {
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(8, 1fr)';
      grid.style.gap = '4px';
      D.REFINERS.slice(0, 44).forEach(r => {
        const cell = document.createElement('div');
        const band = r.score >= 100 ? 'excellent' : r.score >= 85 ? 'strong' : r.score >= 70 ? 'standard' : r.score >= 50 ? 'probation' : 'below';
        const colors = { excellent: 'rgba(240,217,138,0.55)', strong: 'rgba(200,169,81,0.4)', standard: 'rgba(200,169,81,0.18)', probation: 'rgba(232,168,95,0.35)', below: 'rgba(181,69,58,0.45)' };
        cell.style.aspectRatio = '1';
        cell.style.background = colors[band];
        cell.style.border = '1px solid rgba(200,169,81,0.25)';
        cell.style.borderRadius = '3px';
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.fontFamily = 'var(--font-mono)';
        cell.style.fontSize = '10px';
        cell.style.color = 'var(--navy)';
        cell.style.fontWeight = '700';
        cell.title = `${r.name_en} · T${r.tier} · Score ${r.score}`;
        cell.textContent = 'T' + r.tier;
        grid.appendChild(cell);
      });
      root.appendChild(grid);
    },
    share(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.proposed, '5%'),
        makeMetric(t.ytd, fmtEgp(world.wmra.statutory5pct) + ' EGP'),
      ]));
    },
    report(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.period, 'Q1 · 2027'),
      ]));
      const box = document.createElement('div');
      box.style.padding = '18px';
      box.style.background = 'rgba(255,255,255,0.05)';
      box.style.border = '1px solid rgba(200,169,81,0.3)';
      box.style.borderRadius = '6px';
      box.style.marginBottom = '14px';
      box.style.fontSize = '13px';
      box.style.lineHeight = '1.65';
      const executiveText = uiLang === 'ar'
        ? `<b>${t.exec}</b><br>خلال الربع الأول 2027، تولّت WMRA الإشراف على ${fmt(world.wmra.approvedToday)} عملية تحقّق أُنجزت بنجاح. تراكم في ضمان e-Finance ${fmtEgp(world.escrowHeld)} جنيه، وصُرِف منه ${fmtEgp(world.escrowReleased)}. حصّة الجهاز السيادية بلغت ${fmtEgp(world.wmra.statutory5pct)} جنيه.`
        : `<b>${t.exec}</b><br>During Q1 2027, WMRA supervised ${fmt(world.wmra.approvedToday)} verifications. e-Finance escrow accumulated ${fmtEgp(world.escrowHeld)} EGP; ${fmtEgp(world.escrowReleased)} was released. WMRA statutory share reached ${fmtEgp(world.wmra.statutory5pct)} EGP.`;
      box.innerHTML = executiveText;
      root.appendChild(box);
      const btn = document.createElement('button');
      btn.className = 'sim-btn';
      btn.textContent = t.download;
      root.appendChild(btn);
    },
  },

  board: {
    approvals(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.title, fmt(world.board.pendingApprovals.length)),
      ]));
      const feed = makeFeed('boardFeed');
      root.appendChild(feed);
      world.board.pendingApprovals.forEach(a => {
        feed.appendChild(feedItem(timeShort(a.ts), `<b>${a.id}</b> · ${t.criteria}`, `<button class="sim-btn" style="padding:4px 10px;font-size:11px">${t.signOff}</button>`));
      });
    },
    transparency(root, t) {
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = uiLang === 'ar'
        ? 'مخرَجات الخوارزم منشورة كاملةً · لا سلطة تفضيل خفيّة.'
        : 'Algorithm outputs are fully public — no hidden preference power.';
      root.appendChild(hint);
      const feed = makeFeed('transFeed');
      root.appendChild(feed);
      world.workOrders.slice(0, 6).forEach(w => {
        feed.appendChild(feedItem(w.id, `<b>${w.refiner.name_en}</b> · T${w.refiner.tier} · Score ${w.refiner.score}<br><span style="color:rgba(255,255,255,0.5)">${uiLang === 'ar' ? 'المحافظة' : 'Governorate'}: ${uiLang === 'ar' ? w.gov.name_ar : w.gov.name_en}</span>`, fmtKg(w.kg) + ' kg'));
      });
    },
    registry(root, t) {
      root.appendChild(makeMetricRow([
        makeMetric(t.registered, fmt(D.NATIONAL_BASELINE.producers_registered_q1)),
        makeMetric(t.pending, fmt(D.PRODUCERS.length + 20 - D.NATIONAL_BASELINE.producers_registered_q1)),
      ]));
      const feed = makeFeed('regFeed');
      root.appendChild(feed);
      D.PRODUCERS.slice(0, 10).forEach(p => {
        feed.appendChild(feedItem('◆', uiLang === 'ar' ? p.name_ar : p.name_en, uiLang === 'ar' ? 'مسجّل' : 'Registered'));
      });
    },
    financial(root, t) {
      root.appendChild(makeHint(t.proposed));
      const f = world.board.quarterlyFinancial;
      const total = f.wmra + f.consortium + f.ops + f.collectors + f.refiners;
      root.appendChild(makeMetricRow([
        makeMetric(t.wmra + ' · 5%', fmtEgp(f.wmra) + ' EGP'),
        makeMetric(t.consortium + ' · 15%', fmtEgp(f.consortium) + ' EGP'),
        makeMetric(t.operations + ' · 15%', fmtEgp(f.ops) + ' EGP'),
        makeMetric(t.collectors + ' · 35%', fmtEgp(f.collectors) + ' EGP'),
        makeMetric(t.refiners + ' · 30%', fmtEgp(f.refiners) + ' EGP'),
      ]));
      const totalMetric = makeMetric(uiLang === 'ar' ? 'الإجمالي المُصرَف' : 'Total released', fmtEgp(total) + ' EGP');
      totalMetric.classList.add('big');
      root.appendChild(totalMetric);
    },
    weeeforum(root, t) {
      const rows = ['crit_a', 'crit_b', 'crit_c', 'crit_d', 'crit_e'];
      const crit = D.WEEE_FORUM_CRITERIA;
      const grid = document.createElement('div');
      grid.className = 'sim-metric-row';
      rows.forEach((k, i) => {
        const c = crit[i];
        const m = makeMetric(t[k], (c.status === 'satisfied' ? '✓' : '◐'), Math.round(c.progress * 100) + '%');
        grid.appendChild(m);
      });
      root.appendChild(grid);
      const hint = document.createElement('div');
      hint.className = 'sim-tab-hint';
      hint.textContent = t.target;
      root.appendChild(hint);
    },
    auditor(root, t) {
      const feed = makeFeed('audFeed');
      root.appendChild(feed);
      const findings = uiLang === 'ar'
        ? ['◆ حصر رأس المال المتراكم في الضمان مطابق تماماً لسجلات e-Finance', '◆ جميع أوامر التوجيه صادرة بمعايير معلنة', '◆ لا تعارض مصالح مسجّل']
        : ['◆ Escrow balance reconciles 100% with e-Finance ledger', '◆ All routing orders issued via published criteria', '◆ No conflicts of interest recorded'];
      findings.forEach(f => feed.appendChild(feedItem('◆', f, '✓')));
    },
  },
};

// ═══════════ FEED RENDERERS ═══════════
function renderProducerFeed() {
  const f = $('prodFeed'); if (!f) return;
  f.innerHTML = '';
  world.imports.filter(i => i.producer.id === world.producer.id).slice(0, 8).forEach(i =>
    f.appendChild(feedItem(timeShort(i.ts), `${uiLang === 'ar' ? i.producer.name_ar : i.producer.name_en} · ${i.units} × ${i.device.name_en}`, fmtKg(i.kg) + ' kg · ' + fmtEgp(i.fee_egp) + ' EGP'))
  );
  if (f.children.length === 0) f.appendChild(feedItem('—', uiLang === 'ar' ? 'بانتظار أول شحنة …' : 'Awaiting first shipment …', ''));
}
function renderCollectorFeed() {
  const f = $('woFeed'); if (!f) return;
  f.innerHTML = '';
  world.workOrders.slice(0, 8).forEach(w =>
    f.appendChild(feedItem(w.id, `<b>${w.refiner.name_en}</b> · ${uiLang === 'ar' ? w.gov.name_ar : w.gov.name_en}`, fmtKg(w.kg) + ' kg'))
  );
}
function renderRefinerFeed() {
  const f = $('refInc'); if (!f) return;
  f.innerHTML = '';
  world.refiner.incoming.slice(0, 8).forEach(m =>
    f.appendChild(feedItem(m.id, `<b>${uiLang === 'ar' ? 'من الجامع' : 'from collector'}</b>`, fmtKg(m.kg) + ' kg'))
  );
  if (f.children.length === 0) f.appendChild(feedItem('—', uiLang === 'ar' ? 'بانتظار أول منافيست …' : 'Awaiting first manifest …', ''));
}
function renderWmraFeed() {
  const f = $('verifyFeed'); if (!f) return;
  f.innerHTML = '';
  world.wmra.verifyQueue.slice(0, 8).forEach(p =>
    f.appendChild(feedItem(p.id, `<b>${p.refiner.name_en}</b>`, `<button class="sim-btn" style="padding:4px 10px;font-size:11px">${get('sim.wmra.verify.approve')}</button>`))
  );
  if (f.children.length === 0) f.appendChild(feedItem('—', uiLang === 'ar' ? 'الطابور فارغ حالياً.' : 'Queue empty right now.', ''));
}

// ═══════════ CLEANUP REGISTRY (for tab changes) ═══════════
const cleanups = new Map();
let cleanupCounter = 0;
function registerCleanup(...fns) {
  const key = String(++cleanupCounter);
  cleanups.set(key, fns);
  return key;
}
function runCleanups() {
  cleanups.forEach(fns => fns.forEach(fn => { try { fn(); } catch (e) {} }));
  cleanups.clear();
}

// ═══════════ SYSTEM PULSE MINI-SVG ═══════════
function buildPulse() {
  const svg = $('pulseSvg');
  if (!svg) return;
  svg.innerHTML = `
    <defs>
      <radialGradient id="pulseGold" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0%" stop-color="#D9B968"/>
        <stop offset="100%" stop-color="#9C7E38"/>
      </radialGradient>
    </defs>
    <circle cx="120" cy="160" r="42" fill="url(#pulseGold)"/>
    <text x="120" y="164" text-anchor="middle" fill="white" font-size="10" font-weight="800" font-family="Inter">MIZAN</text>
    <text x="120" y="175" text-anchor="middle" fill="white" font-size="7" font-family="Inter">PRO</text>

    <rect x="12" y="140" width="60" height="26" rx="3" fill="#5C93BF" stroke="#3D77A8"/>
    <text x="42" y="156" text-anchor="middle" fill="#0F2C4D" font-size="9" font-weight="700">ChemiCan</text>

    <ellipse cx="200" cy="60" rx="30" ry="20" fill="#7BAECC" stroke="#3D77A8"/>
    <text x="200" y="63" text-anchor="middle" fill="white" font-size="8" font-weight="700" font-family="Inter">Refiner</text>

    <rect x="180" y="240" width="50" height="26" rx="3" fill="#5C93BF" stroke="#3D77A8"/>
    <text x="205" y="256" text-anchor="middle" fill="#0F2C4D" font-size="8" font-weight="700">Producer</text>

    <ellipse cx="80" cy="60" rx="30" ry="20" fill="#3D77A8" stroke="#0F2C4D"/>
    <text x="80" y="58" text-anchor="middle" fill="white" font-size="7" font-weight="700">WMRA</text>
    <text x="80" y="68" text-anchor="middle" fill="white" font-size="7" font-weight="700">Officer</text>

    <line x1="72" y1="153" x2="80" y2="153" stroke="#1F6DC1" stroke-width="1.5"/>
    <path d="M 155 155 Q 190 100 200 80" stroke="#6B4E9E" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
    <path d="M 195 240 Q 155 195 155 175" stroke="#2E7D4F" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
    <path d="M 110 75 Q 100 130 100 145" stroke="#C8442A" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
  `;
}

// ═══════════ ACT 3 — NATIONAL VIEW ═══════════
function buildNational() {
  const svg = $('natSvg');
  const tickers = $('natTickers');
  svg.innerHTML = `
    <defs>
      <radialGradient id="natGold" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0%" stop-color="#D9B968"/>
        <stop offset="100%" stop-color="#9C7E38"/>
      </radialGradient>
      <radialGradient id="natBlue" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0%" stop-color="#A8CDE6"/>
        <stop offset="100%" stop-color="#5C93BF"/>
      </radialGradient>
      <radialGradient id="natBlueDark" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0%" stop-color="#7BAECC"/>
        <stop offset="100%" stop-color="#3D77A8"/>
      </radialGradient>
      <marker id="nat-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="#333"/>
      </marker>
    </defs>

    <!-- Center: Mizan PRO -->
    <g class="nat-node" data-node="wmra-consortium">
      <circle cx="650" cy="350" r="90" fill="url(#natGold)" stroke="#7A5F2A" stroke-width="2"/>
      <text x="650" y="345" text-anchor="middle" fill="white" font-size="18" font-weight="900" font-family="Inter">MIZAN</text>
      <text x="650" y="365" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="Inter">Consortium + Ops</text>
    </g>

    <!-- Producer -->
    <g class="nat-node" data-node="producer" style="cursor:pointer">
      <rect x="1050" y="300" width="180" height="90" rx="6" fill="url(#natBlue)" stroke="#3D77A8"/>
      <text x="1140" y="330" text-anchor="middle" fill="#0F2C4D" font-size="14" font-weight="800" font-family="Inter">◈ ${get('sim.personas.producer.name')}</text>
      <text x="1140" y="352" text-anchor="middle" fill="#0F2C4D" font-size="10">Samsung · OPPO · HP …</text>
      <text x="1140" y="372" text-anchor="middle" fill="#0F2C4D" font-size="10" font-weight="700"><tspan id="natProducerCount">0</tspan> shipments</text>
    </g>

    <!-- Citizen -->
    <g class="nat-node" data-node="citizen" style="cursor:pointer">
      <rect x="1050" y="440" width="180" height="80" rx="6" fill="url(#natBlue)" stroke="#3D77A8"/>
      <text x="1140" y="468" text-anchor="middle" fill="#0F2C4D" font-size="14" font-weight="800" font-family="Inter">◉ ${get('sim.personas.citizen.name')}</text>
      <text x="1140" y="490" text-anchor="middle" fill="#0F2C4D" font-size="10">B.TECH · Metro · MIZAN Stores</text>
      <text x="1140" y="508" text-anchor="middle" fill="#0F2C4D" font-size="10" font-weight="700"><tspan id="natCitizenPts">0</tspan> pts</text>
    </g>

    <!-- Collector -->
    <g class="nat-node" data-node="collector" style="cursor:pointer">
      <rect x="70" y="440" width="180" height="80" rx="6" fill="url(#natBlueDark)" stroke="#3D77A8"/>
      <text x="160" y="468" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="Inter">◆ ${get('sim.personas.collector.name')}</text>
      <text x="160" y="488" text-anchor="middle" fill="white" font-size="10">Dr.WEEE · 62 collectors</text>
      <text x="160" y="506" text-anchor="middle" fill="white" font-size="10" font-weight="700"><tspan id="natCollectorOrders">0</tspan> orders</text>
    </g>

    <!-- Refiner -->
    <g class="nat-node" data-node="refiner" style="cursor:pointer">
      <rect x="70" y="300" width="180" height="90" rx="6" fill="url(#natBlueDark)" stroke="#3D77A8"/>
      <text x="160" y="330" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="Inter">⬢ ${get('sim.personas.refiner.name')}</text>
      <text x="160" y="350" text-anchor="middle" fill="white" font-size="10">REMIT · 44 licensed</text>
      <text x="160" y="370" text-anchor="middle" fill="white" font-size="10" font-weight="700"><tspan id="natRefinerCu">0</tspan> kg Cu</text>
    </g>

    <!-- WMRA -->
    <g class="nat-node" data-node="wmra" style="cursor:pointer">
      <ellipse cx="650" cy="140" rx="130" ry="55" fill="url(#natBlueDark)" stroke="#3D77A8"/>
      <text x="650" y="132" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="Inter">⚖ WMRA</text>
      <text x="650" y="152" text-anchor="middle" fill="white" font-size="10">Sovereign regulator</text>
      <text x="650" y="170" text-anchor="middle" fill="white" font-size="10" font-weight="700"><tspan id="natWmraVerify">0</tspan> in queue</text>
    </g>

    <!-- Board -->
    <g class="nat-node" data-node="board" style="cursor:pointer">
      <ellipse cx="650" cy="580" rx="140" ry="55" fill="url(#natBlue)" stroke="#3D77A8"/>
      <text x="650" y="572" text-anchor="middle" fill="#0F2C4D" font-size="14" font-weight="800" font-family="Inter">◇ ${get('sim.personas.board.name')}</text>
      <text x="650" y="592" text-anchor="middle" fill="#0F2C4D" font-size="10">FEI Engineering + ICT Chambers</text>
      <text x="650" y="608" text-anchor="middle" fill="#0F2C4D" font-size="10" font-weight="700"><tspan id="natBoardApprovals">0</tspan> approvals</text>
    </g>

    <!-- Money arcs (gold) -->
    <path class="nat-arc money" d="M 1050 345 Q 850 200 740 340" stroke-width="2.5" fill="none" marker-end="url(#nat-arrow)"/>
    <path class="nat-arc money" d="M 650 260 Q 400 200 250 340" stroke-width="2" fill="none" opacity="0.7"/>
    <path class="nat-arc money" d="M 560 350 Q 400 420 250 440" stroke-width="2" fill="none" opacity="0.7"/>

    <!-- Material arcs (blue) -->
    <path class="nat-arc material" d="M 250 345 Q 400 300 560 350" stroke-width="2" fill="none" marker-end="url(#nat-arrow)"/>
    <path class="nat-arc material" d="M 1050 480 Q 650 500 250 460" stroke-width="2" fill="none" opacity="0.6"/>

    <!-- Governance / verification arcs (dashed dark) -->
    <path d="M 650 195 L 650 260" stroke="#333" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="4 4"/>
    <path d="M 650 440 L 650 525" stroke="#333" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="4 4"/>
  `;

  // Wire click-to-persona
  svg.querySelectorAll('.nat-node[style*="cursor"]').forEach(g => {
    g.addEventListener('click', () => {
      const persona = g.dataset.node;
      if (persona) enterPersona(persona);
    });
  });

  // Build national tickers
  const keys = ['tonnes', 'obligations', 'escrow', 'verifications', 'certs', 'carbon', 'cbam'];
  tickers.innerHTML = '';
  keys.forEach(k => {
    const el = document.createElement('div');
    el.className = 'sim-nat-ticker';
    el.innerHTML = `<div class="sim-nat-ticker-num" id="nat-${k}">0</div><div class="sim-nat-ticker-label">${get('sim.national.tickers.' + k)}</div>`;
    tickers.appendChild(el);
  });

  // Pulse node on relevant events
  bus.on('imports:new', () => pulseNode('producer'));
  bus.on('orders:new', () => pulseNode('collector'));
  bus.on('handoffs:new', () => pulseNode('refiner'));
  bus.on('verify:done', () => pulseNode('wmra'));
  bus.on('board:approval', () => pulseNode('board'));
  bus.on('citizen:return', () => pulseNode('citizen'));
}
function pulseNode(id) {
  if (curAct !== 3) return;
  const g = document.querySelector(`.nat-node[data-node="${id}"]`);
  if (!g) return;
  g.classList.add('pulse');
  setTimeout(() => g.classList.remove('pulse'), 900);
}
function updateNationalTickers() {
  const set = (id, v, dec = 0) => { const el = $('nat-' + id); if (el) el.textContent = fmt(v, { maximumFractionDigits: dec }); };
  set('tonnes', world.tonnesToday, 1);
  set('obligations', world.obligationsCalculated);
  set('escrow', world.escrowHeld);
  set('verifications', world.verificationsDone);
  set('certs', world.certificatesIssued);
  set('carbon', world.carbonCredits);
  set('cbam', world.cbamCovers);

  const setSvg = (id, v, dec = 0) => { const el = $(id); if (el) el.textContent = fmt(v, { maximumFractionDigits: dec }); };
  setSvg('natProducerCount', world.producer.shipments);
  setSvg('natCitizenPts', world.citizenPoints);
  setSvg('natCollectorOrders', world.collector.activeOrders);
  setSvg('natRefinerCu', world.refiner.metals.copper, 1);
  setSvg('natWmraVerify', world.verificationsPending);
  setSvg('natBoardApprovals', world.board.pendingApprovals.length);
}

// ═══════════ DOSSIER ═══════════
function openDossier() {
  const body = $('dossierBody');
  const persona = curPersona ? get(`sim.personas.${curPersona}.name`) : '—';
  const time = formatSimTime();
  body.innerHTML = `
    <h4>${persona}</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <div><b>${get('sim.simTime')}:</b> ${time}</div>
      <div><b>${get('sim.seed')}:</b> ${world.seed}</div>
      <div><b>${get('sim.national.tickers.tonnes')}:</b> ${fmtKg(world.cumulativeTonnes)} t</div>
      <div><b>${get('sim.national.tickers.escrow')}:</b> ${fmtEgp(world.escrowHeld)} EGP</div>
      <div><b>${get('sim.national.tickers.certs')}:</b> ${fmt(world.certificatesIssued)}</div>
      <div><b>${get('sim.national.tickers.carbon')}:</b> ${fmt(world.carbonCredits)}</div>
      <div><b>${get('sim.national.tickers.verifications')}:</b> ${fmt(world.verificationsDone)}</div>
      <div><b>${get('sim.national.tickers.cbam')}:</b> ${fmt(world.cbamCovers)}</div>
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px dashed rgba(200,169,81,0.4);font-size:10px;color:var(--muted)">
      ${get('sim.watermark')} · mizan.eco
    </div>
  `;
  $('dossierOverlay').classList.add('open');
  $('dossierOverlay').setAttribute('aria-hidden', 'false');
}
function closeDossier() {
  $('dossierOverlay').classList.remove('open');
  $('dossierOverlay').setAttribute('aria-hidden', 'true');
}

// ═══════════ CONTROLS WIRING ═══════════
function wireControls() {
  document.querySelectorAll('.sim-speed-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.sim-speed-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      world.speed = parseFloat(b.dataset.speed);
    });
  });
  $('simLang').addEventListener('click', () => {
    uiLang = uiLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('mizan-lang', uiLang);
    applyI18n();
    if (curAct === 1) buildPersonaGrid();
    if (curAct === 2) enterPersona(curPersona);
    if (curAct === 3) buildNational();
  });
  const gtn = $('gotoNational');
  if (gtn) gtn.addEventListener('click', () => goToAct(3));
  $('dossierBtn').addEventListener('click', openDossier);
  $('dossierClose').addEventListener('click', closeDossier);
  $('dossierOverlay').addEventListener('click', (e) => { if (e.target.id === 'dossierOverlay') closeDossier(); });
  $('dossierCopy').addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(world.seed));
    if (curPersona) url.searchParams.set('persona', curPersona);
    navigator.clipboard && navigator.clipboard.writeText(url.toString());
    $('dossierCopy').textContent = uiLang === 'ar' ? '✓ نُسِخ' : '✓ Copied';
    setTimeout(() => $('dossierCopy').textContent = get('sim.dossier.copy'), 2000);
  });
  $('followBtn').addEventListener('click', () => {
    // Tag a random incoming device
    if (world.imports.length === 0) return;
    const target = world.imports[0];
    world.followed = target;
    $('followBtn').classList.add('active');
    setTimeout(triggerShimmer, 8000);
  });
}

function triggerShimmer() {
  const overlay = document.createElement('div');
  overlay.className = 'sim-shimmer-overlay';
  const t = world.followed;
  if (!t) return;
  const cu = Math.round(t.kg * 140);
  const au = (t.kg * 0.25).toFixed(2);
  overlay.innerHTML = `
    <div class="sim-shimmer-content">
      <div class="sim-shimmer-title">${uiLang === 'ar' ? 'اكتملت الرحلة' : 'Journey complete'}</div>
      <div class="sim-shimmer-body">
        ${t.units} × ${t.device.name_en} · ${uiLang === 'ar' ? 'من' : 'from'} ${t.producer.name_en}<br>
        →&nbsp; ${cu}g ${uiLang === 'ar' ? 'نحاس' : 'copper'} · ${au}g ${uiLang === 'ar' ? 'ذهب' : 'gold'}<br>
        →&nbsp; ${uiLang === 'ar' ? 'شهادة امتثال + كربون' : 'compliance + carbon cert'}<br>
        →&nbsp; ${uiLang === 'ar' ? 'غطاء CBAM' : 'CBAM cover'}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1600);
  world.followed = null;
  $('followBtn').classList.remove('active');
}

// ═══════════ INIT ═══════════
function init() {
  world.rng = D.makeRng(world.seed);
  applyI18n();
  buildPersonaGrid();
  wireControls();
  const p = paramsIn();
  startEngine();
  // Pre-warm a few ticks so first render has data
  for (let i = 0; i < 30; i++) advanceWorld();
  if (p.persona) enterPersona(p.persona);
  if (p.act === 3) goToAct(3);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
