/* ═══════════════════════════════════════════════════════════════════
   MIZAN LIVE · Egyptian data layer + deterministic PRNG
   All numbers reproducible from a seed. Real brand names carry an
   explicit "Simulated data · decree pending" watermark in the UI.
   ═══════════════════════════════════════════════════════════════════ */

// ─────── Mulberry32 PRNG (deterministic, fast, 32-bit) ───────
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickWeighted(rng, arr, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r < 0) return arr[i]; }
  return arr[arr.length - 1];
}
function between(rng, lo, hi) { return lo + rng() * (hi - lo); }

// ─────── PRODUCERS (real Egyptian-market brand names, watermarked) ───────
const PRODUCERS = [
  { id: 'samsung',  name_ar: 'Samsung Electronics Egypt', name_en: 'Samsung Electronics Egypt', category: 'electronics',   share: 0.18 },
  { id: 'oppo',     name_ar: 'OPPO Egypt',                 name_en: 'OPPO Egypt',                 category: 'smartphones',  share: 0.11 },
  { id: 'xiaomi',   name_ar: 'Xiaomi Egypt',               name_en: 'Xiaomi Egypt',               category: 'smartphones',  share: 0.08 },
  { id: 'hp',       name_ar: 'HP Middle East',             name_en: 'HP Middle East',             category: 'ict',          share: 0.09 },
  { id: 'apple',    name_ar: 'Apple Egypt Reseller',       name_en: 'Apple Egypt Reseller',       category: 'electronics',  share: 0.07 },
  { id: 'lenovo',   name_ar: 'Lenovo Egypt',               name_en: 'Lenovo Egypt',               category: 'ict',          share: 0.06 },
  { id: 'lg',       name_ar: 'LG Electronics Egypt',       name_en: 'LG Electronics Egypt',       category: 'appliances',   share: 0.08 },
  { id: 'dell',     name_ar: 'Dell EMC Egypt',             name_en: 'Dell EMC Egypt',             category: 'ict',          share: 0.05 },
  { id: 'huawei',   name_ar: 'Huawei Egypt',               name_en: 'Huawei Egypt',               category: 'smartphones',  share: 0.07 },
  { id: 'asus',     name_ar: 'Asus MEA',                   name_en: 'Asus MEA',                   category: 'ict',          share: 0.04 },
  { id: 'infinix',  name_ar: 'Infinix Egypt',              name_en: 'Infinix Egypt',              category: 'smartphones',  share: 0.05 },
  { id: 'realme',   name_ar: 'realme Egypt',               name_en: 'realme Egypt',               category: 'smartphones',  share: 0.04 },
  { id: 'tornado',  name_ar: 'مجموعة تورنيدو',              name_en: 'Tornado Group',              category: 'appliances',   share: 0.03 },
  { id: 'unionaire',name_ar: 'يونيون آير',                 name_en: 'Unionaire',                  category: 'appliances',   share: 0.03 },
  { id: 'fresh',    name_ar: 'فريش',                        name_en: 'Fresh',                      category: 'appliances',   share: 0.02 },
];

// ─────── DISTRIBUTORS (real retail chains) ───────
const DISTRIBUTORS = [
  { id: 'btech',    name_ar: 'B.TECH',        name_en: 'B.TECH',        share: 0.28 },
  { id: 'raya',     name_ar: 'راية',           name_en: 'Raya',           share: 0.16 },
  { id: '2b',       name_ar: '2B Electronics', name_en: '2B Electronics', share: 0.14 },
  { id: 'compumarts', name_ar: 'كومبيومارتس',  name_en: 'CompuMe',        share: 0.09 },
  { id: 'hts',      name_ar: 'HTS',            name_en: 'HTS',            share: 0.08 },
  { id: 'elarabi',  name_ar: 'مجموعة العربي',   name_en: 'Elarabi Group',  share: 0.11 },
  { id: 'elsallab', name_ar: 'الصلاب',          name_en: 'El-Sallab',      share: 0.09 },
  { id: 'radioshack', name_ar: 'راديو شاك',    name_en: 'Radio Shack',    share: 0.05 },
];

