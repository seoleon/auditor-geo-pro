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
    switch (req.url) {
      case "/": return send(301, "text/html", "", { location: "/guia/" });
      case "/guia/": return send(200, "text/html; charset=utf-8", zlib.gzipSync(page("Optimización GEO", "La optimización GEO estructura el contenido para motores de respuesta.")), { "content-encoding": "gzip", "last-modified": "Tue, 06 Oct 2026 10:00:00 GMT" });
      case "/oculta/": return send(200, "text/html; charset=utf-8", page("Página oculta", "Contenido que no debería indexarse."), { "x-robots-tag": "noindex" });
      case "/latin/": return send(200, "text/html; charset=iso-8859-1", Buffer.from(page("España y la eñe", "Mañana habrá información útil."), "latin1"));
      case "/pdf": return send(200, "application/pdf", "%PDF-1.4");
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
