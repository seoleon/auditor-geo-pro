// Pruebas del Keyword Planner: núcleo (reglas, tendencias, CSV), cliente de Google Ads contra un
// servidor simulado, clasificación con Claude contra una API simulada, endpoint NDJSON y la página.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as playwright from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { classifyHeuristic, classifyAllHeuristic, trendStats, toCsv, demoIdeas, enrich, summarize, parseList } from "../keyword-core.js";
import { createKeywordPlanner, createGoogleAdsClient, createClaudeClassifier, parseRequest, normalizeIdea, googleErrorMessage, configFromEnv } from "../keyword-planner.mjs";
import { createServer } from "../server.mjs";

const BROWSER = process.env.BROWSER || "chromium";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}`)));
const readBody = req => new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString())); });

// ===== Google Ads simulado =====
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const idea = (text, avg, extra = {}) => ({
  text,
  keywordIdeaMetrics: {
    avgMonthlySearches: String(avg), competition: extra.competition || "MEDIUM", competitionIndex: String(extra.ci ?? 50),
    lowTopOfPageBidMicros: "450000", highTopOfPageBidMicros: "2310000",
    // Desordenado a propósito: la app debe ordenarlo cronológicamente.
    monthlySearchVolumes: MONTHS.map((month, i) => ({ month, year: i >= 9 ? "2025" : "2026", monthlySearches: String(Math.round(avg * (i === 8 ? 2 : 1))) })).reverse()
  }
});
const PAGE1 = [idea("keyword research", 2400, { competition: "LOW", ci: 12 }), idea("comprar herramienta keyword research", 90, { competition: "HIGH", ci: 88 }), idea("Keyword Research", 999), idea("semrush keyword research", 320), idea("que es keyword research", 880)];
const PAGE2 = [idea("mejores herramientas keyword research", 210), idea("acme keywords login", 40), idea("=HYPERLINK(\"x\")", 10)];
const ads = { tokenCalls: 0, ideaCalls: [], fail: null };
let adsBase;
const adsServer = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.url === "/token") {
    ads.tokenCalls++;
    const p = new URLSearchParams(body);
    if (p.get("refresh_token") === "caducado") return send(400, { error: "invalid_grant" });
    return send(200, { access_token: "ya29.test", expires_in: 3599 });
  }
  if (req.headers.authorization !== "Bearer ya29.test" || req.headers["developer-token"] !== "dev-123") return send(401, { error: { message: "unauthenticated" } });
  if (req.url === "/v25/customers/1234567890/googleAds:search") return send(200, { results: [{ customer: { currencyCode: "EUR" } }] });
  if (req.url === "/v25/customers/1234567890:generateKeywordIdeas") {
    const json = JSON.parse(body);
    ads.ideaCalls.push({ json, login: req.headers["login-customer-id"] });
    if (ads.fail) return send(ads.fail.status, ads.fail.body);
    return json.pageToken === "p2" ? send(200, { results: PAGE2, totalSize: "8" }) : send(200, { results: PAGE1, nextPageToken: "p2", totalSize: "8" });
  }
  send(404, { error: { message: "no existe" } });
});
const googleCfg = () => ({ developerToken: "dev-123", clientId: "cid", clientSecret: "secret", refreshToken: "rt", customerId: "1234567890", loginCustomerId: "9999999999", apiVersion: "v25", apiBase: adsBase, tokenUrl: `${adsBase}/token` });

// ===== API de Anthropic simulada =====
const claude = { calls: [], mode: "ok" };
let claudeBase;
const claudeServer = http.createServer(async (req, res) => {
  const body = JSON.parse(await readBody(req) || "{}");
  claude.calls.push({ url: req.url, body, beta: req.headers["anthropic-beta"] });
  if (claude.mode === "auth") { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })); }
  const lines = body.messages[0].content.split("\n").filter(l => /^\d+\t/.test(l));
  const items = lines.map(l => {
    const [i, kw] = l.split("\t");
    const brand = /acme/.test(kw) ? "own" : /semrush/.test(kw) ? "other" : "none";
    return { i: Number(i), intent: /login/.test(kw) ? "navigational" : /mejores/.test(kw) ? "commercial" : /comprar/.test(kw) ? "transactional" : "informational", brand, brand_name: brand === "own" ? "acme" : brand === "other" ? "semrush" : "" };
  });
  const message = { id: "msg_test", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify({ items }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(message));
});
const anthropicClient = () => new Anthropic({ apiKey: "test-key", baseURL: claudeBase, maxRetries: 0 });
const aiCfg = { enabled: true, hasKey: true, model: "claude-opus-5-5" };

let browser, app, appBase, staticServer, staticBase;
before(async () => {
  adsBase = await listen(adsServer);
  claudeBase = await listen(claudeServer);
  app = createServer({ planner: createKeywordPlanner({ google: googleCfg(), ai: aiCfg }, { anthropic: anthropicClient() }) });
  appBase = await listen(app);
  // Servidor estático (como GitHub Pages): sin API, la página funciona en modo demo.
  staticServer = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": { ".html": "text/html; charset=utf-8", ".js": "text/javascript" }[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  staticBase = await listen(staticServer);
  browser = await playwright[BROWSER].launch();
});
after(async () => {
  await browser?.close();
  for (const s of [adsServer, claudeServer, app, staticServer]) await new Promise(r => s.close(r));
});

// ===== Núcleo =====
test("reglas: intención y marca en español e inglés", () => {
  const brands = { ownBrands: ["Acme"], competitors: ["semrush", "home depot"] };
  const c = kw => classifyHeuristic(kw, brands);
  assert.deepEqual([c("comprar zapatillas").intent, c("precio hosting").intent, c("cerca de mi fontanero").intent], ["transactional", "transactional", "transactional"]);
  assert.deepEqual([c("mejores cámaras 2026").intent, c("seo vs sem").intent, c("opiniones acme").intent], ["commercial", "commercial", "commercial"]);
  assert.equal(c("¿Qué es el SEO?").intent, "informational");
  assert.equal(c("Cómo hacer keyword research").intent, "informational");
  assert.deepEqual(c("acme"), { intent: "navigational", brand: "own", brandName: "acme", source: "reglas" });
  assert.equal(c("semrush login").intent, "navigational");
  assert.equal(c("semrush login").brand, "other");
  assert.equal(c("homedepot horario").brand, "other", "las marcas de varias palabras admiten la variante sin espacio");
  assert.equal(c("acmeísmo").brand, "none", "solo palabra completa");
  assert.equal(c("keyword research").brand, "none");
});

test("tendencias: interanual, 3 meses, pico y estacionalidad", () => {
  const monthly = MONTHS.map((month, i) => ({ year: 2026, month, searches: i === 11 ? 200 : 100 }));
  const t = trendStats(monthly);
  assert.equal(t.yoy, 100);
  assert.equal(t.threeMonth, 33);
  assert.equal(t.peakMonth, "DECEMBER");
  assert.ok(t.seasonality > 0);
  assert.deepEqual(trendStats([]), { yoy: null, threeMonth: null, peakMonth: null, seasonality: null });
  assert.equal(trendStats([{ searches: 0 }, { searches: 0 }, { searches: 5 }]).yoy, null, "sin 12 meses no hay interanual");
});

test("CSV: separador ;, decimales con coma, comillas y sin inyección de fórmulas", () => {
  const rows = classifyAllHeuristic([{ keyword: '=cmd|"/c calc"!A1', volume: 10, competition: "LOW", competitionIndex: 5, cpcLow: 0.5, cpcHigh: 1.25, monthly: [{ year: 2026, month: "MAY", searches: 10 }] }, { keyword: "uno; dos", volume: 20, competition: "HIGH", competitionIndex: 90, cpcLow: null, cpcHigh: null, monthly: [] }]).map(enrich);
  const csv = toCsv(rows, { currency: "EUR" });
  assert.ok(csv.startsWith("﻿Keyword;Intención;Marca"));
  assert.match(csv, /CPC alto \(EUR\)/);
  assert.match(csv, /may 2026/);
  assert.match(csv, /"'=cmd\|""\/c calc""!A1"/);
  assert.match(csv, /;0,5;1,25;/);
  assert.match(csv, /"uno; dos"/);
});

test("demo: determinista, sin duplicados y con 12 meses", () => {
  const a = demoIdeas(["seo local"]), b = demoIdeas(["SEO Local"]);
  assert.deepEqual(a, b);
  assert.ok(a.length > 100);
  assert.equal(new Set(a.map(r => r.keyword.toLowerCase())).size, a.length);
  assert.ok(a.every(r => r.monthly.length === 12 && r.cpcHigh >= r.cpcLow));
  assert.equal(demoIdeas(["seo"], { max: 25 }).length, 25);
  const s = summarize(classifyAllHeuristic(a).map(enrich));
  assert.equal(Object.values(s.intents).reduce((x, y) => x + y, 0), a.length);
  assert.deepEqual(parseList("a, b\nA ;c", 2), ["a", "b"]);
});

test("validación de la petición", () => {
  assert.throws(() => parseRequest({}), /al menos una keyword/);
  assert.throws(() => parseRequest({ seeds: Array.from({ length: 21 }, (_, i) => `kw ${i}`) }), /máximo 20/);
  assert.throws(() => parseRequest({ seeds: "x".repeat(81) }), /80 caracteres/);
  assert.throws(() => parseRequest({ url: "javascript:alert(1)" }), /URL semilla/);
  const r = parseRequest({ seeds: "a\nb\na", url: "ejemplo.com/x", geo: "2484", max: 999999, network: "otra", ownBrands: "Acme, ACME" });
  assert.deepEqual(r.seeds, ["a", "b"]);
  assert.equal(r.url, "https://ejemplo.com/x");
  assert.equal(r.max, 10000);
  assert.equal(r.network, "GOOGLE_SEARCH");
  assert.deepEqual(r.ownBrands, ["Acme"]);
  assert.equal(parseRequest({ seeds: "a", geo: "" }).geo, "", "todas las ubicaciones");
  const cfg = configFromEnv({ GOOGLE_ADS_CUSTOMER_ID: "123-456-7890", ANTHROPIC_API_KEY: "" });
  assert.equal(cfg.google.customerId, "1234567890");
  assert.equal(cfg.ai.hasKey, false);
  assert.equal(cfg.ai.model, "claude-opus-5-5");
});

// ===== Google Ads =====
test("Google Ads: OAuth, cabeceras, semillas, paginación, micros y deduplicado", async () => {
  ads.ideaCalls = []; ads.tokenCalls = 0;
  const client = createGoogleAdsClient(googleCfg());
  const req = parseRequest({ seeds: "keyword research", url: "https://ejemplo.com/", geo: "2724", language: "1003" });
  const pages = [];
  const r = await client.generateIdeas(req, (n, total) => pages.push([n, total]));
  assert.equal(ads.ideaCalls.length, 2);
  const first = ads.ideaCalls[0];
  assert.equal(first.login, "9999999999");
  assert.deepEqual(first.json.keywordAndUrlSeed, { url: "https://ejemplo.com/", keywords: ["keyword research"] });
  assert.deepEqual(first.json.geoTargetConstants, ["geoTargetConstants/2724"]);
  assert.equal(first.json.language, "languageConstants/1003");
  assert.equal(ads.ideaCalls[1].json.pageToken, "p2");
  assert.equal(r.ideas.length, 7, "«Keyword Research» duplicada se descarta");
  assert.equal(r.total, 8);
  assert.deepEqual(pages, [[4, 8], [7, 8]]);
  const kr = r.ideas[0];
  assert.equal(kr.volume, 2400);
  assert.equal(kr.cpcLow, 0.45);
  assert.equal(kr.cpcHigh, 2.31);
  assert.equal(kr.competition, "LOW");
  assert.deepEqual(kr.monthly.slice(0, 2).map(m => `${m.month} ${m.year}`), ["OCTOBER 2025", "NOVEMBER 2025"]);
  assert.equal(await client.currencyCode(), "EUR");
  await client.generateIdeas(parseRequest({ url: "https://ejemplo.com/", max: 10 }));
  assert.deepEqual(ads.ideaCalls.at(-1).json.urlSeed, { url: "https://ejemplo.com/" });
  assert.equal(ads.tokenCalls, 1, "el access token se reutiliza");
});

test("Google Ads: errores con mensajes accionables", async () => {
  assert.match(googleErrorMessage(403, { error: { details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "x" }] }] } }), /acceso Basic/);
  assert.match(googleErrorMessage(403, { error: { details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }] }] } }), /LOGIN_CUSTOMER_ID/);
  assert.match(googleErrorMessage(429, {}), /cuota/);
  assert.match(googleErrorMessage(500, { error: { message: "boom" } }), /500: boom/);
  ads.fail = { status: 403, body: { error: { details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" } }] }] } } };
  try {
    await assert.rejects(createGoogleAdsClient(googleCfg()).generateIdeas(parseRequest({ seeds: "x" })), /cuentas de prueba/);
  } finally { ads.fail = null; }
  await assert.rejects(createGoogleAdsClient({ ...googleCfg(), refreshToken: "caducado" }).generateIdeas(parseRequest({ seeds: "x" })), /caducado o se revocó/);
  assert.deepEqual(createGoogleAdsClient({ ...googleCfg(), developerToken: "", customerId: "" }).missing, ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]);
  assert.equal(normalizeIdea({ text: " x ", keywordIdeaMetrics: { competition: "UNSPECIFIED" } }).competition, "UNKNOWN");
});

// ===== Claude =====
test("Claude: lotes, salida estructurada, fallbacks y respaldo por reglas", async () => {
  claude.calls = []; claude.mode = "ok";
  const c = await createClaudeClassifier(aiCfg, { client: anthropicClient() });
  assert.equal(c.available, true);
  const rows = classifyAllHeuristic(Array.from({ length: 450 }, (_, i) => ({ keyword: i === 7 ? "acme keywords login" : i === 8 ? "semrush keyword research" : `keyword ${i}`, volume: 1 })));
  const progress = [];
  const r = await c.classify(rows, { geo: "2724", language: "1003", ownBrands: ["Acme"], competitors: [] }, d => progress.push(d));
  assert.equal(claude.calls.length, 3, "450 keywords → 3 lotes de 200");
  const call = claude.calls[0];
  assert.equal(call.body.model, "claude-opus-5-5");
  assert.equal(call.body.fallbacks, "default");
  assert.match(call.beta, /server-side-fallback-2026-07-01/);
  assert.equal(call.body.output_config.effort, "low");
  assert.equal(call.body.output_config.format.type, "json_schema");
  assert.match(call.body.messages[0].content, /Mercado: España · idioma: Español/);
  assert.match(call.body.messages[0].content, /Marcas propias: Acme/);
  assert.equal(r.rows[7].intent, "navigational");
  assert.equal(r.rows[7].brand, "own");
  assert.equal(r.rows[8].brandName, "semrush");
  assert.ok(r.rows.every(x => x.source === "IA"));
  assert.equal(r.aiBatches, 3);
  assert.equal(progress.at(-1), 450);

  claude.mode = "auth";
  const bad = await c.classify(rows.slice(0, 5), { geo: "", language: "1000", ownBrands: [], competitors: [] });
  assert.ok(bad.rows.every(x => x.source === "reglas"));
  assert.match(bad.warnings[0], /ANTHROPIC_API_KEY/);
  claude.mode = "ok";

  const none = await createClaudeClassifier({ ...aiCfg, hasKey: false });
  assert.equal(none.available, false);
});

// ===== Endpoint =====
test("endpoint: NDJSON con progreso, resultado completo y protección de origen", async () => {
  const res = await fetch(`${appBase}/api/keywords/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seeds: ["keyword research"], ownBrands: "acme" }) });
  assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const lines = (await res.text()).trim().split("\n").map(l => JSON.parse(l));
  assert.ok(lines.some(l => l.type === "progress" && l.stage === "google"));
  assert.ok(lines.some(l => l.type === "progress" && l.stage === "ai"));
  const result = lines.at(-1);
  assert.equal(result.type, "result");
  assert.equal(result.source, "google");
  assert.equal(result.currency, "EUR");
  assert.equal(result.rows.length, 7);
  assert.equal(result.ai.used, true);
  assert.ok(result.rows.every(r => typeof r.words === "number" && "yoy" in r));

  const status = await (await fetch(`${appBase}/api/keywords/status`)).json();
  assert.equal(status.google.configured, true);
  assert.equal(status.ai.model, "claude-opus-5-5");
  assert.ok(!JSON.stringify(status).includes("secret"), "el estado no expone credenciales");

  assert.equal((await fetch(`${appBase}/api/keywords/ideas`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })).status, 403);
  assert.equal((await fetch(`${appBase}/api/keywords/ideas`, { method: "POST", headers: { "content-type": "application/json", origin: "https://malicioso.example" }, body: "{}" })).status, 403);
  assert.equal((await fetch(`${appBase}/api/keywords/ideas`)).status, 405);
  const badJson = await fetch(`${appBase}/api/keywords/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: "{no" });
  assert.equal(badJson.status, 400);
  const err = (await (await fetch(`${appBase}/api/keywords/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).text()).trim();
  assert.match(JSON.parse(err).error, /al menos una keyword/);
});

