// Extracción de URLs, dominios y marcas a partir de las respuestas de los motores.
import { createHash } from 'node:crypto';

const PARAMS_RASTREO = /^(utm_|gclid$|fbclid$|msclkid$|mc_|ref$|ref_src$|srsltid$)/i;

export function idPregunta(texto) {
  return createHash('sha1').update(normalizarTexto(texto)).digest('hex').slice(0, 10);
}

export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) {
      if (PARAMS_RASTREO.test(k)) u.searchParams.delete(k);
    }
    let s = u.toString();
    if (u.pathname !== '/' && s.endsWith('/') && !u.search) s = s.slice(0, -1);
    if (u.pathname === '/' && !u.search) s = s.replace(/\/$/, '');
    return s;
  } catch {
    return null;
  }
}

export function dominio(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** ¿El dominio `d` pertenece a `base` (igual o subdominio)? */
export function perteneceA(d, base) {
  if (!d || !base) return false;
  const b = base.toLowerCase().replace(/^www\./, '');
  return d === b || d.endsWith('.' + b);
}

export function urlsEnTexto(texto) {
  const encontradas = String(texto ?? '').match(/https?:\/\/[^\s<>"'`)\]}]+/g) || [];
  return encontradas.map((u) => u.replace(/[.,;:!?»”’]+$/, ''));
}

/** Une citas estructuradas y URLs del texto en una lista única y normalizada. */
export function unirCitas(citas, texto) {
  const vistas = new Map();
  const add = (url, titulo, origen) => {
    const n = normalizarUrl(url);
    if (!n) return;
    if (!vistas.has(n)) vistas.set(n, { url: n, dominio: dominio(n), titulo: titulo || '', origen });
    else if (titulo && !vistas.get(n).titulo) vistas.get(n).titulo = titulo;
  };
  for (const c of citas || []) add(c.url, c.titulo, 'cita');
  for (const u of urlsEnTexto(texto)) add(u, '', 'texto');
  return [...vistas.values()];
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lista de marcas a vigilar: la propia + competidores. */
export function marcasDeConfig(config) {
  const lista = [];
  if (config.marca) lista.push({ ...config.marca, propia: true });
  for (const c of config.competidores || []) lista.push({ ...c, propia: false });
  return lista.map((m) => ({
    nombre: m.nombre,
    propia: m.propia,
    terminos: [m.nombre, ...(m.alias || [])].filter(Boolean).map(normalizarTexto),
    dominios: (m.dominios || []).map((d) => d.toLowerCase().replace(/^www\./, '')),
  }));
}

/**
 * Detecta qué marcas se mencionan en el texto y cuáles se citan por dominio.
 * Devuelve una entrada por marca detectada, ordenada por aparición en el texto.
 */
export function detectarMarcas(texto, citas, marcas) {
  const t = normalizarTexto(texto);
  const resultado = [];
  for (const m of marcas) {
    let primera = -1;
    for (const termino of m.terminos) {
      if (!termino) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(termino)}(?![\\p{L}\\p{N}])`, 'u');
      const hit = re.exec(t);
      if (hit && (primera === -1 || hit.index < primera)) primera = hit.index;
    }
    const urls = (citas || []).filter((c) => m.dominios.some((d) => perteneceA(c.dominio, d))).map((c) => c.url);
    if (primera === -1 && urls.length === 0) continue;
    resultado.push({
      marca: m.nombre,
      propia: m.propia,
      mencionada: primera !== -1,
      citada: urls.length > 0,
      indice: primera,
      urls,
    });
  }
  const mencionadas = resultado.filter((r) => r.mencionada).sort((a, b) => a.indice - b.indice);
  mencionadas.forEach((r, i) => (r.posicion = i + 1));
  for (const r of resultado) {
    if (!r.mencionada) r.posicion = null;
    delete r.indice;
  }
  return resultado.sort((a, b) => (a.posicion ?? 99) - (b.posicion ?? 99));
}

/** Lee el archivo de preguntas: una por línea, `# comentario`, opcional `categoría | pregunta`. */
export function parsearPreguntas(contenido) {
  const vistas = new Set();
  const preguntas = [];
  for (const linea of String(contenido).split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    let categoria = 'general';
    let texto = l;
    const sep = l.indexOf('|');
    if (sep > 0) {
      categoria = l.slice(0, sep).trim() || 'general';
      texto = l.slice(sep + 1).trim();
    }
    if (!texto) continue;
    const id = idPregunta(texto);
    if (vistas.has(id)) continue;
    vistas.add(id);
    preguntas.push({ id, categoria, texto });
  }
  return preguntas;
}
