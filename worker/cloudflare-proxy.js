// Worker de Cloudflare para que Auditor GEO PRO publicado (p. ej. en GitHub Pages) pueda analizar URLs.
// Mismo contrato que server.mjs: GET /api/fetch?url=...  y  GET /api/health
// Despliegue: ver worker/README.md. Variable opcional ALLOWED_ORIGIN (p. ej. https://tu-usuario.github.io).
const MAX_BYTES = 8 * 1024 * 1024, MAX_REDIRECTS = 5, TIMEOUT_MS = 20000;
const KEEP = ["content-type", "content-language", "x-robots-tag", "last-modified", "cache-control", "etag", "server", "link", "content-length", "location", "strict-transport-security", "vary"];
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd]|\[?fe[89ab])/i;

function cors(env, request) {
  const allowed = (env && env.ALLOWED_ORIGIN) || "*", origin = request.headers.get("origin") || "";
  return { "access-control-allow-origin": allowed === "*" ? "*" : (allowed.split(",").map(s => s.trim()).includes(origin) ? origin : "null"), "access-control-allow-methods": "GET, OPTIONS", vary: "origin" };
}
function json(data, status, extra) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}
async function readCapped(res) {
  if (!res.body) return new Uint8Array(0); // 204, 304 y respuestas sin cuerpo
  const reader = res.body.getReader(), chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > MAX_BYTES) { reader.cancel(); throw new Error("La respuesta supera el límite de 8 MB."); }
    chunks.push(value);
  }
  const buf = new Uint8Array(size); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  return buf;
}
function decode(buf, contentType) {
  let charset = (String(contentType || "").match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) charset = (new TextDecoder("latin1").decode(buf.subarray(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(charset || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
const OWN_MESSAGE = /^(Solo se admiten|Destino bloqueado|Demasiadas redirecciones|Tiempo de espera|La respuesta supera|No se pudo|El servidor envió)/;
function friendly(e) {
  const msg = String((e && e.message) || ""), code = String((e && e.cause && e.cause.code) || "");
  if (OWN_MESSAGE.test(msg)) return e;
  if (/ENOTFOUND|EAI_AGAIN/.test(code) || /dns|resolve/i.test(msg)) return new Error("No se encuentra el dominio (DNS). Revisa que la URL esté bien escrita.");
  if (/SSL|TLS|EPROTO|CERT/i.test(code + msg)) return new Error("No se pudo establecer una conexión HTTPS segura con el sitio.");
  if (/terminated|reset|aborted|ECONNRESET/i.test(code + msg)) return new Error("El servidor cortó la conexión.");
  if (/ECONNREFUSED|refused/i.test(code + msg)) return new Error("El servidor rechazó la conexión.");
  return new Error("Error de red al descargar la página. Comprueba que la URL funciona en el navegador.");
}
export async function crawl(target, { allowPrivate = false, timeoutMs = TIMEOUT_MS, userAgent = "Mozilla/5.0 (compatible; AuditorGEOPRO-Worker; +https://github.com/seoleon/auditor-geo-pro)" } = {}) {
  const started = Date.now(), redirects = []; let url = target;
  // Un único límite de tiempo TOTAL que cubre redirecciones y la descarga completa del cuerpo.
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const timeoutError = () => new Error(`Tiempo de espera agotado (${Math.round(TIMEOUT_MS / 1000)} s).`);
  try {
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Solo se admiten URLs http(s).");
    if (!allowPrivate && PRIVATE_HOST.test(u.hostname)) throw Object.assign(new Error("Destino bloqueado: la URL apunta a una red privada o local."), { blocked: true });
    let res;
    try { res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-language": "es-ES,es;q=0.9,en;q=0.8" } }); }
    catch (e) { throw ctrl.signal.aborted ? timeoutError() : friendly(e); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      redirects.push({ url, status: res.status });
      if (i === MAX_REDIRECTS) throw new Error(`Demasiadas redirecciones (más de ${MAX_REDIRECTS}).`);
      try { url = new URL(res.headers.get("location"), url).href; } catch { throw new Error(`El servidor envió una redirección no válida (${String(res.headers.get("location")).slice(0, 80)}).`); }
      continue;
    }
    let buf;
    try { buf = await readCapped(res); } catch (e) { throw ctrl.signal.aborted ? timeoutError() : friendly(e); }
    const headers = {};
    for (const k of KEEP) { const v = res.headers.get(k); if (v != null) headers[k] = v; }
    return { ok: true, url: target, finalUrl: url, status: res.status, statusText: res.statusText || "", redirects, headers, ms: Date.now() - started, bytes: buf.length, body: decode(await gunzipIfNeeded(buf, res.headers.get("content-type")), res.headers.get("content-type")) };
  }
  } finally { clearTimeout(timer); }
}
// Sitemaps .gz servidos como application/gzip sin Content-Encoding: fetch no los descomprime.
async function gunzipIfNeeded(buf, contentType) {
  if (!/gzip/i.test(contentType || "") || buf[0] !== 0x1f || buf[1] !== 0x8b || typeof DecompressionStream === "undefined") return buf;
  return readCapped(new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))));
}
export default {
  async fetch(request, env) {
    const h = cors(env, request), u = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (u.pathname.endsWith("/api/health")) return json({ ok: true, crawler: true, worker: true }, 200, h);
    if (!u.pathname.endsWith("/api/fetch")) return json({ ok: false, error: "Ruta no encontrada." }, 404, h);
    const target = u.searchParams.get("url") || "";
    try { new URL(target); } catch { return json({ ok: false, url: target, error: "URL no válida." }, 400, h); }
    try { return json(await crawl(target, { allowPrivate: env && env.ALLOW_PRIVATE === "1" }), 200, h); }
    catch (e) { return json({ ok: false, url: target, code: e.blocked ? "BLOCKED" : "NETWORK", error: (e.blocked ? e : friendly(e)).message }, 200, h); }
  }
};
