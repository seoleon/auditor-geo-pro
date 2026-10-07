// Pruebas del rastreo de URLs: servidor (server.mjs), Worker de Cloudflare y app de principio a fin.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { createServer, crawl, isPrivateIp } from "../server.mjs";
import worker, { crawl as workerCrawl } from "../worker/cloudflare-proxy.js";

const page = (title, body, extra = "") => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="Guía práctica sobre ${title} con datos y ejemplos reales.">${extra}</head><body><main><h1>${title}</h1><h2>¿Qué es ${title}?</h2><p>${body} Según el estudio de 2025, el 42 % de los casos mejora con una respuesta directa.</p><h2>¿Cómo se aplica?</h2><p>Se aplica en tres pasos medibles con datos propios.</p></main></body></html>`;
let fixture, fx, app, base, browser;

before(async () => {
  fixture = http.createServer((req, res) => {
    const send = (code, type, body, headers = {}) => { res.writeHead(code, { "content-type": type, ...headers }); res.end(body); };
    switch (new URL(req.url, "http://x").pathname) {
      case "/": return send(301, "text/html", "", { location: "/guia/" });
      case "/guia/": return send(200, "text/html; charset=utf-8", zlib.gzipSync(page("Optimización GEO", "La optimización GEO estructura el contenido para motores de respuesta.")), { "content-encoding": "gzip", "last-modified": "Tue, 06 Oct 2026 10:00:00 GMT" });
      case "/oculta/": return send(200, "text/html; charset=utf-8", page("Página oculta", "Contenido que no debería indexarse."), { "x-robots-tag": "noindex" });
      case "/latin/": return send(200, "text/html; charset=iso-8859-1", Buffer.from(page("España y la eñe", "Mañana habrá información útil."), "latin1"));
      case "/pdf": return send(200, "application/pdf", "%PDF-1.4");
      case "/lento": res.writeHead(200, { "content-type": "text/html" }); { const t = setInterval(() => { if (res.destroyed) return clearInterval(t); res.write("<p>.</p>"); }, 200); req.on("close", () => clearInterval(t)); } return;
      case "/badloc": return send(302, "text/html", "", { location: "http://[mal" });
      case "/raw-deflate": return send(200, "text/html; charset=utf-8", zlib.deflateRawSync(page("Deflate crudo", "Contenido comprimido sin cabecera zlib.")), { "content-encoding": "deflate" });
      case "/bomba": return send(200, "text/html", zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, 32)), { "content-encoding": "gzip" });
      case "/sitemap.xml.gz": return send(200, "application/gzip", zlib.gzipSync(`<?xml version="1.0"?><urlset><url><loc>${fx}/guia/</loc></url><url><loc>${fx}/latin/</loc></url></urlset>`));
      case "/otro-bot/": return send(200, "text/html; charset=utf-8", page("Solo bloquea a otro bot", "Indexable para Google."), { "x-robots-tag": "otrobot: noindex, nofollow" });
      case "/google-noindex/": return send(200, "text/html; charset=utf-8", page("Bloqueada para Google", "No indexable en Google."), { "x-robots-tag": "max-snippet: 50, googlebot: noindex" });
      case "/sin-robots/robots.txt": return send(404, "text/html", "<h1>No</h1>");
      case "/loop": return send(302, "text/html", "", { location: "/loop" });
      case "/grande": return send(200, "text/html", "<p>" + "x".repeat(9 * 1024 * 1024) + "</p>");
      case "/robots.txt": return send(200, "text/plain", "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: /sitemap.xml\n");
      case "/llms.txt": return send(200, "text/plain", "# Fixture\n> Sitio de prueba\n");
      case "/sitemap.xml": return send(200, "application/xml", `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${fx}/sitemap-paginas.xml</loc></sitemap></sitemapindex>`);
      case "/sitemap-paginas.xml": return send(200, "application/xml", `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${fx}/guia/</loc></url><url><loc>${fx}/oculta/</loc></url><url><loc>${fx}/latin/</loc></url></urlset>`);
      default: return send(404, "text/html", "<h1>No existe</h1>");
    }
  });
  await new Promise(r => fixture.listen(0, "127.0.0.1", r));
  fx = `http://127.0.0.1:${fixture.address().port}`;
  app = createServer({ allowPrivate: true });
  await new Promise(r => app.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise(r => app.close(r));
  await new Promise(r => fixture.close(r));
});

