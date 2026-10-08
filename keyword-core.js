// Núcleo del Keyword Planner de Auditor GEO PRO. Sin dependencias: lo usan el servidor
// (keyword-planner.mjs) y el navegador (keywords.html), así la demo y la clasificación
// heurística funcionan también en la versión publicada sin servidor.

export const INTENTS = ["informational", "navigational", "commercial", "transactional"];
export const INTENT_LABELS = { informational: "Informacional", navigational: "Navegacional", commercial: "Comercial", transactional: "Transaccional" };
export const BRAND_LABELS = { own: "Marca propia", other: "Otra marca", none: "Non-brand" };

// IDs de Google Ads (geoTargetConstants y languageConstants).
export const COUNTRIES = [
  ["2724", "España"], ["2484", "México"], ["2032", "Argentina"], ["2170", "Colombia"], ["2152", "Chile"],
  ["2604", "Perú"], ["2862", "Venezuela"], ["2218", "Ecuador"], ["2858", "Uruguay"], ["2600", "Paraguay"],
  ["2068", "Bolivia"], ["2188", "Costa Rica"], ["2591", "Panamá"], ["2320", "Guatemala"], ["2214", "República Dominicana"],
  ["2840", "Estados Unidos"], ["2124", "Canadá"], ["2826", "Reino Unido"], ["2620", "Portugal"], ["2076", "Brasil"],
  ["2250", "Francia"], ["2276", "Alemania"], ["2380", "Italia"], ["", "Todas las ubicaciones"]
];
export const LANGUAGES = [
  ["1003", "Español"], ["1000", "Inglés"], ["1014", "Portugués"], ["1002", "Francés"], ["1001", "Alemán"], ["1004", "Italiano"], ["1038", "Catalán"]
];

export const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
export const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Minúsculas, sin tildes y con espacios simples: así «Cómo» y «como» comparan igual.
export function normalize(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}&+.'\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

