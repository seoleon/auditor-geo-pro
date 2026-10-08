// Keyword Planner de Auditor GEO PRO (lado servidor).
// 1) Google Ads API · KeywordPlanIdeaService.GenerateKeywordIdeas: ideas, volumen medio, competencia,
//    CPC (puja alta/baja de la parte superior de la página) e histórico mensual de 12 meses.
// 2) Claude: clasifica cada keyword por intención de búsqueda y Brand / Non-Brand.
//    Sin clave de Anthropic se usa el clasificador por reglas de keyword-core.js.
// Las credenciales se leen del entorno (ver .env.example) y nunca salen del servidor.
import { classifyAllHeuristic, enrich, normalize, parseList, INTENTS, COUNTRIES, LANGUAGES, MONTHS, demoIdeas } from "./keyword-core.js";

export const DEFAULT_ADS_VERSION = "v25";
export const DEFAULT_AI_MODEL = "claude-opus-5-5";
const ADS_BASE = "https://googleads.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_SEEDS = 20, PAGE_SIZE = 1000, MAX_PAGES = 20, AI_BATCH = 200, AI_CONCURRENCY = 4;
const REQUIRED = ["developerToken", "clientId", "clientSecret", "refreshToken", "customerId"];
const ENV_NAMES = { developerToken: "GOOGLE_ADS_DEVELOPER_TOKEN", clientId: "GOOGLE_ADS_CLIENT_ID", clientSecret: "GOOGLE_ADS_CLIENT_SECRET", refreshToken: "GOOGLE_ADS_REFRESH_TOKEN", customerId: "GOOGLE_ADS_CUSTOMER_ID" };

const digits = v => String(v || "").replace(/\D/g, "");

export function configFromEnv(env = process.env) {
  return {
    google: {
      developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
      clientId: env.GOOGLE_ADS_CLIENT_ID || "",
      clientSecret: env.GOOGLE_ADS_CLIENT_SECRET || "",
      refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN || "",
      customerId: digits(env.GOOGLE_ADS_CUSTOMER_ID),
      loginCustomerId: digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
      apiVersion: env.GOOGLE_ADS_API_VERSION || DEFAULT_ADS_VERSION,
      apiBase: env.GOOGLE_ADS_API_BASE || ADS_BASE,
      tokenUrl: env.GOOGLE_OAUTH_TOKEN_URL || TOKEN_URL
    },
    ai: {
      // El SDK de Anthropic resuelve la credencial (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN o perfil de `ant auth login`).
      enabled: env.KEYWORDS_AI !== "0",
      hasKey: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE),
      model: env.KEYWORDS_AI_MODEL || DEFAULT_AI_MODEL,
      baseURL: env.ANTHROPIC_BASE_URL || undefined
    }
  };
}

export class PlannerError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) { super(message); this.status = status; this.code = code; }
}

// Valida y normaliza lo que llega del navegador.
export function parseRequest(body) {
  const b = body && typeof body === "object" ? body : {};
  const unique = parseList(Array.isArray(b.seeds) ? b.seeds.join("\n") : b.seeds);
  if (unique.length > MAX_SEEDS) throw new PlannerError(`Google Ads admite como máximo ${MAX_SEEDS} keywords semilla por búsqueda.`);
  if (unique.some(s => s.length > 80)) throw new PlannerError("Cada keyword semilla puede tener como máximo 80 caracteres.");
  let url = String(b.url || "").trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    let u; try { u = new URL(url); } catch { throw new PlannerError("La URL semilla no es válida."); }
    if (!/^https?:$/.test(u.protocol)) throw new PlannerError("La URL semilla debe ser http(s).");
    url = u.href;
  }
  if (!unique.length && !url) throw new PlannerError("Escribe al menos una keyword semilla o una URL.");
  const geo = digits(b.geo ?? "2724");
  const language = digits(b.language ?? "1003") || "1003";
  const max = Math.min(10000, Math.max(10, Math.round(Number(b.max) || 3000)));
  return {
    seeds: unique, url, geo, language, max,
    network: b.network === "GOOGLE_SEARCH_AND_PARTNERS" ? "GOOGLE_SEARCH_AND_PARTNERS" : "GOOGLE_SEARCH",
    ownBrands: parseList(b.ownBrands, 50), competitors: parseList(b.competitors, 200),
    ai: b.ai !== false, demo: b.demo === true
  };
}