test("isPrivateIp distingue redes privadas y públicas", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});

test("crawl sigue redirecciones, descomprime gzip y respeta el charset", async () => {
  const r = await crawl(fx + "/", { allowPrivate: true });
  assert.equal(r.status, 200);
  assert.equal(r.finalUrl, fx + "/guia/");
  assert.deepEqual(r.redirects.map(x => x.status), [301]);
  assert.match(r.body, /Optimización GEO/);
  assert.equal(r.headers["last-modified"], "Tue, 06 Oct 2026 10:00:00 GMT");
  const latin = await crawl(fx + "/latin/", { allowPrivate: true });
  assert.match(latin.body, /España y la eñe/);
  const missing = await crawl(fx + "/no-existe", { allowPrivate: true });
  assert.equal(missing.status, 404);
});

test("crawl corta bucles de redirección, respuestas gigantes y redes privadas", async () => {
  await assert.rejects(crawl(fx + "/loop", { allowPrivate: true }), /Demasiadas redirecciones/);
  await assert.rejects(crawl(fx + "/grande", { allowPrivate: true }), /8 MB/);
  await assert.rejects(crawl(fx + "/guia/"), /bloqueado/);
  await assert.rejects(crawl("http://localhost:1/"), /bloqueado/);
  await assert.rejects(crawl("ftp://ejemplo.com/"), /http\(s\)/);
});

test("la API del servidor valida entradas y no expone archivos internos", async () => {
  const strict = createServer({ allowPrivate: false });
  await new Promise(r => strict.listen(0, "127.0.0.1", r));
  const s = `http://127.0.0.1:${strict.address().port}`;
  try {
    assert.deepEqual(await (await fetch(s + "/auditor.config.json")).json(), { crawler: "self" });
    assert.equal((await (await fetch(s + "/api/health")).json()).ok, true);
    let r = await fetch(s + "/api/fetch?url=" + encodeURIComponent("file:///etc/passwd"));
    assert.equal(r.status, 400);
    r = await fetch(s + "/api/fetch?url=no-es-url");
    assert.equal(r.status, 400);
    r = await fetch(s + "/api/fetch?url=" + encodeURIComponent(fx + "/guia/"));
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.ok, false); assert.equal(j.code, "BLOCKED"); assert.match(j.error, /bloqueado/);
    j = await (await fetch(s + "/api/fetch?url=" + encodeURIComponent("https://dominio-inexistente.invalid/"))).json();
    assert.equal(j.ok, false); assert.match(j.error, /dominio|DNS/);
    for (const p of ["/server.mjs", "/package.json", "/../package.json", "/tests/crawler.test.mjs", "/node_modules/playwright/package.json", "/.git/config"]) assert.equal((await fetch(s + p)).status, 404, p);
    assert.equal((await fetch(s + "/")).status, 200);
    assert.equal((await fetch(s + "/sw.js")).status, 200);
  } finally { await new Promise(r => strict.close(r)); }
});

test("el Worker de Cloudflare cumple el mismo contrato", async () => {
  const call = (path, env = {}, headers = {}) => worker.fetch(new Request("https://worker.example" + path, { headers }), env);
  let r = await call("/api/fetch?url=" + encodeURIComponent(fx + "/"), { ALLOW_PRIVATE: "1" });
  let j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.finalUrl, fx + "/guia/");
  assert.deepEqual(j.redirects.map(x => x.status), [301]);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  r = await call("/api/fetch?url=" + encodeURIComponent(fx + "/guia/"));
  j = await r.json();
  assert.equal(j.ok, false); assert.equal(j.code, "BLOCKED");
  r = await call("/api/health", { ALLOWED_ORIGIN: "https://seoleon.github.io" }, { origin: "https://evil.example" });
  assert.equal(r.headers.get("access-control-allow-origin"), "null");
  r = await call("/api/health", { ALLOWED_ORIGIN: "https://seoleon.github.io" }, { origin: "https://seoleon.github.io" });
  assert.equal(r.headers.get("access-control-allow-origin"), "https://seoleon.github.io");
  await assert.rejects(workerCrawl(fx + "/loop", { allowPrivate: true }), /Demasiadas redirecciones/);
  await assert.rejects(workerCrawl(fx + "/grande", { allowPrivate: true }), /8 MB/);
});