// ─────── REFINERS (44 total; flagship names + realistic Egyptian names) ───────
const REFINER_FLAGSHIPS = [
  { name_ar: 'REMIT Cairo',           name_en: 'REMIT Cairo',            city: 'Cairo',       tier: 4, score: 92 },
  { name_ar: 'Recyclobekia',           name_en: 'Recyclobekia',           city: 'Cairo',       tier: 3, score: 88 },
  { name_ar: 'ClickBox',               name_en: 'ClickBox',               city: 'Cairo',       tier: 3, score: 84 },
  { name_ar: 'El Rasheed Recycling',   name_en: 'El Rasheed Recycling',   city: 'Alexandria',  tier: 3, score: 78 },
  { name_ar: 'Cairo Metals Recovery',  name_en: 'Cairo Metals Recovery',  city: 'Cairo',       tier: 4, score: 86 },
  { name_ar: 'Delta E-Waste',          name_en: 'Delta E-Waste',          city: 'Gharbia',     tier: 2, score: 75 },
  { name_ar: 'Egyptian Refiners',      name_en: 'Egyptian Refiners Ltd',  city: 'Alexandria',  tier: 5, score: 90 },
  { name_ar: 'Nile Recycling Co.',     name_en: 'Nile Recycling Co.',     city: 'Giza',        tier: 3, score: 82 },
];
function generateRefiners() {
  const rng = makeRng(9091);
  const cities = ['Cairo', 'Giza', 'Alexandria', 'Sharqia', 'Gharbia', 'Qalyubia', 'Beheira', 'Ismailia'];
  const roots = ['Nile', 'Delta', 'Cairo', 'Giza', 'Ramses', 'Pharaoh', 'Golden', 'Green', 'Sphinx', 'Pyramid', 'Sun', 'Star', 'Amber', 'Falcon', 'Oasis'];
  const suffixes = ['Recycling', 'Metals Recovery', 'E-Waste Solutions', 'Refineries', 'Green Metals', 'Circular Systems', 'Extract Co.', 'Recovery Ltd', 'Materials'];
  const rootsAr = ['النيل', 'الدلتا', 'القاهرة', 'الجيزة', 'رمسيس', 'الفرعون', 'الذهبي', 'الأخضر', 'أبوالهول', 'الهرم', 'الشمس', 'النجم', 'العنبر', 'الصقر', 'الواحة'];
  const suffixesAr = ['للتدوير', 'لاسترداد المعادن', 'لحلول المخلفات الإلكترونية', 'للمصافي', 'للمعادن الخضراء', 'للأنظمة الدائرية', 'للاستخلاص', 'لاسترداد المواد', 'للمواد'];

  const out = [...REFINER_FLAGSHIPS];
  const usedNames = new Set(out.map(r => r.name_en));

  while (out.length < 44) {
    const i = Math.floor(rng() * roots.length);
    const j = Math.floor(rng() * suffixes.length);
    const name_en = `${roots[i]} ${suffixes[j]}`;
    const name_ar = `${rootsAr[i]} ${suffixesAr[j]}`;
    if (usedNames.has(name_en)) continue;
    usedNames.add(name_en);
    const tier = pickWeighted(rng, [1, 2, 3, 4, 5], [3, 6, 8, 4, 1]);
    const score = Math.floor(45 + rng() * 55);
    const city = pick(rng, cities);
    out.push({ name_ar, name_en, city, tier, score });
  }
  return out;
}
const REFINERS = generateRefiners();