// ===== Google Ads =====
const micros = v => (v == null || v === "" ? null : Math.round(Number(v) / 10000) / 100);
const COMPETITION = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" };

export function normalizeIdea(result) {
  const m = result.keywordIdeaMetrics || {};
  const monthly = (m.monthlySearchVolumes || [])
    .map(x => ({ year: Number(x.year), month: x.month, searches: Number(x.monthlySearches || 0) }))
    .filter(x => x.year && MONTHS.includes(x.month))
    .sort((a, b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month));
  return {
    keyword: String(result.text || "").trim(),
    volume: Number(m.avgMonthlySearches || 0),
    competition: COMPETITION[m.competition] || "UNKNOWN",
    competitionIndex: m.competitionIndex != null ? Number(m.competitionIndex) : null,
    cpcLow: micros(m.lowTopOfPageBidMicros),
    cpcHigh: micros(m.highTopOfPageBidMicros),
    monthly
  };
}

// Traduce los errores de Google Ads a mensajes accionables.
export function googleErrorMessage(status, payload) {
  const err = payload && payload.error ? payload.error : {};
  const details = [].concat(...(err.details || []).map(d => d.errors || []));
  const codes = details.map(e => Object.values(e.errorCode || {}).join(",")).join(",");
  const first = details[0]?.message || err.message || "";
  if (/DEVELOPER_TOKEN_NOT_APPROVED/.test(codes)) return "Tu developer token solo tiene acceso de prueba: funciona con cuentas de prueba, no con cuentas reales. Solicita el acceso Basic en el Centro de API de Google Ads.";
  if (/DEVELOPER_TOKEN_PROHIBITED|DEVELOPER_TOKEN_INVALID|developer token/i.test(codes + first)) return "El developer token de Google Ads no es válido para este proyecto de Google Cloud.";
  if (/USER_PERMISSION_DENIED/.test(codes)) return "El usuario de OAuth no tiene acceso a esa cuenta de Google Ads. Si accedes a través de una MCC, define GOOGLE_ADS_LOGIN_CUSTOMER_ID.";
  if (/CUSTOMER_NOT_FOUND|CUSTOMER_NOT_ENABLED|NOT_ACTIVE/.test(codes)) return "La cuenta de Google Ads (GOOGLE_ADS_CUSTOMER_ID) no existe o no está activa.";
  if (status === 429 || /RESOURCE_EXHAUSTED|RESOURCE_TEMPORARILY_EXHAUSTED/.test(codes + (err.status || ""))) return "Has superado la cuota de la Google Ads API. Espera un momento y vuelve a intentarlo.";
  if (status === 401) return "Google rechazó las credenciales OAuth. Genera un refresh token nuevo con `npm run keywords:auth`.";
  return `Google Ads API respondió ${status}${first ? `: ${first}` : ""}`;
}

