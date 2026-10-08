// Servidor de Auditor GEO PRO: sirve la app y un endpoint de rastreo seguro.
//   npm start            → http://localhost:8080
//   PORT=3000 npm start  → otro puerto
// Endpoint: GET /api/fetch?url=https://ejemplo.com/  ·  GET /api/health
// Keyword Planner: GET /api/keywords/status  ·  POST /api/keywords/ideas (NDJSON con progreso)
// Protecciones: solo http/https, bloqueo de IPs privadas en cada conexión (anti-SSRF,
// también tras redirecciones y DNS rebinding), máx. 5 redirecciones, 8 MB y 20 s por URL.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKeywordPlanner, PlannerError } from "./keyword-planner.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const MAX_BYTES = 8 * 1024 * 1024, TIMEOUT_MS = 20000, MAX_REDIRECTS = 5;
const UA = `Mozilla/5.0 (compatible; AuditorGEOPRO/${VERSION}; +https://github.com/seoleon/auditor-geo-pro)`;
const KEEP_HEADERS = ["content-type", "content-language", "x-robots-tag", "last-modified", "cache-control", "etag", "server", "link", "content-length", "location", "strict-transport-security", "vary"];
const STATIC = new Set(["index.html", "keywords.html", "keyword-core.js", "manifest.webmanifest", "sw.js", "icons/icon.svg", "auditor.config.json"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && [0, 2].includes(+ip.split(".")[2])) || (a === 198 && b === 51 && +ip.split(".")[2] === 100) || (a === 203 && b === 0 && +ip.split(".")[2] === 113);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
  }
  return true;
}

function safeLookup(allowPrivate) {
  return (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
      if (!allowPrivate && list.some(a => isPrivateIp(a.address))) return cb(Object.assign(new Error("Destino bloqueado: la URL apunta a una red privada o local."), { code: "EPRIVATE" }));
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

function decodeBody(buf, contentType) {
  let charset = (String(contentType || "").match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) charset = (buf.subarray(0, 4096).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(charset || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

const tooBig = () => new Error("La respuesta supera el límite de 8 MB.");

// Descomprime con tope de salida (evita bombas de compresión). Admite gzip, brotli,
// deflate con cabecera zlib o crudo, y archivos .gz servidos sin Content-Encoding (sitemaps).
function decompress(buf, encoding, contentType) {
  const enc = String(encoding || "").toLowerCase(), opts = { maxOutputLength: MAX_BYTES };
  try {
    if (enc.includes("br")) return zlib.brotliDecompressSync(buf, opts);
    if (enc.includes("gzip") || (/gzip/i.test(contentType || "") && buf[0] === 0x1f && buf[1] === 0x8b)) return zlib.gunzipSync(buf, opts);
    if (enc.includes("deflate")) { try { return zlib.inflateSync(buf, opts); } catch (e) { if (e.code === "ERR_BUFFER_TOO_LARGE") throw e; return zlib.inflateRawSync(buf, opts); } }
    return buf;
  } catch (e) {
    if (e.code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) throw tooBig();
    throw new Error("No se pudo descomprimir la respuesta del servidor.");
  }
}

function requestOnce(target, allowPrivate, deadline) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol)) return reject(new Error("Solo se admiten URLs http(s)."));
    const literal = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !allowPrivate && isPrivateIp(literal)) return reject(new Error("Destino bloqueado: la URL apunta a una red privada o local."));
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new Error(`Tiempo de espera agotado (${Math.round(TIMEOUT_MS / 1000)} s).`));
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET", lookup: safeLookup(allowPrivate),
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-encoding": "gzip, deflate, br", "accept-language": "es-ES,es;q=0.9,en;q=0.8" }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return done(resolve, { res, body: null }); }
      const chunks = []; let size = 0;
      res.on("data", c => { size += c.length; if (size > MAX_BYTES) { req.destroy(); done(reject, tooBig()); } else chunks.push(c); });
      res.on("end", () => { try { done(resolve, { res, body: decompress(Buffer.concat(chunks), res.headers["content-encoding"], res.headers["content-type"]) }); } catch (e) { done(reject, e); } });
      res.on("error", e => done(reject, e));
    });
    // Límite de tiempo TOTAL (no solo de inactividad): corta también servidores que gotean bytes.
    const timer = setTimeout(() => { req.destroy(); done(reject, new Error(`Tiempo de espera agotado (${Math.round(TIMEOUT_MS / 1000)} s).`)); }, remaining);
    req.on("error", e => done(reject, e));
    req.end();
  });
}

export async function crawl(target, { allowPrivate = false, timeoutMs = TIMEOUT_MS } = {}) {
  const started = Date.now(), deadline = started + timeoutMs, redirects = [];
  let url = target;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { res, body } = await requestOnce(url, allowPrivate, deadline);
    if (body === null) {
      redirects.push({ url, status: res.statusCode });
      if (i === MAX_REDIRECTS) throw new Error(`Demasiadas redirecciones (más de ${MAX_REDIRECTS}).`);
      try { url = new URL(res.headers.location, url).href; } catch { throw new Error(`El servidor envió una redirección no válida (${String(res.headers.location).slice(0, 80)}).`); }
      continue;
    }
    const headers = {};
    for (const k of KEEP_HEADERS) if (res.headers[k] != null) headers[k] = String(res.headers[k]);
    return { ok: true, url: target, finalUrl: url, status: res.statusCode, statusText: res.statusMessage || "", redirects, headers, ms: Date.now() - started, bytes: body.length, body: decodeBody(body, res.headers["content-type"]) };
  }
}