// ===== Página =====
async function openPage(url, opts = {}) {
  const context = await browser.newContext({ acceptDownloads: true, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  return { page, context, errors };
}

test("página: búsqueda real, filtros, orden, paginación y exportación CSV", async () => {
  const { page, context, errors } = await openPage(`${appBase}/keywords.html`);
  await page.waitForFunction(() => /Google Ads API v25/.test(document.querySelector("#googleChip").textContent));
  assert.match(await page.textContent("#aiChip"), /claude-opus-5-5/);
  await page.fill("#seeds", "keyword research");
  await page.fill("#ownBrands", "acme");
  await page.click("#searchBtn");
  await page.waitForSelector("#results:not([hidden])");
  assert.equal(await page.locator("#kwBody tr").count(), 7);
  assert.equal(await page.textContent("#sumTotal"), "7");
  assert.match(await page.textContent("#sumSource"), /Google Ads API · clasificadas con IA/);
  assert.match(await page.textContent("#kwBody tr:first-child"), /keyword research.*Informacional.*Non-brand.*2400|keyword research/s);
  assert.match(await page.textContent("#kwBody"), /0,45\s€/);
  // El texto malicioso de la API se muestra como texto, no se ejecuta.
  assert.equal(await page.locator("#kwBody a").count(), 0);

  await page.click('#fIntents [data-intent="informational"]');
  await page.click('#fIntents [data-intent="commercial"]');
  await page.click('#fIntents [data-intent="transactional"]');
  assert.equal(await page.locator("#kwBody tr").count(), 1);
  assert.match(await page.textContent("#kwBody"), /acme keywords login.*Marca propia/s);
  await page.click("#resetFilters");
  await page.selectOption("#fBrand", "brand");
  assert.equal(await page.locator("#kwBody tr").count(), 2);
  await page.selectOption("#fBrand", "all");
  await page.fill("#fExclude", "semrush, login");
  await page.waitForFunction(() => document.querySelectorAll("#kwBody tr").length === 5);
  await page.fill("#fExclude", "");
  await page.fill("#fVolMin", "100000");
  await page.waitForFunction(() => /Ninguna keyword/.test(document.querySelector("#kwBody").textContent));
  await page.click("#resetFilters");

  await page.click('th[data-key="keyword"] button');
  assert.equal(await page.getAttribute('th[data-key="keyword"]', "aria-sort"), "ascending");
  assert.match(await page.textContent("#kwBody tr:first-child td.kw"), /acme keywords login|=HYPERLINK/);

  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportCsv")]);
  assert.equal(download.suggestedFilename(), "keywords-keyword-research.csv");
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.equal(csv.trim().split("\r\n").length, 8);
  assert.match(csv, /"'=HYPERLINK/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("página sin servidor (GitHub Pages): demo con reglas y sin errores", async () => {
  const { page, context, errors } = await openPage(`${staticBase}/keywords.html`);
  await page.waitForFunction(() => /solo demo/.test(document.querySelector("#googleChip").textContent));
  assert.equal(await page.isDisabled("#searchBtn"), true);
  assert.equal(await page.isVisible("#setupHelp"), true);
  await page.click("#demoBtn");
  await page.waitForSelector("#results:not([hidden])");
  assert.equal(await page.locator("#kwBody tr").count(), 100, "se pagina de 100 en 100");
  assert.match(await page.textContent("#messages"), /datos de demostración/);
  await page.click("#nextPage");
  assert.match(await page.textContent("#pageInfo"), /Página 2/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("página: accesibilidad (axe) en claro y oscuro, y sin scroll horizontal en móvil", async () => {
  for (const colorScheme of ["light", "dark"]) {
    const { page, context } = await openPage(`${staticBase}/keywords.html`, { colorScheme });
    await page.waitForFunction(() => /solo demo/.test(document.querySelector("#googleChip").textContent));
    await page.click("#demoBtn");
    await page.waitForSelector("#results:not([hidden])");
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`));
    assert.deepEqual(violations, [], `${colorScheme}: ${violations.join("\n")}`);
    await context.close();
  }
  const { page, context } = await openPage(`${staticBase}/keywords.html`, { viewport: { width: 375, height: 800 } });
  await page.click("#demoBtn");
  await page.waitForSelector("#results:not([hidden])");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal");
  await context.close();
});
