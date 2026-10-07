// Servidor de Auditor GEO PRO: sirve la app y un endpoint de rastreo seguro.
//   npm start            → http://localhost:8080
//   PORT=3000 npm start  → otro puerto
// Endpoint: GET /api/fetch?url=https://ejemplo.com/  ·  GET /api/health
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const MAX_BYTES = 8 * 1024 * 1024, TIMEOUT_MS = 20000, MAX_REDIRECTS = 5;
const UA = `Mozilla/5.0 (compatible; AuditorGEOPRO/${VERSION}; +https://github.com/seoleon/auditor-geo-pro)`;
const KEEP_HEADERS = ["content-type", "content-language", "x-robots-tag", "last-modified", "cache-control", "etag", "server", "link", "content-length", "location", "strict-transport-security", "vary"];
const STATIC = new Set(["index.html", "manifest.webmanifest", "sw.js", "icons/icon.svg", "auditor.config.json"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
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

function requestOnce(target, allowPrivate) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol)) return reject(new Error("Solo se admiten URLs http(s)."));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && !allowPrivate && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ""))) return reject(new Error("Destino bloqueado: la URL apunta a una red privada o local."));
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET", lookup: safeLookup(allowPrivate), timeout: TIMEOUT_MS,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-encoding": "gzip, deflate, br", "accept-language": "es-ES,es;q=0.9,en;q=0.8" }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ res, body: null }); }
      const enc = String(res.headers["content-encoding"] || "").toLowerCase();
      const stream = enc.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
      const chunks = []; let size = 0;
      stream.on("data", c => { size += c.length; if (size > MAX_BYTES) { req.destroy(); stream.destroy(); reject(new Error("La respuesta supera el límite de 8 MB.")); } else chunks.push(c); });
      stream.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
      stream.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado (20 s).")));
    req.on("error", reject);
    req.end();
  });
}

export async function crawl(target, { allowPrivate = false } = {}) {
  const started = Date.now(), redirects = [];
  let url = target;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { res, body } = await requestOnce(url, allowPrivate);
    if (body === null) {
      redirects.push({ url, status: res.statusCode });
      if (i === MAX_REDIRECTS) throw new Error(`Demasiadas redirecciones (más de ${MAX_REDIRECTS}).`);
      url = new URL(res.headers.location, url).href;
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
export function friendlyError(e) { return NET_ERRORS[e && e.code] || (e && e.message) || "Error de red."; }

function sendJson(res, code, data) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}

export function createServer({ allowPrivate = process.env.AUDITOR_ALLOW_PRIVATE === "1" } = {}) {
  return http.createServer(async (req, res) => {
    let u;
    try { u = new URL(req.url, "http://localhost"); } catch { res.writeHead(400); return res.end(); }
    if (u.pathname === "/api/health") return sendJson(res, 200, { ok: true, version: VERSION, crawler: true });
    // La app lee este archivo para saber si hay rastreador: aquí el propio servidor lo es.
    if (u.pathname === "/auditor.config.json") return sendJson(res, 200, { crawler: "self" });
    if (u.pathname === "/api/fetch") {
      const target = u.searchParams.get("url") || "";
      let parsed;
      try { parsed = new URL(target); } catch { return sendJson(res, 400, { ok: false, url: target, error: "URL no válida." }); }
      if (!/^https?:$/.test(parsed.protocol)) return sendJson(res, 400, { ok: false, url: target, error: "Solo se admiten URLs http(s)." });
      // Un fallo del sitio de destino no es un fallo de esta API: se responde 200 con ok:false.
      try { return sendJson(res, 200, await crawl(parsed.href, { allowPrivate })); }
      catch (e) { return sendJson(res, 200, { ok: false, url: target, code: e.code === "EPRIVATE" || /bloqueado/.test(e.message) ? "BLOCKED" : (e.code || "NETWORK"), error: friendlyError(e) }); }
    }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    if (!STATIC.has(rel)) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff" });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, () => console.log(`Auditor GEO PRO ${VERSION} en http://localhost:${port}  (rastreo de URLs activo)`));
}