export function parseList(text, max = Infinity) {
  const seen = new Set(), out = [];
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const v = raw.trim().replace(/\s+/g, " ");
    const k = normalize(v);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Coincidencia por palabra completa sobre texto normalizado (también «nike» en «nike air»).
function termMatcher(terms) {
  const list = terms.map(normalize).filter(Boolean);
  if (!list.length) return () => null;
  const res = list.map(t => [t, new RegExp(`(?:^|\\s)${escapeRe(t).replace(/ /g, "\\s?")}(?=$|\\s)`)]);
  return text => { const n = normalize(text); const hit = res.find(([, re]) => re.test(n)); return hit ? hit[0] : null; };
}

// Modificadores en español e inglés. Orden de prioridad: transaccional > comercial > navegacional > informacional.
const RULES = {
  transactional: /(?:^|\s)(comprar|compra|compro|precio|precios|cuanto cuesta|cuanto vale|coste|costo|tarifa|tarifas|barato|barata|baratos|baratas|economico|economica|oferta|ofertas|descuento|descuentos|cupon|cupones|promocion|rebajas|outlet|tienda|tiendas|online|envio|a domicilio|pedir|encargar|contratar|reservar|reserva|alquiler|alquilar|presupuesto|suscripcion|descargar|gratis|venta|en venta|segunda mano|cerca de mi|near me|buy|price|prices|pricing|cheap|deal|deals|discount|coupon|order|shop|store|hire|book|booking|download|free|for sale|subscription)(?=$|\s)/,
  commercial: /(?:^|\s)(mejor|mejores|top|comparativa|comparacion|comparar|vs|versus|opiniones|opinion|resenas|resena|review|reviews|analisis|alternativa|alternativas|ranking|recomendado|recomendados|recomendaciones|merece la pena|vale la pena|pros y contras|ventajas|calidad precio|best|compare|comparison|alternative|alternatives|recommended|worth it|pros and cons)(?=$|\s)/,
  navigational: /(?:^|\s)(login|log in|iniciar sesion|acceso|acceder|mi cuenta|area cliente|area de clientes|web oficial|pagina oficial|sitio oficial|oficial|app|aplicacion|contacto|telefono|atencion al cliente|horario|horarios|direccion|sede|official site|sign in|customer service|phone number)(?=$|\s)/,
  informational: /(?:^|\s)(que|que es|como|cuando|donde|por que|porque|para que|quien|cual|cuales|cuanto|cuantos|guia|tutorial|curso|definicion|significado|ejemplo|ejemplos|tipos|caracteristicas|historia|ideas|consejos|trucos|pasos|beneficios|sintomas|causas|diferencia|diferencias|how|what|why|when|where|who|which|guide|meaning|definition|examples|ideas|tips|types|benefits)(?=$|\s)/
};

// Clasificación heurística: respaldo sin IA y punto de partida antes de la clasificación con IA.
export function classifyHeuristic(keyword, { ownBrands = [], competitors = [] } = {}) {
  const own = typeof ownBrands === "function" ? ownBrands : termMatcher(ownBrands);
  const comp = typeof competitors === "function" ? competitors : termMatcher(competitors);
  const n = normalize(keyword);
  const ownHit = own(n), compHit = ownHit ? null : comp(n);
  const brand = ownHit ? "own" : compHit ? "other" : "none";
  let intent = "informational";
  // Una búsqueda que solo es la marca (± un término de navegación) es navegacional.
  const bare = (ownHit || compHit) && n.replace(ownHit || compHit, "").trim().split(" ").filter(Boolean).length <= 1 && !RULES.transactional.test(n) && !RULES.commercial.test(n);
  if (RULES.transactional.test(n)) intent = "transactional";
  else if (RULES.commercial.test(n) && !/^(que|como|por que)\s/.test(n)) intent = "commercial";
  else if (bare || RULES.navigational.test(n)) intent = "navigational";
  return { intent, brand, brandName: ownHit || compHit || "", source: "reglas" };
}

export function classifyAllHeuristic(ideas, brands = {}) {
  const ownBrands = termMatcher(brands.ownBrands || []), competitors = termMatcher(brands.competitors || []);
  return ideas.map(k => ({ ...k, ...classifyHeuristic(k.keyword, { ownBrands, competitors }) }));
}

// Tendencias a partir del histórico mensual (ordenado del más antiguo al más reciente).
export function trendStats(monthly) {
  const v = (monthly || []).map(m => m.searches ?? 0);
  if (v.length < 3) return { yoy: null, threeMonth: null, peakMonth: null, seasonality: null };
  const last = v[v.length - 1], first = v[0];
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);
  const prev3 = v.slice(-6, -3), last3 = v.slice(-3);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const peakIdx = v.indexOf(Math.max(...v));
  const mean = sum(v) / v.length;
  const sd = Math.sqrt(sum(v.map(x => (x - mean) ** 2)) / v.length);
  return {
    yoy: v.length >= 12 ? pct(last, first) : null,
    threeMonth: prev3.length === 3 ? pct(sum(last3), sum(prev3)) : null,
    peakMonth: monthly[peakIdx] ? monthly[peakIdx].month : null,
    seasonality: mean > 0 ? Math.round((sd / mean) * 100) / 100 : 0
  };
}

export function enrich(idea) {
  const t = trendStats(idea.monthly);
  return { ...idea, words: normalize(idea.keyword).split(" ").filter(Boolean).length, ...t };
}

export function summarize(rows) {
  const s = { total: rows.length, volume: 0, intents: {}, brand: { own: 0, other: 0, none: 0 }, cpc: null, competition: { LOW: 0, MEDIUM: 0, HIGH: 0, UNKNOWN: 0 } };
  let cpcSum = 0, cpcN = 0;
  for (const i of INTENTS) s.intents[i] = 0;
  for (const r of rows) {
    s.volume += r.volume || 0;
    if (r.intent in s.intents) s.intents[r.intent]++;
    if (r.brand in s.brand) s.brand[r.brand]++;
    s.competition[r.competition in s.competition ? r.competition : "UNKNOWN"]++;
    if (r.cpcHigh != null) { cpcSum += (r.cpcLow + r.cpcHigh) / 2; cpcN++; }
  }
  s.cpc = cpcN ? cpcSum / cpcN : null;
  return s;
}

