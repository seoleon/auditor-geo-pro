#!/usr/bin/env node
// QA de la web generada (dist/). Puerta antes de publicar: si hay errores, sale con código 1.
// Comprueba: title/description únicos, un solo H1, canonical, JSON-LD válido,
// enlaces internos rotos y parecido de contenido entre landings hermanas.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dist = join(raiz, 'dist');
const cliente = JSON.parse(readFileSync(join(raiz, 'cliente.json'), 'utf8'));
const UMBRAL_PARECIDO = 0.6; // Jaccard de 5-gramas sobre el texto propio de la página

if (!existsSync(dist)) {
  console.error('No existe dist/. Ejecuta antes: npm run build');
  process.exit(1);
}

const errores = [];
const avisos = [];
const err = (ruta, msg) => errores.push(`${ruta}: ${msg}`);
const aviso = (ruta, msg) => avisos.push(`${ruta}: ${msg}`);

function* htmls(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* htmls(p);
    else if (n.endsWith('.html')) yield p;
  }
}

const rutaDe = (archivo) => {
  const r = '/' + relative(dist, archivo).split(sep).join('/');
  return r.endsWith('index.html') ? r.slice(0, -'index.html'.length) : r;
};

const decodificar = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const todos = (html, re) => [...html.matchAll(re)].map((m) => decodificar(m[1].trim()));

const paginas = [];
for (const archivo of htmls(dist)) {
  const ruta = rutaDe(archivo);
  const html = readFileSync(archivo, 'utf8');
  paginas.push({ ruta, html });
}

const vistos = { title: new Map(), description: new Map() };

for (const { ruta, html } of paginas) {
  const es404 = ruta === '/404.html';
  // En modo demo todo lleva noindex: las comprobaciones on-page se hacen igualmente
  // sobre las páginas que serán indexables al publicar.
  const noindex = /^\/(aviso-legal|privacidad|creditos-fotos)\/$|^\/404\.html$/.test(ruta) || (!cliente.demo && /<meta name="robots" content="noindex/.test(html));

  const titles = todos(html, /<title>([\s\S]*?)<\/title>/g);
  if (titles.length !== 1) err(ruta, `${titles.length} etiquetas <title>`);
  const title = titles[0] ?? '';
  if (title.length > 60) aviso(ruta, `title largo (${title.length} caracteres): «${title}»`);

  const descs = todos(html, /<meta name="description" content="([^"]*)"/g);
  if (descs.length !== 1) err(ruta, `${descs.length} meta description`);
  const desc = descs[0] ?? '';
  if (!noindex && (desc.length < 110 || desc.length > 160)) aviso(ruta, `meta description de ${desc.length} caracteres`);

  if (!es404) {
    for (const [campo, valor] of [['title', title], ['description', desc]]) {
      if (vistos[campo].has(valor)) err(ruta, `${campo} duplicado con ${vistos[campo].get(valor)}`);
      else vistos[campo].set(valor, ruta);
    }
  }

  const h1 = todos(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g);
  if (h1.length !== 1) err(ruta, `${h1.length} H1 (debe haber 1)`);

  const canon = todos(html, /<link rel="canonical" href="([^"]*)"/g);
  if (canon.length !== 1) err(ruta, 'sin canonical o con varios');
  else if (!es404 && new URL(canon[0]).pathname !== ruta) err(ruta, `canonical apunta a ${canon[0]}`);

  for (const bloque of todos(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(bloque);
      if (!j['@context'] || !j['@type']) err(ruta, 'JSON-LD sin @context o @type');
      const txt = JSON.stringify(j);
      if (/"aggregateRating"|"@type":"Review"/.test(txt)) err(ruta, 'schema con valoraciones/reseñas: solo se permiten si son reales y verificables (quítalo o documenta su origen)');
      if (cliente.modelo === 'portal' && /"@type":"(LocalBusiness|GeneralContractor|HomeAndConstructionBusiness|Plumber)"/.test(txt))
        err(ruta, 'modelo portal declarando un negocio local: un intermediario no debe usar LocalBusiness');
    } catch (e) {
      err(ruta, `JSON-LD no válido: ${e.message}`);
    }
  }

  for (const href of todos(html, /<a [^>]*href="([^"]*)"/g)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const limpio = href.split('#')[0].split('?')[0];
    const destino = limpio.endsWith('/') ? join(dist, limpio, 'index.html') : join(dist, limpio);
    if (!existsSync(destino)) err(ruta, `enlace interno roto → ${href}`);
  }

  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\balt="[^"]+"/.test(img)) err(ruta, `imagen sin alt descriptivo: ${img.slice(0, 80)}`);
    if (!/\bwidth="\d+"/.test(img) || !/\bheight="\d+"/.test(img)) err(ruta, `imagen sin width/height (provoca CLS): ${img.slice(0, 80)}`);
  }
  if (!noindex) {
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    if (!imgs.length) aviso(ruta, 'página indexable sin ninguna imagen');
    if (imgs.length && !/loading="eager"/.test(imgs[0]) && !/fetchpriority="high"/.test(imgs[0])) aviso(ruta, 'la primera imagen debería cargarse con prioridad (LCP)');
    if (!/<meta property="og:image"/.test(html)) err(ruta, 'sin og:image');
    const h2 = (html.match(/<h2[\s>]/g) ?? []).length;
    if (h2 < 2) aviso(ruta, `solo ${h2} H2: estructura pobre`);
    const palabras = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    if (palabras < 300 && !/^\/(contacto)\/$/.test(ruta)) aviso(ruta, `contenido corto (${palabras} palabras)`);
  }

  if (noindex && !cliente.demo && !/aviso-legal|privacidad|404/.test(ruta)) aviso(ruta, 'tiene noindex');
}

