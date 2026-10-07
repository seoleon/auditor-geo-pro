// Informe HTML autocontenido + exportaciones CSV de una ejecución.
import path from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { NOMBRES_MOTOR } from './config.js';
import { csv, dirDatos, dirEjecucion } from './almacen.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const delta = (v) => {
  if (v == null) return '';
  const clase = v > 0 ? 'sube' : v < 0 ? 'baja' : 'igual';
  return `<span class="delta ${clase}">${v > 0 ? '+' : ''}${v} pp</span>`;
};

const enlace = (url) => `<a href="${esc(url)}" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\//, ''))}</a>`;

export function csvCitas(respuestas) {
  const filas = [['fecha', 'motor', 'modelo', 'id_pregunta', 'categoria', 'pregunta', 'url', 'dominio', 'titulo', 'origen']];
  for (const r of respuestas) {
    for (const c of r.citas || []) {
      filas.push([r.fecha, r.motor, r.modelo, r.id, r.categoria, r.pregunta, c.url, c.dominio, c.titulo, c.origen]);
    }
  }
  return csv(filas);
}

export function csvMarcas(respuestas) {
  const filas = [['fecha', 'motor', 'id_pregunta', 'categoria', 'pregunta', 'marca', 'propia', 'mencionada', 'citada', 'posicion', 'urls']];
  for (const r of respuestas) {
    for (const m of r.marcas || []) {
      filas.push([r.fecha, r.motor, r.id, r.categoria, r.pregunta, m.marca, m.propia, m.mencionada, m.citada, m.posicion, m.urls.join(' ')]);
    }
  }
  return csv(filas);
}

/** Añade (o sustituye) las filas de esta fecha en datos/historico.csv. */
export async function actualizarHistorico(config, fecha, analisis) {
  const ruta = path.join(dirDatos(config), 'historico.csv');
  const cabecera = 'fecha,motor,respuestas,mencion_pct,citacion_pct,posicion_media';
  let lineas = existsSync(ruta) ? (await readFile(ruta, 'utf8')).trim().split('\n').slice(1) : [];
  lineas = lineas.filter((l) => !l.startsWith(fecha + ','));
  for (const m of analisis.motores) {
    const x = analisis.porMotor[m];
    lineas.push([fecha, m, x.respuestas, x.mencion, x.citacion, x.posicionMedia ?? ''].join(','));
  }
  lineas.push([fecha, 'total', analisis.totales.validas, analisis.totales.mencion, analisis.totales.citacion, ''].join(','));
  lineas.sort();
  await writeFile(ruta, [cabecera, ...lineas].join('\n') + '\n');
  return lineas.map((l) => {
    const [f, motor, respuestas, mencion, citacion] = l.split(',');
    return { fecha: f, motor, respuestas: +respuestas, mencion: +mencion, citacion: +citacion };
  });
}