const NET_ERRORS = {
  ENOTFOUND: "No se encuentra el dominio (DNS). Revisa que la URL esté bien escrita.",
  EAI_AGAIN: "Fallo temporal de DNS. Vuelve a intentarlo.",
  ECONNREFUSED: "El servidor rechazó la conexión.",
  ECONNRESET: "El servidor cortó la conexión.",
  ETIMEDOUT: "El servidor no respondió a tiempo.",
  EHOSTUNREACH: "El servidor no es accesible desde aquí.",
  CERT_HAS_EXPIRED: "El certificado HTTPS del sitio ha caducado.",
  ERR_TLS_CERT_ALTNAME_INVALID: "El certificado HTTPS no corresponde a este dominio.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "El sitio usa un certificado HTTPS autofirmado.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "No se pudo verificar el certificado HTTPS del sitio.",
  SELF_SIGNED_CERT_IN_CHAIN: "La cadena de certificados HTTPS no es de confianza."
};
const OWN_MESSAGE = /^(Solo se admiten|Destino bloqueado|Demasiadas redirecciones|Tiempo de espera|La respuesta supera|No se pudo|El servidor envió)/;
export function friendlyError(e) {
  const code = String((e && e.code) || ""), msg = String((e && e.message) || "");
  if (NET_ERRORS[code]) return NET_ERRORS[code];
  if (OWN_MESSAGE.test(msg)) return msg;
  if (/^(EPROTO|ERR_SSL|ERR_TLS|CERT_)/.test(code) || /SSL|TLS|certificate/i.test(msg)) return "No se pudo establecer una conexión HTTPS segura con el sitio.";
  return `Error de red al descargar la página${code ? ` (${code})` : ""}. Comprueba que la URL funciona en el navegador.`;
}

function sendJson(res, code, data) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { reject(new PlannerError("La petición es demasiado grande.", { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new PlannerError("El cuerpo de la petición no es JSON válido.")); } });
    req.on("error", reject);
  });
}

// La búsqueda de keywords gasta tu cuota de Google Ads y de Anthropic: solo se acepta JSON
// (obliga a una comprobación CORS que este servidor no concede) y desde el propio origen.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function handleKeywords(req, res, planner) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Usa POST." });
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "") || !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: "Petición no permitida." });
  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, e.status || 400, { ok: false, error: e.message }); }
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  const emit = obj => { if (!res.destroyed) res.write(JSON.stringify(obj) + "\n"); };
  try { emit(await planner.run(body, emit)); }
  catch (e) { emit({ type: "error", ok: false, code: e.code || "ERROR", error: e instanceof PlannerError ? e.message : `Error inesperado: ${e.message}` }); }
  res.end();
}

export function createServer({ allowPrivate = process.env.AUDITOR_ALLOW_PRIVATE === "1", planner = createKeywordPlanner() } = {}) {
  const server = http.createServer(async (req, res) => {
    try { await handle(req, res); }
    catch { if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Error interno." }); else res.destroy(); }
  });
  return server;
  async function handle(req, res) {
    let u;
    try { u = new URL(req.url, "http://localhost"); } catch { res.writeHead(400); return res.end(); }
    if (u.pathname === "/api/health") return sendJson(res, 200, { ok: true, version: VERSION, crawler: true });
    // La app lee este archivo para saber si hay rastreador: aquí el propio servidor lo es.
    if (u.pathname === "/auditor.config.json") return sendJson(res, 200, { crawler: "self" });
    if (u.pathname === "/api/keywords/status") return sendJson(res, 200, await planner.status());
    if (u.pathname === "/api/keywords/ideas") return handleKeywords(req, res, planner);
    if (u.pathname === "/api/fetch") {
      const target = u.searchParams.get("url") || "";
      let parsed;
      try { parsed = new URL(target); } catch { return sendJson(res, 400, { ok: false, url: target, error: "URL no válida." }); }
      if (!/^https?:$/.test(parsed.protocol)) return sendJson(res, 400, { ok: false, url: target, error: "Solo se admiten URLs http(s)." });
      // Un fallo del sitio de destino no es un fallo de esta API: se responde 200 con ok:false.
      try { return sendJson(res, 200, await crawl(parsed.href, { allowPrivate })); }
      catch (e) { return sendJson(res, 200, { ok: false, url: target, code: e.code === "EPRIVATE" || /bloqueado/.test(e.message) ? "BLOCKED" : (e.code || "NETWORK"), error: friendlyError(e) }); }
    }
    let rel;
    try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html"; } catch { res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }); return res.end("Ruta no válida"); }
    if (!STATIC.has(rel)) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff" });
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  // Por defecto solo escucha en este equipo: así nadie de tu red puede usarlo como proxy.
  // Para exponerlo a propósito (p. ej. en un contenedor): HOST=0.0.0.0 npm start
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => console.log(`Auditor GEO PRO ${VERSION} en http://localhost:${port}  (rastreo de URLs activo · escuchando en ${host})\nKeyword Planner en http://localhost:${port}/keywords.html`));
}
