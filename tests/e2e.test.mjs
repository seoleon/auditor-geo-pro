// Pruebas end-to-end de Auditor GEO PRO con Playwright + node:test.
// Ejecutar: npm test   (requiere `npx playwright install chromium` la primera vez)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AXE = require.resolve("axe-core/axe.min.js");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, url === "/" ? "index.html" : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise(r => server.close(r));
});

async function openPage(opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.goto(base);
  return { page, context, errors };
}

async function audit(page, src) {
  await page.evaluate(s => { document.querySelector("#source").value = s; }, src);
  await page.click("#scoreBtn");
}

async function download(page, selector) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
  return fs.readFileSync(await d.path(), "utf8");
}

const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b/;

test("la demo genera el informe completo sin errores", async () => {
  const { page, context, errors } = await openPage();
  await page.click("#sampleBtn");
  assert.equal(await page.evaluate(() => document.querySelector("#results").style.display), "block");
  const r = await page.evaluate(() => ({
    unified: +document.querySelector("#unifiedScore").textContent,
    read: +document.querySelector("#readScore").textContent,
    onpage: document.querySelectorAll("#onpageGrid .check-card").length,
    social: document.querySelectorAll("#socialGrid .check-card").length,
    heat: document.querySelectorAll("#heatStrip .heat-cell").length,
    radar: !!document.querySelector("#radarBox svg .radar-shape"),
    llms: document.querySelector("#genLlms").textContent,
    robots: document.querySelector("#genRobots").textContent,
    prompts: document.querySelector("#genPrompts").textContent,
    text: document.querySelector("#results").innerText
  }));
  assert.ok(r.unified > 0 && r.unified <= 100);
  assert.ok(r.read >= 0 && r.read <= 100);
  assert.ok(r.onpage >= 10 && r.social >= 9 && r.heat > 0 && r.radar);
  assert.match(r.llms, /^# /);
  assert.match(r.robots, /User-agent: OAI-SearchBot/);
  assert.match(r.prompts, /^1\. /m);
  assert.doesNotMatch(r.text, BAD_TEXT);
  assert.deepEqual(errors, []);
  await context.close();
});

test("las exportaciones se descargan y no contienen valores rotos", async () => {
  const { page, context, errors } = await openPage();
  await page.click("#sampleBtn");
  const md = await download(page, "#downloadBtn");
  assert.match(md, /## Legibilidad/);
  const json = JSON.parse(await download(page, "#jsonBtn"));
  assert.match(json.version, /^8\.\d+\.\d+$/);
  assert.ok(json.readability && json.onPage && json.social && json.aiKit);
  const html = await download(page, "#htmlReportBtn");
  assert.match(html, /Legibilidad y on-page/);
  const csv = await download(page, "#csvBtn"), backlog = await download(page, "#backlogBtn");
  for (const out of [md, JSON.stringify(json), html, csv, backlog]) assert.doesNotMatch(out, BAD_TEXT);
  assert.deepEqual(errors, []);
  await context.close();
});

test("entradas extremas o maliciosas no rompen la app ni ejecutan código", async () => {
  const { page, context, errors } = await openPage();
  const cases = [
    "hola",
    "123 456",
    "<html><head><title>x</title></head><body></body></html>",
    "<html><body><h1>Título<p>sin cerrar<ul><li>uno<table><tr><td>x",
    '<html><head><title><img src=x onerror=alert(1)></title><meta property="og:image" content="javascript:alert(2)"><script type="application/ld+json">{malo</script></head><body><h1><svg onload=alert(3)>H</h1><h2>¿Qué?</h2><p>R <img src=x onerror=alert(4)></p></body></html>',
    "# \n##\n| a |\n|---|\n- \n> cita",
    "# 🚀 Emoji\n\n¿Qué es? Es ñandú über café.",
    "# 标题\n\n这是一个测试。",
    "# Sin puntos\n\n" + "palabra ".repeat(3000)
  ];
  await page.evaluate(() => { document.querySelector("details.advanced").open = true; });
  await page.fill("#pageUrl", "no es una url");
  await page.fill("#targetQuery", "¿?");
  await page.fill("#robots", "User-agent: *\nDisallow: /");
  for (const src of cases) {
    await audit(page, src);
    const text = await page.evaluate(() => document.querySelector("#results").innerText);
    assert.doesNotMatch(text, BAD_TEXT, `valor roto con la entrada: ${src.slice(0, 40)}`);
    await page.fill("#afterSource", src + " extra");
    await page.click("#compareBtn");
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("Markdown e inglés usan el índice de legibilidad correcto", async () => {
  const { page, context, errors } = await openPage();
  await audit(page, "# Guía\n\nUna hipoteca es un préstamo garantizado con una vivienda. Compara la TAE antes de firmar.");
  assert.match(await page.textContent("#readIndexName"), /INFLESZ/);
  await audit(page, '<html lang="en"><body><main><h1>What is GEO</h1><p>Generative engine optimization makes content easy to cite. It focuses on answers.</p></main></body></html>');
  assert.match(await page.textContent("#readIndexName"), /Flesch/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("la carga de varios archivos crea la comparativa por lotes", async () => {
  const { page, context, errors } = await openPage();
  await page.setInputFiles("#fileInput", [
    { name: "a.md", mimeType: "text/markdown", buffer: Buffer.from("# A\n\nEl GEO es la optimización para motores generativos.") },
    { name: "b.html", mimeType: "text/html", buffer: Buffer.from("<html><body><h1>B</h1><p>El GEO es la optimización para motores generativos.</p></body></html>") }
  ]);
  await page.waitForFunction(() => document.querySelectorAll("#batchBody tr").length === 2);
  assert.ok(await page.locator("#cannibalBody tr").count() >= 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("tema oscuro, atajos y ayuda funcionan", async () => {
  const { page, context, errors } = await openPage({ colorScheme: "dark" });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.click("#themeBtn"); await page.click("#themeBtn");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  await page.keyboard.press("?");
  assert.ok(await page.evaluate(() => document.querySelector("#kbdHelp").classList.contains("show")));
  await page.keyboard.press("Escape");
  assert.ok(!(await page.evaluate(() => document.querySelector("#kbdHelp").classList.contains("show"))));
  await page.keyboard.press("Alt+KeyD");
  await page.waitForFunction(() => document.querySelector("#results").style.display === "block");
  assert.deepEqual(errors, []);
  await context.close();
});

test("sin errores de accesibilidad (axe) en tema claro y oscuro", async () => {
  for (const colorScheme of ["light", "dark"]) {
    const { page, context } = await openPage({ colorScheme });
    await page.click("#sampleBtn");
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")}`));
    assert.deepEqual(violations, [], `tema ${colorScheme}`);
    await context.close();
  }
});

test("en móvil no hay scroll horizontal", async () => {
  const { page, context, errors } = await openPage({ viewport: { width: 360, height: 780 } });
  await page.click("#sampleBtn");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await context.close();
});

test("una página larga se audita en un tiempo razonable", async () => {
  const { page, context, errors } = await openPage();
  const src = '<html lang="es"><body><main><h1>Doc</h1>' + Array.from({ length: 600 }, (_, i) => `<h2>¿Sección ${i}?</h2><p>La sección ${i} explica que el 45 % de casos en 2025 según el INE. ${"Texto adicional número " + i + ". ".repeat(8)}</p>`).join("") + "</main></body></html>";
  await page.evaluate(s => { document.querySelector("#source").value = s; }, src);
  const ms = await page.evaluate(() => { const t = performance.now(); document.querySelector("#scoreBtn").click(); return performance.now() - t; });
  assert.ok(ms < 8000, `tardó ${Math.round(ms)} ms`);
  assert.deepEqual(errors, []);
  await context.close();
});

test("funciona sin conexión gracias al service worker", async () => {
  const { page, context } = await openPage();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  assert.match(await page.title(), /Auditor GEO PRO/);
  await context.close();
});

test("capa de quality: rúbrica, commodity, page types, red flags, señales e informe", async () => {
  const { page, context, errors } = await openPage();
  await page.click("#sampleBtn");
  await page.evaluate(() => { document.querySelector("details.advanced").open = true; });
  await page.check("#coreDrop");
  await page.fill("#coreDropPct", "22");
  await page.check("#lowQualitySection");
  await page.fill("#templatePages", "250");
  await page.fill("#competitors", "Qué es GEO\n---RESULT---\nGuía de GEO para empresas");
  await page.fill("#siblings", "GEO para abogados. Guía práctica de GEO para estructurar contenidos.\n---PAGE---\nGEO para dentistas. Guía práctica de GEO para estructurar contenidos.");
  await page.fill("#pageTypes", "tipo; urls; indexadas; clics; crecimiento; foco; traducción\nPosts; 1.200; 1.100; 90000; 5; sí; no\nFichas de ciudad; 8000; 2100; 4000; 300; sí; no\nRecetas; 600; 200; 900; 40; no; no\nIdiomas; 3000; 2500; 20000; 10; sí; sí\nlínea rota");
  await page.click("#scoreBtn");

  // Rúbrica 0–4 con nivel y siguiente nivel en cada pilar
  assert.equal(await page.locator("#pillarGrid .rubric").count(), 4);
  // Ángulos non-commodity
  assert.ok(await page.locator("#angleList li").count() >= 1);
  // Test top 10 parcialmente comprobado con títulos cortos y test de plantilla con vocabulario repetido
  const tests = await page.locator("#commodityTests").innerText();
  assert.match(tests, /Parcialmente comprobado/);
  assert.match(tests, /vocabulario se repite/);
  // Vista de site: sacar del dominio + recuperación
  const site = await page.locator("#siteView").innerText();
  assert.match(site, /sacar del dominio/i);
  assert.match(site, /3–6 meses/);
  // Red flag Lowest por dominio caducado => veredicto Riesgo alto y prioridad sobre «sacar del dominio»
  await page.check("#expiredDomain");
  await page.click("#scoreBtn");
  assert.match(await page.locator("#flags").innerText(), /Abuso de dominio caducado/);
  assert.equal(await page.textContent("#qualityGrade"), "Riesgo alto");
  assert.match(await page.locator("#siteView").innerText(), /revisión crítica/i);
  // Page types: 4 filas válidas, la mal formada se ignora, acciones esperadas
  const rows = await page.locator("#ptBody tr").allInnerTexts();
  assert.equal(rows.length, 4);
  assert.match(rows.find(r => r.startsWith("Recetas")), /sacar del dominio/i);
  assert.match(rows.find(r => r.startsWith("Idiomas")), /sacar del dominio/i);
  assert.match(rows.find(r => r.startsWith("Fichas de ciudad")), /consolidar/i);
  assert.match(rows.find(r => r.startsWith("Posts")), /mantener/i);
  assert.match(await page.textContent("#ptNote"), /Se ignoraron 1 línea/);
  // Señales del leak con etiquetas
  const sig = await page.locator("#signalsBody").innerText();
  for (const k of ["contentEffort", "chardEncoded", "Q*"]) assert.ok(sig.includes(k), k);
  assert.match(sig, /\[Documentado\]/);
  assert.match(sig, /\[Inferencia\]/);
  // Informe con la plantilla completa
  const rep = await page.textContent("#qualityReport");
  for (const h of ["# Auditoría de quality:", "**Veredicto:** Riesgo alto", "## Propósito de la página", "## Cuatro pilares", "| Pilar | Nota | Evidencia | Corrección |", "## Test de commodity", "Test top 10: parcialmente comprobado", "## Red flags", "## Vista de plantilla y site", "### Page types", "## Señales Google relacionadas", "## Acciones prioritarias", "3 a 6 meses"]) assert.ok(rep.includes(h), h);
  assert.doesNotMatch(rep, /NaN|undefined|\[object Object\]/);
  // Descarga del informe, JSON y Markdown completos
  const md = await download(page, "#qreportDl");
  assert.equal(md, rep);
  const json = JSON.parse(await download(page, "#jsonBtn"));
  assert.ok(json.qualityReport && json.pageTypes.rows.length === 4 && json.nonCommodityAngles.list.length);
  assert.match(await download(page, "#downloadBtn"), /## Auditoría de quality:/);
  // Guía y glosario presentes
  assert.equal(await page.locator("#sec-guia ~ .guide details").count(), 11);
  assert.ok((await page.locator(".glossary tbody tr").count()) >= 23);
  assert.deepEqual(errors, []);
  await context.close();
});

test("sin inventario ni contexto, la capa de quality no inventa datos", async () => {
  const { page, context, errors } = await openPage();
  await audit(page, "# Qué es una cocina\n\nUna cocina es la habitación donde se preparan los alimentos.");
  assert.match(await page.textContent("#ptNote"), /Pega tu inventario/);
  const rep = await page.textContent("#qualityReport");
  assert.match(rep, /Test top 10: no comprobado/);
  assert.match(rep, /Activos solo-tuyos usados: ninguno/);
  assert.doesNotMatch(rep, /### Page types|3 a 6 meses/);
  assert.match(await page.locator("#angleList").innerText(), /Convierte el título genérico/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("el informe avisa cuando la página es antigua", async () => {
  const { page, context, errors } = await openPage();
  await audit(page, '<html lang="es"><head><title>Guía 2019</title><meta property="article:modified_time" content="2019-05-01"></head><body><main><h1>Guía</h1><p>Contenido publicado hace años sobre el tema.</p></main></body></html>');
  assert.match(await page.textContent("#qualityReport"), /Fecha más reciente detectada: 2019/);
  assert.deepEqual(errors, []);
  await context.close();
});