// ─────── GOVERNORATES with population/economic weight ───────
const GOVERNORATES = [
  { id: 'cairo',   name_ar: 'القاهرة',   name_en: 'Cairo',        weight: 0.28, lat: 30.05, lng: 31.25 },
  { id: 'giza',    name_ar: 'الجيزة',    name_en: 'Giza',         weight: 0.18, lat: 30.01, lng: 31.20 },
  { id: 'alex',    name_ar: 'الإسكندرية', name_en: 'Alexandria',   weight: 0.14, lat: 31.20, lng: 29.92 },
  { id: 'sharqia', name_ar: 'الشرقية',   name_en: 'Sharqia',       weight: 0.11, lat: 30.57, lng: 31.50 },
  { id: 'gharbia', name_ar: 'الغربية',   name_en: 'Gharbia',       weight: 0.09, lat: 30.87, lng: 31.03 },
  { id: 'rest',    name_ar: 'باقي المحافظات', name_en: 'Rest of Egypt', weight: 0.20, lat: 27.00, lng: 30.80 },
];

// ─────── PRICES (EGP, spot approximations for Q1 2027) ───────
const PRICES_EGP = {
  copper_per_tonne: 275000,
  pcb_per_tonne: 400000,
  aluminum_per_tonne: 100000,
  steel_per_tonne: 12000,
  gold_per_kg: 3800000,
  silver_per_kg: 60000,
  palladium_per_kg: 1600000,
};

// ─────── DEVICE ARCHETYPES ───────
const DEVICES = [
  { id: 'phone',   name_ar: 'هاتف ذكي',      name_en: 'Smartphone',       avg_kg: 0.18, cu_g: 14, au_g: 0.034, al_g: 25, pcb_g: 30, fee_egp_per_kg: 45 },
  { id: 'tablet',  name_ar: 'جهاز لوحي',     name_en: 'Tablet',           avg_kg: 0.45, cu_g: 20, au_g: 0.045, al_g: 90, pcb_g: 55, fee_egp_per_kg: 40 },
  { id: 'laptop',  name_ar: 'حاسوب محمول',   name_en: 'Laptop',           avg_kg: 2.10, cu_g: 130, au_g: 0.22, al_g: 350, pcb_g: 180, fee_egp_per_kg: 38 },
  { id: 'desktop', name_ar: 'حاسوب مكتبي',   name_en: 'Desktop PC',       avg_kg: 8.50, cu_g: 640, au_g: 0.85, al_g: 1200, pcb_g: 350, fee_egp_per_kg: 30 },
  { id: 'tv',      name_ar: 'تلفاز',         name_en: 'Television',       avg_kg: 15.0, cu_g: 480, au_g: 0.4, al_g: 900, pcb_g: 400, fee_egp_per_kg: 22 },
  { id: 'appliance', name_ar: 'جهاز منزلي',  name_en: 'Large Appliance',  avg_kg: 35.0, cu_g: 850, au_g: 0.2, al_g: 2100, pcb_g: 300, fee_egp_per_kg: 18 },
];

// ─────── DEVICE MODEL ARCHETYPES (for "Follow this device") ───────
const DEVICE_MODELS = [
  { archetype: 'phone',   name_ar: 'Samsung Galaxy A54', name_en: 'Samsung Galaxy A54', year: 2023 },
  { archetype: 'phone',   name_ar: 'iPhone 12',           name_en: 'iPhone 12',           year: 2020 },
  { archetype: 'phone',   name_ar: 'OPPO Reno 8',         name_en: 'OPPO Reno 8',         year: 2022 },
  { archetype: 'laptop',  name_ar: 'HP EliteBook 840',    name_en: 'HP EliteBook 840',    year: 2019 },
  { archetype: 'laptop',  name_ar: 'Dell Latitude 5420',  name_en: 'Dell Latitude 5420',  year: 2021 },
  { archetype: 'tablet',  name_ar: 'Samsung Galaxy Tab S6', name_en: 'Samsung Galaxy Tab S6', year: 2019 },
  { archetype: 'tv',      name_ar: 'LG 55" UHD',          name_en: 'LG 55" UHD',          year: 2018 },
  { archetype: 'appliance', name_ar: 'ثلاجة تورنيدو',    name_en: 'Tornado Refrigerator', year: 2015 },
];