async function openApp() {
  const context = await browser.newContext();
  const p = await context.newPage();
  const errors = [];
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", e => errors.push("pageerror: " + e.message));
  await p.goto(base);
  await p.waitForFunction(() => document.querySelector("#crawlerChip").textContent === "RASTREO ACTIVO");
  return { p, context, errors };
}

test("app: una URL se descarga, se audita y muestra el rastreo en vivo", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#urlList", fx + "/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.equal(await p.evaluate(() => document.querySelector("#results").style.display), "block");
  assert.equal(await p.inputValue("#pageUrl"), fx + "/guia/");
  assert.match(await p.inputValue("#robots"), /GPTBot/);
  assert.match(await p.inputValue("#llms"), /Fixture/);
  assert.equal(await p.evaluate(() => document.querySelector("#crawlPanel").style.display), "block");
  const grid = await p.locator("#crawlGrid").innerText();
  assert.match(grid, /301 → 200/);
  assert.match(grid, /Encontrado/);
  assert.match(await p.textContent("#serpTitle"), /Optimización GEO/);
  // El motor por crawler usa el robots.txt real: GPTBot bloqueado
  assert.match(await p.locator("#techGrid").innerText(), /GPTBot/);
  // Exportaciones incluyen el rastreo
  const [d] = await Promise.all([p.waitForEvent("download"), p.click("#jsonBtn")]);
  const json = JSON.parse(await (await import("node:fs")).promises.readFile(await d.path(), "utf8"));
  assert.equal(json.crawl.first.status, 200);
  assert.equal(json.crawl.first.body, undefined);
  // Pegar otro contenido a mano oculta el rastreo (ya no corresponde)
  await p.click("#sampleBtn");
  assert.equal(await p.evaluate(() => document.querySelector("#crawlPanel").style.display), "none");
  assert.deepEqual(errors, []);
  await context.close();
});

test("app: varias URLs crean el lote, aplican X-Robots-Tag y registran errores", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#urlList", [fx + "/guia/", fx + "/oculta/", fx + "/latin/", fx + "/no-existe", fx + "/pdf", fx + "/loop", "esto no es url"].join("\n"));
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  const log = await p.textContent("#crawlLog");
  assert.match(log, /HTTP 404/);
  assert.match(log, /no es HTML/);
  assert.match(log, /ignoradas/);
  assert.match(log, /Demasiadas redirecciones/);
  assert.equal(await p.locator("#batchBody tr").count(), 3);
  assert.equal(await p.locator("#crawlBody tr").count(), 6);
  assert.match(await p.locator("#crawlBody").innerText(), /noindex/);
  // Exportar el lote a CSV
  const [d] = await Promise.all([p.waitForEvent("download"), p.click("#batchCsvBtn")]);
  const csv = await (await import("node:fs")).promises.readFile(await d.path(), "utf8");
  assert.equal(csv.trim().split("\n").length, 4);
  assert.match(csv, /Veredicto quality/);
  // La URL con X-Robots-Tag: noindex bloquea la publicación si se audita sola
  await p.fill("#urlList", fx + "/oculta/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.match(await p.locator("#crawlGrid").innerText(), /noindex/);
  assert.equal(await p.textContent("#releaseState"), "BLOQUEADO");
  assert.deepEqual(errors, []);
  await context.close();
});