// CSV con separador «;» y BOM: se abre bien en Excel en español y en Google Sheets.
export function toCsv(rows, { currency = "" } = {}) {
  const months = rows.find(r => r.monthly && r.monthly.length)?.monthly || [];
  const head = ["Keyword", "Intención", "Marca", "Marca detectada", "Volumen medio", "Competencia", "Índice competencia", `CPC bajo${currency ? ` (${currency})` : ""}`, `CPC alto${currency ? ` (${currency})` : ""}`, "Tendencia interanual %", "Tendencia 3 meses %", "Palabras", "Clasificación", ...months.map(m => `${MONTH_SHORT[MONTHS.indexOf(m.month)] || m.month} ${m.year}`)];
  const cell = v => {
    if (v == null) return "";
    let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s; // evita inyección de fórmulas
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.map(cell).join(";")];
  for (const r of rows) {
    lines.push([r.keyword, INTENT_LABELS[r.intent] || r.intent, BRAND_LABELS[r.brand] || r.brand, r.brandName, r.volume, r.competition, r.competitionIndex, r.cpcLow, r.cpcHigh, r.yoy, r.threeMonth, r.words, r.source, ...months.map((_, i) => r.monthly?.[i]?.searches ?? "")].map(cell).join(";"));
  }
  return "﻿" + lines.join("\r\n");
}

// ===== Demo: datos sintéticos deterministas a partir de la semilla =====
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const DEMO_PRE = ["", "que es", "como", "mejor", "mejores", "comprar", "precio", "curso de", "guia de", "tipos de", "opiniones", "como funciona", "para que sirve", "ejemplos de", "herramientas de", "alternativas a", "que significa", "cuanto cuesta", "como hacer", "estrategia de"];
const DEMO_POST = ["", "2026", "online", "gratis", "barato", "para principiantes", "precio", "opiniones", "vs", "ejemplos", "pdf", "cerca de mi", "españa", "mexico", "paso a paso", "para empresas", "app", "login", "en casa", "profesional"];
// Sufijos que combinan bien con cualquier prefijo («curso de X online», no «opiniones X precio»).
const DEMO_NEUTRAL = new Set(["2026", "online", "gratis", "para principiantes", "pdf", "españa", "mexico", "paso a paso", "para empresas"]);
const DEMO_BRANDS = ["semrush", "ahrefs", "google", "amazon", "hubspot"];

export function demoIdeas(seeds, { max = 400, endYear = new Date().getFullYear(), endMonth = new Date().getMonth() - 1 } = {}) {
  const list = (seeds && seeds.length ? seeds : ["keyword research"]).slice(0, 20).map(s => String(s).toLowerCase());
  const r = rng(hash(list.map(normalize).join("|")));
  const set = new Map();
  const add = kw => { const k = normalize(kw); if (k && !set.has(k)) set.set(k, kw.replace(/\s+/g, " ").trim()); };
  for (const seed of list) {
    for (const pre of DEMO_PRE) for (const post of DEMO_POST) {
      if (pre && post && (!DEMO_NEUTRAL.has(post) || r() > 0.6)) continue;
      add(`${pre} ${seed} ${post}`);
    }
    for (const b of DEMO_BRANDS) if (r() > 0.4) add(`${seed} ${b}`);
  }
  if (endMonth < 0) { endMonth += 12; endYear--; }
  const ideas = [];
  for (const [, keyword] of set) {
    const base = Math.round(10 ** (1 + r() * (keyword.split(" ").length <= 2 ? 3.6 : 2.4)));
    const season = r() * 0.6, phase = Math.floor(r() * 12), growth = (r() - 0.45) * 0.06;
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
      let m = endMonth - i, y = endYear;
      while (m < 0) { m += 12; y--; }
      const f = 1 + season * Math.cos(((m - phase) / 12) * 2 * Math.PI) + growth * (11 - i) + (r() - 0.5) * 0.15;
      monthly.push({ year: y, month: MONTHS[m], searches: Math.max(0, roundVolume(base * f)) });
    }
    const ci = Math.round(r() * 100);
    const cpcLow = Math.round((0.05 + r() * 1.2) * 100) / 100;
    ideas.push({ keyword, volume: roundVolume(monthly.reduce((s, x) => s + x.searches, 0) / 12), competition: ci < 34 ? "LOW" : ci < 67 ? "MEDIUM" : "HIGH", competitionIndex: ci, cpcLow, cpcHigh: Math.round((cpcLow * (1.8 + r() * 2.5)) * 100) / 100, monthly });
  }
  return ideas.sort((a, b) => b.volume - a.volume).slice(0, max);
}

// Google redondea los volúmenes a escalones; la demo imita ese aspecto.
function roundVolume(v) {
  if (v < 10) return Math.round(v);
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.round(v / (p / 2)) * (p / 2);
}