/** Resalta en un texto YA escapado las marcas vigiladas (la propia con otro color). */
export function resaltarMarcas(textoEscapado, config) {
  const terminos = [];
  const add = (m, propia) => {
    for (const t of [m.nombre, ...(m.alias || [])]) if (t && t.trim().length > 1) terminos.push({ t: esc(t.trim()), propia });
  };
  if (config.marca) add(config.marca, true);
  for (const c of config.competidores || []) add(c, false);
  if (!terminos.length) return textoEscapado;
  terminos.sort((x, y) => y.t.length - x.t.length);
  const propias = new Set(terminos.filter((x) => x.propia).map((x) => x.t.toLowerCase()));
  // `&` en el lookbehind: nunca se marca dentro de una entidad HTML como &amp;.
  const re = new RegExp(`(?<![&\\p{L}\\p{N}])(${terminos.map((x) => x.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return textoEscapado.replace(re, (m) => `<mark class="${propias.has(m.toLowerCase()) ? 'tu' : 'comp'}">${m}</mark>`);
}

function visorRespuestas(respuestas, motores, config) {
  if (!respuestas?.length) return '';
  const porPregunta = new Map();
  for (const r of respuestas) {
    if (!porPregunta.has(r.id)) porPregunta.set(r.id, { pregunta: r.pregunta, categoria: r.categoria, motores: {} });
    porPregunta.get(r.id).motores[r.motor] = r;
  }
  const bloques = [...porPregunta.values()].map((p) => {
    const presentes = motores.filter((m) => p.motores[m]?.marcas?.some((x) => x.propia && (x.mencionada || x.citada))).length;
    const validos = motores.filter((m) => p.motores[m] && !p.motores[m].error).length;
    const celdas = motores
      .filter((m) => p.motores[m])
      .map((m) => {
        const r = p.motores[m];
        if (r.error) return `<div class="resp"><h4>${esc(NOMBRES_MOTOR[m])}</h4><p class="nota">⚠ ${esc(r.error)}</p></div>`;
        const avisos = [r.heuristico ? 'leída con plan B' : '', r.incompleta ? 'posiblemente incompleta' : '', r.fuente && r.fuente !== 'navegador' ? r.fuente : '']
          .filter(Boolean)
          .map((x) => `<span class="chip">${esc(x)}</span>`)
          .join(' ');
        const fuentes = (r.citas || []).map((c) => `<li>${enlace(c.url)}</li>`).join('');
        return `<div class="resp"><h4>${esc(NOMBRES_MOTOR[m])} ${avisos}</h4><div class="texto">${resaltarMarcas(esc(r.texto), config)}</div>${
          fuentes ? `<details><summary>${r.citas.length} fuentes citadas</summary><ul class="urls">${fuentes}</ul></details>` : '<p class="nota">Sin enlaces.</p>'
        }</div>`;
      })
      .join('');
    return `<details class="pregunta"><summary><span class="cat">${esc(p.categoria)}</span> ${esc(p.pregunta)} <span class="chip">${presentes}/${validos} motores te nombran</span></summary><div class="resps">${celdas}</div></details>`;
  });
  return `<p class="nota">Pulsa una pregunta para leer qué contestó cada motor. <mark class="tu">Tu marca</mark> y <mark class="comp">competidores</mark> resaltados.</p>${bloques.join('')}`;
}

export function generarHtml({ config, fecha, fechaAnterior, analisis: a, comparacion: c, inspeccion, historico = [], meta, respuestas = [] }) {
  const motores = a.motores;
  const marca = config.marca.nombre;

  const kpis = `
  <section class="kpis">
    <div class="kpi"><span class="etq">Respuestas que mencionan ${esc(marca)}</span><strong>${a.totales.mencion}%</strong>${delta(c?.mencion)}</div>
    <div class="kpi"><span class="etq">Respuestas que citan tu dominio</span><strong>${a.totales.citacion}%</strong>${delta(c?.citacion)}</div>
    <div class="kpi"><span class="etq">Preguntas con hueco</span><strong>${a.huecos.length}<small> / ${a.totales.preguntas}</small></strong></div>
    <div class="kpi"><span class="etq">Respuestas guardadas</span><strong>${a.totales.validas}</strong>${a.totales.errores ? `<span class="delta baja">${a.totales.errores} errores</span>` : ''}</div>
  </section>`;

  const tablaMotores = `
  <table>
    <thead><tr><th>Motor</th><th>Modelo</th><th class="num">Mención</th><th class="num">Citación</th><th class="num">Posición media</th><th class="num">Fuentes por respuesta</th><th class="num">Errores</th></tr></thead>
    <tbody>${motores
      .map((m) => {
        const x = a.porMotor[m];
        const modelo = meta?.motores?.find((y) => y.motor === m)?.modelo || '';
        return `<tr><th scope="row">${esc(NOMBRES_MOTOR[m])}</th><td><code>${esc(modelo)}</code></td><td class="num">${x.mencion}% ${delta(c?.motores?.[m]?.mencion)}</td><td class="num">${x.citacion}% ${delta(c?.motores?.[m]?.citacion)}</td><td class="num">${x.posicionMedia ?? '—'}</td><td class="num">${x.citasMedias}</td><td class="num">${x.errores || ''}</td></tr>`;
      })
      .join('')}</tbody>
  </table>`;

  const cuota = `
  <table>
    <thead><tr><th>Marca</th>${motores.map((m) => `<th class="num">${esc(NOMBRES_MOTOR[m])}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${a.cuotaVoz
      .map(
        (f) => `<tr class="${f.propia ? 'propia' : ''}"><th scope="row">${esc(f.marca)}${f.propia ? ' <span class="chip">tú</span>' : ''}</th>${motores
          .map((m) => `<td class="num">${f.motores[m]}%</td>`)
          .join('')}<td><div class="barra" role="img" aria-label="${f.total}%"><span style="width:${Math.min(100, f.total)}%"></span></div><span class="num">${f.total}%</span></td></tr>`,
      )
      .join('')}</tbody>
  </table>`;

  const celdaPresencia = (p, m) => {
    const x = p.motores[m];
    if (!x) return '<td class="cen">·</td>';
    if (x.error) return '<td class="cen" title="Error">⚠</td>';
    if (x.citada) return '<td class="cen ok" title="Mencionada y citada">●</td>';
    if (x.mencionada) return '<td class="cen medio" title="Mencionada sin cita">◐</td>';
    return '<td class="cen no" title="Ausente">○</td>';
  };
  const huecos = a.huecos.length
    ? `<p class="nota">● citada · ◐ mencionada sin enlace · ○ ausente. Ordenadas por menor presencia: empieza a reescribir por arriba con <code>node src/cli.js reescribir --pregunta &lt;id&gt; --url &lt;tu-página&gt;</code>.</p>
  <table class="huecos">
    <thead><tr><th>Pregunta</th>${motores.map((m) => `<th class="cen">${esc(NOMBRES_MOTOR[m])}</th>`).join('')}<th>Quién aparece en tu lugar</th><th>URLs citadas</th></tr></thead>
    <tbody>${a.huecos
      .slice(0, 60)
      .map(
        (p) => `<tr><td><span class="cat">${esc(p.categoria)}</span> ${esc(p.pregunta)}<br><code class="id">${esc(p.id)}</code></td>${motores
          .map((m) => celdaPresencia(p, m))
          .join('')}<td>${p.competidores.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ') || '—'}</td><td class="urls">${p.urlsCitadas
          .slice(0, 4)
          .map(enlace)
          .join('<br>')}${p.urlsCitadas.length > 4 ? `<br><small>+${p.urlsCitadas.length - 4} más</small>` : ''}</td></tr>`,
      )
      .join('')}</tbody>
  </table>`
    : '<p>Apareces en todas las respuestas válidas. 🎉</p>';

  const cambios = c
    ? `<div class="dos">
      <div><h3>Ganadas (${c.ganadas.length})</h3>${lista(c.ganadas.map((g) => `${esc(g.pregunta)} <small>(${g.de}→${g.a} motores)</small>`))}</div>
      <div><h3>Perdidas (${c.perdidas.length})</h3>${lista(c.perdidas.map((g) => `${esc(g.pregunta)} <small>(${g.de}→${g.a} motores)</small>`))}</div>
    </div>`
    : '<p class="nota">Primera ejecución: la semana que viene verás aquí qué preguntas ganas y pierdes.</p>';

  const dominios = `
  <table>
    <thead><tr><th>Dominio</th><th>Marca</th><th class="num">Citas</th><th class="num">Preguntas</th><th>Motores</th></tr></thead>
    <tbody>${a.topDominios
      .slice(0, 25)
      .map(
        (d) => `<tr class="${d.marca === marca ? 'propia' : ''}"><td>${esc(d.dominio)}</td><td>${esc(d.marca)}</td><td class="num">${d.citas}</td><td class="num">${d.preguntas}</td><td>${d.motores
          .map((m) => esc(NOMBRES_MOTOR[m]))
          .join(', ')}</td></tr>`,
      )
      .join('')}</tbody>
  </table>`;

  const urls = `
  <table>
    <thead><tr><th>URL</th><th class="num">Citas</th><th>Motores</th></tr></thead>
    <tbody>${a.topUrls
      .slice(0, 30)
      .map(
        (u) => `<tr class="${u.propia ? 'propia' : ''}"><td class="urls">${enlace(u.url)}${u.titulo ? `<br><small>${esc(u.titulo)}</small>` : ''}</td><td class="num">${u.citas}</td><td>${u.motores
          .map((m) => esc(NOMBRES_MOTOR[m]))
          .join(', ')}</td></tr>`,
      )
      .join('')}</tbody>
  </table>`;

  let bloqueInspeccion = '<p class="nota">Inspección desactivada o sin datos en esta ejecución.</p>';
  if (inspeccion?.paginas?.length) {
    const ok = inspeccion.paginas.filter((p) => !p.error && p.status === 200);
    const conteoTipos = new Map();
    for (const p of ok) for (const t of new Set([...(p.esquema?.tipos || []), ...(p.esquema?.microdatos || [])])) conteoTipos.set(t, (conteoTipos.get(t) || 0) + 1);
    const tipos = [...conteoTipos.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);
    const conLlms = inspeccion.llms.filter((l) => l.llmsTxt);
    bloqueInspeccion = `
    <div class="kpis">
      <div class="kpi"><span class="etq">Páginas citadas con schema</span><strong>${ok.filter((p) => p.esquema?.tipos?.length || p.esquema?.microdatos?.length).length}<small> / ${ok.length}</small></strong></div>
      <div class="kpi"><span class="etq">Dominios con llms.txt</span><strong>${conLlms.length}<small> / ${inspeccion.llms.length}</small></strong></div>
    </div>
    <h3>Tipos de schema más usados por las páginas citadas</h3>
    ${tipos.length ? `<p>${tipos.map(([t, n]) => `<span class="chip">${esc(t)} · ${n}</span>`).join(' ')}</p>` : '<p>Ninguna página citada usa schema.</p>'}
    <h3>Detalle por página</h3>
    <table>
      <thead><tr><th>URL</th><th class="num">Citas</th><th>Schema</th><th>Actualizada</th></tr></thead>
      <tbody>${inspeccion.paginas
        .map(
          (p) => `<tr><td class="urls">${enlace(p.url)}${p.titulo ? `<br><small>${esc(p.titulo)}</small>` : ''}</td><td class="num">${p.citas}</td><td>${
            p.error
              ? `<small>Error: ${esc(p.error)}</small>`
              : p.status !== 200
                ? `<small>HTTP ${esc(p.status)}</small>`
                : [...(p.esquema?.tipos || []), ...(p.esquema?.microdatos || []).map((m) => m + ' (microdatos)')].map(esc).join(', ') || '—'
          }</td><td>${esc((p.modificado || '').slice(0, 10)) || '—'}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
    <h3>llms.txt encontrados</h3>
    ${conLlms.length ? lista(conLlms.map((l) => `<strong>${esc(l.dominio)}</strong>${l.llmsFullTxt ? ' + llms-full.txt' : ''}<pre>${esc(l.resumen || '')}</pre>`)) : '<p>Ningún dominio citado publica llms.txt.</p>'}
    <p class="nota">Los archivos completos están en <code>datos/ejecuciones/${esc(fecha)}/llms/</code> y el JSON-LD en <code>inspeccion.json</code>.</p>`;
  }

  const fechasHist = [...new Set(historico.map((h) => h.fecha))].slice(-12);
  const evolucion = fechasHist.length > 1
    ? `<table>
      <thead><tr><th>Semana</th>${[...motores, 'total'].map((m) => `<th class="num">${esc(NOMBRES_MOTOR[m] || 'Total')}</th>`).join('')}</tr></thead>
      <tbody>${fechasHist
        .map(
          (f) => `<tr><th scope="row">${esc(f)}</th>${[...motores, 'total']
            .map((m) => {
              const h = historico.find((x) => x.fecha === f && x.motor === m);
              return `<td class="num">${h ? `${h.mencion}% <small>(${h.citacion}% cita)</small>` : '—'}</td>`;
            })
            .join('')}</tr>`,
        )
        .join('')}</tbody>
    </table>`
    : '<p class="nota">La evolución semanal aparecerá a partir de la segunda ejecución.</p>';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visibilidad en IA · ${esc(marca)} · ${esc(fecha)}</title>
<style>
:root{--fondo:#f7f7f5;--panel:#fff;--texto:#1d1d1b;--suave:#5f5f5a;--borde:#e3e2dd;--acento:#2f5bd3;--ok:#1f8a4c;--medio:#b7791f;--no:#c0392b;--propia:#eef3ff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--fondo:#141414;--panel:#1d1d1d;--texto:#ecebe7;--suave:#a5a49e;--borde:#333;--acento:#7d9cf0;--ok:#4cc27e;--medio:#e0a84a;--no:#ef6b5b;--propia:#1f2638}}
:root[data-theme="dark"]{--fondo:#141414;--panel:#1d1d1d;--texto:#ecebe7;--suave:#a5a49e;--borde:#333;--acento:#7d9cf0;--ok:#4cc27e;--medio:#e0a84a;--no:#ef6b5b;--propia:#1f2638}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:36px 0 12px;padding-top:12px;border-top:1px solid var(--borde)}h3{font-size:1rem;margin:20px 0 8px}
.sub,.nota{color:var(--suave)}.nota{font-size:.9rem}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:16px 0}
.kpi{background:var(--panel);border:1px solid var(--borde);border-radius:10px;padding:14px}
.kpi .etq{display:block;color:var(--suave);font-size:.85rem}.kpi strong{font-size:1.7rem}.kpi small{font-size:.9rem;color:var(--suave)}
.tabla{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--borde);border-radius:10px;font-size:.9rem}
th,td{padding:8px 10px;border-bottom:1px solid var(--borde);text-align:left;vertical-align:top}
thead th{font-size:.8rem;color:var(--suave);font-weight:600}
.num{text-align:right;white-space:nowrap}.cen{text-align:center}
tr.propia{background:var(--propia)}
.ok{color:var(--ok)}.medio{color:var(--medio)}.no{color:var(--no)}
.delta{display:inline-block;margin-left:6px;font-size:.8rem;font-weight:600}.sube{color:var(--ok)}.baja{color:var(--no)}.igual{color:var(--suave)}
.chip{display:inline-block;padding:1px 8px;border:1px solid var(--borde);border-radius:99px;font-size:.8rem;margin:1px 0;white-space:nowrap}
.cat{font-size:.75rem;color:var(--suave);text-transform:uppercase;letter-spacing:.03em}
.id{font-size:.75rem;color:var(--suave)}
.barra{display:inline-block;width:90px;height:8px;background:var(--borde);border-radius:4px;margin-right:6px;vertical-align:middle;overflow:hidden}.barra span{display:block;height:100%;background:var(--acento)}
.urls{word-break:break-all;max-width:420px}
a{color:var(--acento)}
pre{white-space:pre-wrap;font-size:.8rem;background:var(--fondo);padding:8px;border-radius:6px}
ul{padding-left:18px}
mark.tu{background:#ffe08a;color:#1d1d1b;padding:0 2px;border-radius:3px}mark.comp{background:#d9e4ff;color:#1d1d1b;padding:0 2px;border-radius:3px}
details.pregunta{background:var(--panel);border:1px solid var(--borde);border-radius:10px;margin:8px 0;padding:10px 14px}
details.pregunta>summary{cursor:pointer;font-weight:600}
.resps{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}
.resp{border-top:1px solid var(--borde);padding-top:8px;min-width:0}.resp h4{margin:0 0 6px;font-size:.95rem}
.resp .texto{white-space:pre-wrap;font-size:.88rem;max-height:420px;overflow:auto}
.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
@media (max-width:640px){th,td{padding:6px}.kpi strong{font-size:1.4rem}}
</style>
</head>
<body>
<main>
  <h1>Visibilidad en IA de ${esc(marca)}</h1>
  <p class="sub">Ejecución del ${esc(fecha)}${fechaAnterior ? ` · comparada con ${esc(fechaAnterior)}` : ''} · ${a.totales.preguntas} preguntas × ${motores.length} motores${meta?.simulado ? ' · <strong>DATOS SIMULADOS</strong>' : ''}</p>
  ${kpis}
  <h2>Por motor</h2><div class="tabla">${tablaMotores}</div>
  <p class="nota">Mención: el texto nombra tu marca. Citación: la respuesta enlaza a tu dominio. Posición: orden en que se nombra tu marca entre las vigiladas.</p>
  <h2>Cuota de voz</h2><div class="tabla">${cuota}</div>
  <h2>Huecos para reescribir</h2><div class="tabla">${huecos}</div>
  <h2>Cambios desde la semana anterior</h2>${cambios}
  <h2>Evolución</h2><div class="tabla">${evolucion}</div>
  <h2>Dominios más citados</h2><div class="tabla">${dominios}</div>
  <h2>URLs más citadas</h2><div class="tabla">${urls}</div>
  <h2>Qué hacen las páginas citadas: schema y llms.txt</h2>${bloqueInspeccion}
  <h2>Todas las respuestas</h2>${visorRespuestas(respuestas, motores, config)}
  <p class="nota">Generado por geo-monitor. Las respuestas de la IA varían entre ejecuciones: mira tendencias de varias semanas, no un único dato.</p>
</main>
</body>
</html>
`;
}

function lista(items) {
  return items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p>—</p>';
}

export async function escribirInforme(config, fecha, datos) {
  const html = generarHtml({ config, fecha, ...datos });
  const dir = dirEjecucion(config, fecha);
  await writeFile(path.join(dir, 'informe.html'), html);
  await writeFile(path.join(dirDatos(config), 'ultimo-informe.html'), html);
  await writeFile(path.join(dir, 'citas.csv'), csvCitas(datos.respuestas));
  await writeFile(path.join(dir, 'marcas.csv'), csvMarcas(datos.respuestas));
  return path.join(dir, 'informe.html');
}
