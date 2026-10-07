// Visita las URLs más citadas y guarda su marcado de esquema (JSON-LD/microdatos)
// y el llms.txt de cada dominio, para comparar lo que hacen las páginas que la IA cita.
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { dominio, perteneceA } from './extraer.js';
import { guardarJson, dirEjecucion } from './almacen.js';

const AGENTE = 'Mozilla/5.0 (compatible; geo-monitor/1.0; +https://github.com/seoleon/auditor-geo-pro)';

async function descargar(url, fetchImpl, timeoutMs = 15_000) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': AGENTE, accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const tipo = res.headers.get('content-type') || '';
  const texto = res.ok ? (await res.text()).slice(0, 3_000_000) : '';
  return { status: res.status, tipo, texto, urlFinal: res.url || url };
}

/** Extrae los @type de todos los bloques JSON-LD (incluidos @graph y anidados). */
export function extraerEsquema(html) {
  const bloques = [];
  const tipos = new Set();
  const errores = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const crudo = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      const json = JSON.parse(crudo);
      bloques.push(json);
      recorrerTipos(json, tipos);
    } catch (e) {
      errores.push(`JSON-LD no válido: ${e.message}`.slice(0, 160));
    }
  }
  const microdatos = [...new Set([...html.matchAll(/itemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)/gi)].map((x) => x[1]))];
  return { tipos: [...tipos].sort(), microdatos, bloques, errores };
}

function recorrerTipos(nodo, tipos, prof = 0) {
  if (!nodo || typeof nodo !== 'object' || prof > 12) return;
  if (Array.isArray(nodo)) return nodo.forEach((n) => recorrerTipos(n, tipos, prof + 1));
  const t = nodo['@type'];
  if (typeof t === 'string') tipos.add(t);
  else if (Array.isArray(t)) t.filter((x) => typeof x === 'string').forEach((x) => tipos.add(x));
  for (const v of Object.values(nodo)) if (v && typeof v === 'object') recorrerTipos(v, tipos, prof + 1);
}

export function extraerMeta(html) {
  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const meta = (nombre) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*content=["']([^"']*)`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nombre}["']`, 'i'))?.[1] ||
    '';
  const modificado = meta('article:modified_time') || meta('og:updated_time');
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return { titulo, descripcion: meta('description'), h1, modificado };
}

function pareceLlmsTxt(r) {
  return r.status === 200 && !/html/i.test(r.tipo) && /^\s*#\s+\S/.test(r.texto);
}

/** Cuenta citas por URL en la ejecución y devuelve las más citadas (más las de la marca propia). */
export function urlsAInspeccionar(respuestas, config) {
  const conteo = new Map();
  for (const r of respuestas) for (const c of r.citas || []) conteo.set(c.url, (conteo.get(c.url) || 0) + 1);
  const ordenadas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([url, n]) => ({ url, citas: n }));
  const propios = config.marca?.dominios || [];
  const elegidas = ordenadas.slice(0, config.inspeccion.maxUrls);
  for (const u of ordenadas) {
    if (propios.some((d) => perteneceA(dominio(u.url), d)) && !elegidas.includes(u)) elegidas.push(u);
  }
  for (const p of config.paginas || []) {
    if (p.url && !elegidas.some((e) => e.url === p.url)) elegidas.push({ url: p.url, citas: conteo.get(p.url) || 0 });
  }
  return elegidas;
}

export async function inspeccionar(config, fecha, respuestas, { fetchImpl = fetch, log = console.log } = {}) {
  const objetivo = urlsAInspeccionar(respuestas, config);
  const dir = dirEjecucion(config, fecha);
  log(`🔎 Inspeccionando ${objetivo.length} URLs (schema) y sus dominios (llms.txt)…`);

  const paginas = [];
  for (const { url, citas } of objetivo) {
    try {
      const r = await descargar(url, fetchImpl);
      const esquema = /html/i.test(r.tipo) ? extraerEsquema(r.texto) : { tipos: [], microdatos: [], bloques: [], errores: [] };
      paginas.push({ url, citas, status: r.status, ...extraerMeta(r.texto), esquema });
    } catch (e) {
      paginas.push({ url, citas, error: String(e.message || e).slice(0, 200) });
    }
  }

  const dominios = [...new Set(objetivo.map((o) => dominio(o.url)).filter(Boolean))];
  const llms = [];
  await mkdir(path.join(dir, 'llms'), { recursive: true });
  for (const d of dominios) {
    const entrada = { dominio: d, llmsTxt: false, llmsFullTxt: false };
    for (const [archivo, campo] of [['llms.txt', 'llmsTxt'], ['llms-full.txt', 'llmsFullTxt']]) {
      try {
        const r = await descargar(`https://${d}/${archivo}`, fetchImpl, 10_000);
        if (pareceLlmsTxt(r)) {
          entrada[campo] = true;
          await writeFile(path.join(dir, 'llms', `${d}${archivo === 'llms.txt' ? '' : '.full'}.txt`), r.texto.slice(0, 500_000));
          if (campo === 'llmsTxt') entrada.resumen = r.texto.split('\n').slice(0, 6).join('\n').slice(0, 400);
        }
      } catch {
        // Dominio inaccesible o sin el archivo.
      }
    }
    llms.push(entrada);
  }

  const resultado = { fecha, paginas, llms };
  await guardarJson(path.join(dir, 'inspeccion.json'), resultado);
  return resultado;
}