// ─────── FINANCIAL SPLIT (PROPOSED — for negotiation) ───────
const SPLIT_PROPOSED = {
  wmra: 0.05,        // 5%
  consortium: 0.15,  // 15%
  operations: 0.15,  // 15% ChemiCan
  collectors: 0.35,  // 35%
  refiners: 0.30,    // 30%
};

// ─────── WEEE Forum eligibility criteria ───────
const WEEE_FORUM_CRITERIA = [
  { key: 'a', name_ar: 'القانون قائم',       name_en: 'Law exists',           status: 'in_progress', progress: 0.75 },
  { key: 'b', name_ar: 'في مرحلة العمليات',  name_en: 'In operations',        status: 'in_progress', progress: 0.60 },
  { key: 'c', name_ar: 'يُدير مخلفات إلكترونية', name_en: 'Manages e-waste',    status: 'in_progress', progress: 0.65 },
  { key: 'd', name_ar: 'بقيادة المنتِجين',    name_en: 'Producer-led',         status: 'satisfied',   progress: 1.00 },
  { key: 'e', name_ar: 'غير ربحي',            name_en: 'Non-profit',           status: 'satisfied',   progress: 1.00 },
];

// ─────── NATIONAL VOLUME BASELINE ───────
const NATIONAL_BASELINE = {
  annual_tonnes: 500000,           // Egypt e-waste generation per year
  ict_phase1_share: 0.20,          // ICT decree Phase 1 covers 20% of the stream
  target_recovery_rate_q1: 0.08,   // 8% recovery rate ramp target for Q1 2027
  refiners_licensed: 44,
  collectors_registered_q1: 62,    // grows as decree onboards
  producers_registered_q1: 128,
};

// ─────── STORY TEMPLATES ───────
// Six 5-step stories, one per persona, used in Story Track
const STORY_TEMPLATES = {
  producer: [
    { key: 'declared',   ar: 'شحنة استيراد أُقرّت على NAFEZA', en: 'Import declared via NAFEZA' },
    { key: 'calculated', ar: 'الالتزام حُسِب آلياً بحسب الوزن',  en: 'Obligation auto-calculated by weight' },
    { key: 'paid',       ar: 'الرسم دُفع لضمان e-Finance',       en: 'Fee paid into e-Finance escrow' },
    { key: 'credit',     ar: 'ائتمان امتثال من استرداد B.TECH', en: 'Compliance credit earned via B.TECH take-back' },
    { key: 'certified',  ar: 'شهادة الامتثال + الكربون صدرت',    en: 'Compliance + Carbon certificates issued' },
  ],
  citizen: [
    { key: 'sitting',    ar: 'جهاز قديم في الدرج',              en: 'Old device sitting in the drawer' },
    { key: 'located',    ar: 'أقرب متجر ميزان على الخريطة',      en: 'Nearest MIZAN Store located' },
    { key: 'valued',     ar: 'القيمة بالنقاط ظهرت',              en: 'Point value displayed' },
    { key: 'dropped',    ar: 'الجهاز سُلِّم إلى المتجر',          en: 'Device dropped off' },
    { key: 'redeemed',   ar: 'النقاط خُصمت من فاتورة الكهرباء',   en: 'Points redeemed on electricity bill' },
  ],
  collector: [
    { key: 'order',      ar: 'أمر عمل من تحالف ميزان',           en: 'Work order from Mizan Consortium' },
    { key: 'route',      ar: 'خط سير محسوب',                     en: 'Route optimised' },
    { key: 'weighed',    ar: 'الأوزان مُوثَّقة بالماسح',           en: 'Weights logged via scanner' },
    { key: 'handed',     ar: 'المواد سُلِّمت للمكرِّر',             en: 'Materials handed to refiner' },
    { key: 'paid',       ar: 'المستحقّات من الضمان',              en: 'Payment released from escrow' },
  ],
  refiner: [
    { key: 'incoming',   ar: 'منافيست وارد',                      en: 'Incoming manifest' },
    { key: 'processing', ar: 'تفكيك · فرم · استخلاص',            en: 'Dismantle · shred · extract' },
    { key: 'proof',      ar: 'إثبات المعالجة مُرفَع',             en: 'Proof of treatment uploaded' },
    { key: 'verified',   ar: 'التحقّق من WMRA',                   en: 'WMRA verified' },
    { key: 'settled',    ar: 'المستحقّات + قيمة المعادن',         en: 'Dues + recovered-metals value' },
  ],
  wmra: [
    { key: 'received',   ar: 'إثبات معالجة وارد',                 en: 'Proof of treatment received' },
    { key: 'crosscheck', ar: 'مطابقة مع بيانات الوزن',            en: 'Cross-check against weight tickets' },
    { key: 'approved',   ar: 'الاعتماد النهائي',                  en: 'Final approval' },
    { key: 'released',   ar: 'صرف المستحقّات من الضمان',          en: 'Escrow released' },
    { key: 'reported',   ar: 'تجميع تقرير الوزير',                en: 'Ministerial report compiled' },
  ],
  board: [
    { key: 'proposed',   ar: 'الخوارزم يقترح التوجيه',            en: 'Algorithm proposes routing' },
    { key: 'signed',     ar: 'المجلس يوقّع رسمياً',                en: 'Board signs off' },
    { key: 'audit',      ar: 'مراجعة العمليات الأسبوعية',         en: 'Weekly ops review' },
    { key: 'quarterly',  ar: 'التقرير المالي الفصلي',             en: 'Quarterly financial report' },
    { key: 'weeeforum',  ar: 'خطوة نحو عضوية WEEE Forum',        en: 'Milestone toward WEEE Forum membership' },
  ],
};