export function createGoogleAdsClient(cfg, { fetch: fetchImpl = globalThis.fetch } = {}) {
  let token = null, tokenExp = 0, currency;
  const missing = REQUIRED.filter(k => !cfg[k]).map(k => ENV_NAMES[k]);

  async function accessToken() {
    if (token && Date.now() < tokenExp) return token;
    const res = await fetchImpl(cfg.tokenUrl, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const why = data.error === "invalid_grant" ? "el refresh token ha caducado o se revocó (en apps OAuth en modo «Prueba» caduca a los 7 días)" : data.error_description || data.error || `HTTP ${res.status}`;
      throw new PlannerError(`No se pudo obtener el token de acceso de Google: ${why}. Genera uno nuevo con \`npm run keywords:auth\`.`, { status: 502, code: "GOOGLE_AUTH" });
    }
    token = data.access_token;
    tokenExp = Date.now() + Math.max(60, (Number(data.expires_in) || 3600) - 120) * 1000;
    return token;
  }

  async function call(path, body) {
    const headers = { "content-type": "application/json", authorization: `Bearer ${await accessToken()}`, "developer-token": cfg.developerToken };
    if (cfg.loginCustomerId) headers["login-customer-id"] = cfg.loginCustomerId;
    const res = await fetchImpl(`${cfg.apiBase}/${cfg.apiVersion}/customers/${cfg.customerId}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new PlannerError(googleErrorMessage(res.status, data), { status: 502, code: "GOOGLE_ADS" });
    return data;
  }

  // Moneda de la cuenta: los CPC llegan en micros de esa moneda. Si falla, no bloquea la búsqueda.
  async function currencyCode() {
    if (currency !== undefined) return currency;
    try {
      const data = await call("/googleAds:search", { query: "SELECT customer.currency_code FROM customer LIMIT 1" });
      currency = data.results?.[0]?.customer?.currencyCode || "";
    } catch { currency = ""; }
    return currency;
  }

  async function generateIdeas(req, onPage = () => {}) {
    const body = { language: `languageConstants/${req.language}`, keywordPlanNetwork: req.network, includeAdultKeywords: false, pageSize: PAGE_SIZE };
    if (req.geo) body.geoTargetConstants = [`geoTargetConstants/${req.geo}`];
    if (req.seeds.length && req.url) body.keywordAndUrlSeed = { url: req.url, keywords: req.seeds };
    else if (req.url) body.urlSeed = { url: req.url };
    else body.keywordSeed = { keywords: req.seeds };
    const ideas = new Map();
    let pageToken = "", total = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await call(":generateKeywordIdeas", pageToken ? { ...body, pageToken } : body);
      if (data.totalSize != null) total = Number(data.totalSize);
      for (const r of data.results || []) {
        const idea = normalizeIdea(r), key = normalize(idea.keyword);
        if (key && !ideas.has(key)) ideas.set(key, idea);
      }
      onPage(ideas.size, total);
      pageToken = data.nextPageToken || "";
      if (!pageToken || ideas.size >= req.max) break;
    }
    return { ideas: [...ideas.values()].slice(0, req.max), total };
  }

  return { configured: missing.length === 0, missing, apiVersion: cfg.apiVersion, generateIdeas, currencyCode };
}

// ===== Clasificación con Claude =====
export const CLASSIFY_SYSTEM = `Eres un analista SEO experto en keyword research. Clasificas keywords de Google por intención de búsqueda y por marca.

INTENCIÓN (elige la dominante, una sola):
- informational: quiere aprender o resolver una duda (qué es, cómo, guías, ideas, significado, síntomas, tutoriales). También consultas genéricas de un tema sin señal de compra.
- navigational: quiere llegar a un sitio, marca, app o página concreta (marca sola, login, web oficial, contacto, teléfono, horario, sede).
- commercial: investiga antes de comprar o contratar (mejores, top, comparativas, X vs Y, opiniones, reseñas, alternativas, modelos de producto concretos que se comparan).
- transactional: quiere comprar, contratar, reservar, descargar o actuar ya (comprar, precio, barato, oferta, cupón, tienda, cerca de mí, presupuesto, alquiler, curso online con inscripción).

MARCA:
- own: contiene alguna de las marcas propias que te indique el usuario (o una variante, abreviatura o error ortográfico claro).
- other: contiene cualquier otra marca, empresa, producto con nombre propio, web, app, software, medio o persona-marca (aunque no esté en la lista de competidores).
- none: non-brand. Las palabras genéricas no son marcas («seo», «zapatillas», «hosting», «banco»).
brand_name: la marca detectada tal como aparece en la keyword, o "" si brand es none.

Responde con un elemento por cada keyword recibida, usando su índice «i». No omitas ninguna.`;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          intent: { type: "string", enum: INTENTS },
          brand: { type: "string", enum: ["own", "other", "none"] },
          brand_name: { type: "string" }
        },
        required: ["i", "intent", "brand", "brand_name"],
        additionalProperties: false
      }
    }
  },
  required: ["items"],
  additionalProperties: false
};

let sdkPromise;
async function loadSdk() {
  sdkPromise ||= Promise.all([import("@anthropic-ai/sdk"), import("@anthropic-ai/sdk/helpers/json-schema")])
    .then(([sdk, helpers]) => ({ Anthropic: sdk.default, jsonSchemaOutputFormat: helpers.jsonSchemaOutputFormat }))
    .catch(() => null);
  return sdkPromise;
}

export async function createClaudeClassifier(aiCfg, { client } = {}) {
  const sdk = await loadSdk();
  if (!sdk) return { available: false, reason: "Falta el paquete @anthropic-ai/sdk: ejecuta `npm install`." };
  if (!client && !aiCfg.hasKey) return { available: false, reason: "Sin ANTHROPIC_API_KEY: se usa el clasificador por reglas." };
  const { Anthropic, jsonSchemaOutputFormat } = sdk;
  const anthropic = client || new Anthropic({ baseURL: aiCfg.baseURL, maxRetries: 4 });
  const format = jsonSchemaOutputFormat(CLASSIFY_SCHEMA);

  async function classifyBatch(keywords, ctx) {
    const country = COUNTRIES.find(c => c[0] === ctx.geo)?.[1] || "cualquier país";
    const language = LANGUAGES.find(l => l[0] === ctx.language)?.[1] || "cualquier idioma";
    const user = [
      `Mercado: ${country} · idioma: ${language}.`,
      `Marcas propias: ${ctx.ownBrands.length ? ctx.ownBrands.join(", ") : "(ninguna indicada)"}.`,
      `Competidores conocidos: ${ctx.competitors.length ? ctx.competitors.join(", ") : "(ninguno indicado)"}.`,
      "", "Keywords (índice<TAB>keyword):",
      ...keywords.map((k, i) => `${i}\t${k}`)
    ].join("\n");
    const response = await anthropic.beta.messages.parse({
      model: aiCfg.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: CLASSIFY_SYSTEM,
      output_config: { effort: "low", format },
      messages: [{ role: "user", content: user }]
    });
    if (response.stop_reason === "refusal") throw new Error("El modelo rechazó clasificar este lote.");
    if (response.stop_reason === "max_tokens") throw new Error("La respuesta del modelo se cortó (max_tokens).");
    const items = response.parsed_output?.items;
    if (!Array.isArray(items)) throw new Error("La respuesta del modelo no tiene el formato esperado.");
    return items;
  }

  // Clasifica todas las filas por lotes; un lote que falla conserva la clasificación por reglas.
  async function classify(rows, ctx, onProgress = () => {}) {
    const out = rows.slice(), warnings = [];
    const batches = [];
    for (let i = 0; i < rows.length; i += AI_BATCH) batches.push(i);
    let done = 0, fatal = null, ok = 0, next = 0;
    async function worker() {
      while (next < batches.length && !fatal) {
        const start = batches[next++];
        const slice = rows.slice(start, start + AI_BATCH);
        try {
          const items = await classifyBatch(slice.map(r => r.keyword), ctx);
          for (const it of items) {
            if (!Number.isInteger(it.i) || it.i < 0 || it.i >= slice.length) continue;
            const row = out[start + it.i];
            out[start + it.i] = { ...row, intent: it.intent, brand: it.brand, brandName: it.brand === "none" ? "" : String(it.brand_name || "").slice(0, 80), source: "IA" };
          }
          ok++;
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) fatal = "Anthropic rechazó la clave de API: revisa ANTHROPIC_API_KEY.";
          else if (e instanceof Anthropic.NotFoundError) fatal = `El modelo ${aiCfg.model} no está disponible para tu cuenta (KEYWORDS_AI_MODEL).`;
          else if (e instanceof Anthropic.RateLimitError) warnings.push("Límite de velocidad de Anthropic: algunos lotes se clasificaron por reglas.");
          else if (e instanceof Anthropic.APIError) warnings.push(`Anthropic respondió ${e.status ?? "con error"} en un lote: se clasificó por reglas.`);
          else warnings.push(`${e.message} Ese lote se clasificó por reglas.`);
        }
        done += slice.length;
        onProgress(Math.min(done, rows.length), rows.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, batches.length) }, worker));
    if (fatal) warnings.unshift(fatal + " Se usó el clasificador por reglas.");
    return { rows: out, warnings: [...new Set(warnings)], aiBatches: ok, totalBatches: batches.length };
  }

  return { available: true, model: aiCfg.model, classify };
}

// ===== Orquestación =====
export function createKeywordPlanner(config = configFromEnv(), deps = {}) {
  const ads = createGoogleAdsClient(config.google, deps);
  let classifierPromise;
  const classifier = () => (classifierPromise ||= config.ai.enabled ? createClaudeClassifier(config.ai, { client: deps.anthropic }) : Promise.resolve({ available: false, reason: "IA desactivada (KEYWORDS_AI=0)." }));

  async function status() {
    const ai = await classifier();
    return {
      ok: true,
      google: { configured: ads.configured, missing: ads.missing, apiVersion: ads.apiVersion },
      ai: { available: ai.available, model: ai.available ? ai.model : null, reason: ai.available ? "" : ai.reason },
      countries: COUNTRIES, languages: LANGUAGES
    };
  }

  async function run(body, emit = () => {}) {
    const req = parseRequest(body);
    const started = Date.now();
    let ideas, source, currency = "", totalSize = null;
    if (req.demo || !ads.configured) {
      if (!req.demo) throw new PlannerError(`Google Ads API sin configurar. Faltan: ${ads.missing.join(", ")}. Mira .env.example o usa la demo.`, { status: 400, code: "NOT_CONFIGURED" });
      ideas = demoIdeas(req.seeds.length ? req.seeds : [new URL(req.url).hostname.replace(/^www\./, "").split(".")[0]], { max: req.max });
      source = "demo";
    } else {
      emit({ type: "progress", stage: "google", message: "Consultando Google Ads API…" });
      const r = await ads.generateIdeas(req, (n, total) => emit({ type: "progress", stage: "google", done: n, total, message: `Google Ads: ${n} keywords recibidas${total ? ` de ${total}` : ""}…` }));
      ideas = r.ideas; totalSize = r.total; source = "google";
      currency = await ads.currencyCode();
    }
    let rows = classifyAllHeuristic(ideas, req);
    const warnings = [];
    let ai = { used: false, model: null };
    if (req.ai && rows.length) {
      const c = await classifier();
      if (c.available) {
        emit({ type: "progress", stage: "ai", done: 0, total: rows.length, message: `Clasificando ${rows.length} keywords con IA…` });
        const r = await c.classify(rows, req, (done, total) => emit({ type: "progress", stage: "ai", done, total, message: `IA: ${done} de ${total} keywords clasificadas…` }));
        rows = r.rows; warnings.push(...r.warnings);
        ai = { used: r.aiBatches > 0, model: c.model, batches: r.aiBatches, totalBatches: r.totalBatches };
      } else warnings.push(c.reason);
    }
    rows = rows.map(enrich);
    return { type: "result", ok: true, source, currency, totalSize, request: { seeds: req.seeds, url: req.url, geo: req.geo, language: req.language, network: req.network }, ai, warnings, ms: Date.now() - started, rows };
  }

  return { status, run };
}