test("app: el sitemap índice se expande y se audita en lote", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#sitemapUrl", fx + "/sitemap.xml");
  await p.fill("#sitemapMax", "2");
  await p.click("#sitemapBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.equal((await p.inputValue("#urlList")).split("\n").length, 2);
  assert.equal(await p.locator("#batchBody tr").count(), 2);
  assert.match(await p.textContent("#crawlLog"), /Índice de sitemaps/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("app: en hosting estático sin rastreador lo indica sin errores en consola", async () => {
  const stat = http.createServer((req, res) => {
    if (req.url === "/auditor.config.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{ "crawler": "" }'); }
    app.emit("request", req, res);
  });
  await new Promise(r => stat.listen(0, "127.0.0.1", r));
  const context = await browser.newContext(); const p = await context.newPage(); const errors = [];
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`http://127.0.0.1:${stat.address().port}/`);
  await p.waitForFunction(() => document.querySelector("#crawlerChip").textContent === "SIN RASTREO");
  assert.match(await p.textContent("#crawlerHelp"), /Worker/);
  assert.deepEqual(errors, []);
  await context.close();
  await new Promise(r => stat.close(r));
});

test("regresión: límite de tiempo total, Location inválida, deflate crudo, bomba de compresión y sitemap .gz", async () => {
  const t0 = Date.now();
  await assert.rejects(crawl(fx + "/lento", { allowPrivate: true, timeoutMs: 1500 }), /Tiempo de espera/);
  assert.ok(Date.now() - t0 < 4000, "el goteo lento no debe bloquear el rastreo");
  await assert.rejects(crawl(fx + "/badloc", { allowPrivate: true }), /redirección no válida/i);
  assert.match((await crawl(fx + "/raw-deflate", { allowPrivate: true })).body, /Deflate crudo/);
  await assert.rejects(crawl(fx + "/bomba", { allowPrivate: true }), /8 MB/);
  assert.match((await crawl(fx + "/sitemap.xml.gz", { allowPrivate: true })).body, /<loc>/);
  // El Worker aplica las mismas reglas
  const t1 = Date.now();
  await assert.rejects(workerCrawl(fx + "/lento", { allowPrivate: true, timeoutMs: 1500 }), /Tiempo de espera/);
  assert.ok(Date.now() - t1 < 4000);
  await assert.rejects(workerCrawl(fx + "/badloc", { allowPrivate: true }), /redirección no válida/i);
  assert.match((await workerCrawl(fx + "/sitemap.xml.gz", { allowPrivate: true })).body, /<loc>/);
});

test("regresión: una ruta mal codificada no tumba el servidor", async () => {
  const s = createServer({ allowPrivate: false });
  await new Promise(r => s.listen(0, "127.0.0.1", r));
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    const raw = await new Promise((resolve, reject) => { http.get(b + "/%E0%A4%A", r => { r.resume(); resolve(r.statusCode); }).on("error", reject); });
    assert.equal(raw, 400);
    assert.equal((await (await fetch(b + "/api/health")).json()).ok, true);
  } finally { await new Promise(r => s.close(r)); }
});

test("regresión: npm start solo escucha en localhost (no es un proxy abierto en la red)", async () => {
  const { spawn } = await import("node:child_process");
  const os = await import("node:os");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  try {
    await new Promise((resolve, reject) => { child.stdout.on("data", d => /localhost/.test(String(d)) && resolve()); child.on("exit", c => reject(new Error("exit " + c))); setTimeout(() => reject(new Error("timeout")), 8000); });
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).ok, true);
    const external = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === "IPv4" && !i.internal);
    if (external) await assert.rejects(fetch(`http://${external.address}:${port}/api/health`));
  } finally { child.kill(); }
});