// ---------- Parecido entre landings hermanas (mismo servicio, distinta zona) ----------
const textoPropio = (html) => {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  return decodificar(main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' '))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};
const shingles = (texto, nombresZona) => {
  // Se neutralizan los nombres de zona para medir el parecido real de la plantilla.
  let t = texto;
  for (const n of nombresZona) t = t.split(n.toLowerCase()).join('§');
  const pal = t.split(' ');
  const set = new Set();
  for (let i = 0; i + 5 <= pal.length; i++) set.add(pal.slice(i, i + 5).join(' '));
  return set;
};
const jaccard = (a, b) => {
  let comun = 0;
  for (const x of a) if (b.has(x)) comun++;
  return comun / (a.size + b.size - comun || 1);
};

const nombresZona = cliente.zonas.flatMap((z) => [z.nombre, z.nombreCorto]).sort((a, b) => b.length - a.length);
const parecidos = [];
for (const slug of cliente.landings.servicios) {
  const grupo = paginas
    .filter((p) => p.ruta.startsWith(`/${slug}/`))
    .map((p) => ({ ruta: p.ruta, s: shingles(textoPropio(p.html), nombresZona) }));
  for (let i = 0; i < grupo.length; i++) {
    for (let j = i + 1; j < grupo.length; j++) {
      const v = jaccard(grupo[i].s, grupo[j].s);
      parecidos.push(v);
      if (v > UMBRAL_PARECIDO) {
        aviso(grupo[i].ruta, `contenido ${(v * 100).toFixed(0)} % igual que ${grupo[j].ruta} (máx. ${UMBRAL_PARECIDO * 100} %)`);
      }
    }
  }
}

// ---------- Datos pendientes de revisar ----------
const pendientes = cliente.zonas.filter((z) => z.revisar).map((z) => z.nombre);
if (pendientes.length) aviso('cliente.json', `textos de zona marcados "revisar": ${pendientes.join(', ')}`);
if (JSON.stringify(cliente).includes('REVISAR')) aviso('cliente.json', 'quedan textos con "REVISAR"');

// ---------- Informe ----------
console.log(`\nQA · ${paginas.length} páginas en dist/`);
if (parecidos.length) {
  const media = parecidos.reduce((a, b) => a + b, 0) / parecidos.length;
  console.log(`Parecido medio entre landings hermanas: ${(media * 100).toFixed(0)} % (máximo ${(Math.max(...parecidos) * 100).toFixed(0)} %)`);
}
if (cliente.demo) console.log('\n⚠ MODO DEMO: la web tiene noindex y robots.txt bloquea todo. Pon "demo": false en cliente.json antes de publicar.');
if (avisos.length) console.log(`\nAvisos (${avisos.length}):\n  - ${avisos.join('\n  - ')}`);
if (errores.length) {
  console.log(`\n✗ Errores (${errores.length}):\n  - ${errores.join('\n  - ')}\n\nNO publicar hasta corregirlos.`);
  process.exit(1);
}
console.log('\n✓ Sin errores bloqueantes.');