// ─────── PERSONA REGISTRY ───────
const PERSONAS = [
  { id: 'producer',  glyph: '◈', bg: 'gold',   name_ar: 'المنتِج',        name_en: 'Producer',        who_ar: 'نور فريد · مسؤولة الامتثال · Samsung Electronics Egypt', who_en: 'Nour Farid · Compliance Lead · Samsung Electronics Egypt' },
  { id: 'citizen',   glyph: '◉', bg: 'green',  name_ar: 'المواطن',        name_en: 'Citizen',         who_ar: 'أحمد مصطفى · أسرة قاهرية · شيراتون النزهة', who_en: 'Ahmed Mostafa · Cairo family · Sheraton El Nozha' },
  { id: 'collector', glyph: '◆', bg: 'purple', name_ar: 'الجامع',         name_en: 'Collector',       who_ar: 'قاعدة Dr.WEEE · الهرم · مرخّصة منذ 2018', who_en: 'Dr.WEEE Haram Base · WMRA-licensed since 2018' },
  { id: 'refiner',   glyph: '⬢', bg: 'red',    name_ar: 'المكرِّر',        name_en: 'Refiner',         who_ar: 'REMIT Cairo · رخصة WMRA رقم 11 · مستوى T4', who_en: 'REMIT Cairo · WMRA licence #11 · Tier T4' },
  { id: 'wmra',      glyph: '⚖', bg: 'navy',   name_ar: 'الجهاز',         name_en: 'WMRA Officer',    who_ar: 'م. رانيا صلاح · إدارة التحقّق من الامتثال', who_en: 'Eng. Rania Salah · Compliance Verification Directorate' },
  { id: 'board',     glyph: '◇', bg: 'cream',  name_ar: 'مجلس التحالف',   name_en: 'Consortium Board', who_ar: 'م. حسام زكي · غرفة الصناعات الهندسية · اتحاد الصناعات', who_en: 'Eng. Hossam Zaki · Engineering Chamber · FEI' },
];

// Expose to global for the sim engine + views
window.SIM_DATA = {
  makeRng, pick, pickWeighted, between,
  PRODUCERS, DISTRIBUTORS, REFINERS, GOVERNORATES,
  PRICES_EGP, DEVICES, DEVICE_MODELS,
  SPLIT_PROPOSED, WEEE_FORUM_CRITERIA, NATIONAL_BASELINE,
  STORY_TEMPLATES, PERSONAS,
};