test("regresión: el service worker no guarda las páginas rastreadas en caché", async () => {
  const { p, context, errors } = await openApp();
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller && document.querySelector("#crawlerChip").textContent === "RASTREO ACTIVO");
  await p.fill("#urlList", fx + "/guia/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  await p.waitForTimeout(300);
  const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
  assert.ok(cached.length > 0, "la app sí debe estar en caché");
  assert.deepEqual(cached.filter(u => u.includes("/api/")), []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("regresión: X-Robots-Tag por bot, robots.txt de otro dominio y URLs con comas", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#urlList", fx + "/otro-bot/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.notEqual(await p.textContent("#releaseState"), "BLOQUEADO");
  assert.doesNotMatch(await p.locator("#crawlGrid").innerText(), /impide indexar/);
  await p.fill("#urlList", fx + "/google-noindex/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.equal(await p.textContent("#releaseState"), "BLOQUEADO");
  // robots.txt/llms.txt rellenados automáticamente se vacían si el nuevo sitio no los tiene
  assert.match(await p.inputValue("#robots"), /GPTBot/);
  const other = http.createServer((q, r) => { if (q.url === "/") { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(page("Otro sitio", "Sin robots.txt ni llms.txt.")); } else { r.writeHead(404, { "content-type": "text/html" }); r.end("<h1>404</h1>"); } });
  await new Promise(r => other.listen(0, "127.0.0.1", r));
  try {
    await p.fill("#urlList", `http://127.0.0.1:${other.address().port}/`);
    await p.click("#crawlBtn");
    await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
    assert.equal(await p.inputValue("#robots"), "", "no debe quedar el robots.txt del sitio anterior");
    assert.equal(await p.inputValue("#llms"), "");
  } finally { await new Promise(r => other.close(r)); }
  // Lo que escribe el usuario a mano nunca se sobrescribe
  await p.evaluate(() => { document.querySelector("details.advanced").open = true; });
  await p.fill("#robots", "User-agent: *\nDisallow: /privado/");
  await p.fill("#urlList", fx + "/guia/");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.match(await p.inputValue("#robots"), /privado/);
  // Una URL con coma no se parte
  await p.fill("#urlList", fx + "/guia/?a=1,2");
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.equal(await p.inputValue("#pageUrl"), fx + "/guia/?a=1,2");
  assert.doesNotMatch(await p.textContent("#crawlLog"), /ignoradas/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("lote: «Ver» abre la auditoría completa de cualquier URL del lote", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#urlList", [fx + "/guia/", fx + "/latin/"].join("\n"));
  await p.click("#crawlBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  await p.click(`[data-open-doc="${fx}/latin/"]`);
  assert.equal(await p.inputValue("#pageUrl"), fx + "/latin/");
  assert.match(await p.textContent("#serpTitle"), /España y la eñe/);
  assert.equal(await p.locator("#batchBody tr").count(), 2, "el lote sigue visible");
  assert.equal(await p.evaluate(() => document.querySelector("#crawlPanel").style.display), "block");
  assert.match(await p.locator("#crawlGrid").innerText(), new RegExp(fx.replace(/[.]/g, "\\.") + "/latin/"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("atajos: pegar una URL en el cuadro principal o dejarlo vacío con URL la descarga y audita", async () => {
  const { p, context, errors } = await openApp();
  await p.fill("#source", fx + "/guia/");
  await p.click("#scoreBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.match(await p.textContent("#serpTitle"), /Optimización GEO/);
  assert.equal(await p.inputValue("#urlList"), fx + "/guia/");
  // Limpiar mantiene las opciones por defecto del rastreo
  await p.click("#resetBtn");
  assert.equal(await p.isChecked("#autoExtras"), true);
  assert.equal(await p.inputValue("#sitemapMax"), "20");
  await p.evaluate(() => { document.querySelector("details.advanced").open = true; });
  await p.fill("#pageUrl", fx + "/latin/");
  await p.click("#scoreBtn");
  await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
  assert.match(await p.textContent("#serpTitle"), /España/);
  // Intro en el campo del sitemap lo rastrea
  await p.fill("#sitemapUrl", fx + "/sitemap.xml.gz");
  await p.press("#sitemapUrl", "Enter");
  await p.waitForFunction(() => /Auditoría completada: 2/.test(document.querySelector("#crawlLog").textContent));
  assert.equal(await p.locator("#batchBody tr").count(), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test("accesibilidad (axe) de las secciones de rastreo, también en móvil y tema oscuro", async () => {
  const { createRequire } = await import("node:module");
  const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  for (const opts of [{}, { colorScheme: "dark", viewport: { width: 375, height: 800 } }]) {
    const context = await browser.newContext(opts); const p = await context.newPage();
    await p.goto(base);
    await p.waitForFunction(() => document.querySelector("#crawlerChip").textContent === "RASTREO ACTIVO");
    await p.fill("#urlList", [fx + "/guia/", fx + "/oculta/"].join("\n"));
    await p.click("#crawlBtn");
    await p.waitForFunction(() => /Auditoría completada/.test(document.querySelector("#crawlLog").textContent));
    await p.addScriptTag({ path: AXE });
    const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(x => `${x.id}: ${x.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")}`));
    assert.deepEqual(v, [], JSON.stringify(opts));
    if (opts.viewport) assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sin scroll horizontal en móvil");
    await context.close();
  }
});
