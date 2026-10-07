// Agrega las respuestas de una ejecución: visibilidad por motor, cuota de voz,
// dominios/URLs citados y huecos (preguntas donde aparecen competidores y tú no).
import { MOTORES } from './config.js';
import { perteneceA } from './extraer.js';

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function analizar(respuestas, config) {
  const validas = respuestas.filter((r) => !r.error);
  const motores = MOTORES.filter((m) => respuestas.some((r) => r.motor === m));
  const propia = config.marca.nombre;
  const dominiosPropios = config.marca.dominios || [];
  const nombresMarcas = [propia, ...(config.competidores || []).map((c) => c.nombre)];

  const porMotor = {};
  for (const m of motores) {
    const delMotor = validas.filter((r) => r.motor === m);
    const conMencion = delMotor.filter((r) => r.marcas?.some((x) => x.propia && x.mencionada));
    const conCita = delMotor.filter((r) => r.marcas?.some((x) => x.propia && x.citada));
    const posiciones = conMencion.map((r) => r.marcas.find((x) => x.propia).posicion).filter(Boolean);
    porMotor[m] = {
      respuestas: delMotor.length,
      errores: respuestas.filter((r) => r.motor === m && r.error).length,
      mencion: pct(conMencion.length, delMotor.length),
      citacion: pct(conCita.length, delMotor.length),
      posicionMedia: posiciones.length ? Math.round((10 * posiciones.reduce((a, b) => a + b, 0)) / posiciones.length) / 10 : null,
      citasMedias: delMotor.length ? Math.round((10 * delMotor.reduce((a, r) => a + (r.citas?.length || 0), 0)) / delMotor.length) / 10 : 0,
    };
  }

  // Cuota de voz: % de respuestas de cada motor que mencionan cada marca.
  const cuotaVoz = nombresMarcas.map((nombre) => {
    const fila = { marca: nombre, propia: nombre === propia, motores: {}, total: 0 };
    let n = 0;
    for (const m of motores) {
      const delMotor = validas.filter((r) => r.motor === m);
      const k = delMotor.filter((r) => r.marcas?.some((x) => x.marca === nombre && x.mencionada)).length;
      n += k;
      fila.motores[m] = pct(k, delMotor.length);
    }
    fila.total = pct(n, validas.length);
    return fila;
  }).sort((a, b) => b.total - a.total);

  // Dominios y URLs citados.
  const dominios = new Map();
  const urls = new Map();
  for (const r of validas) {
    for (const c of r.citas || []) {
      const d = dominios.get(c.dominio) || { dominio: c.dominio, citas: 0, motores: new Set(), preguntas: new Set() };
      d.citas++;
      d.motores.add(r.motor);
      d.preguntas.add(r.id);
      dominios.set(c.dominio, d);
      const u = urls.get(c.url) || { url: c.url, titulo: c.titulo, dominio: c.dominio, citas: 0, motores: new Set() };
      u.citas++;
      u.motores.add(r.motor);
      urls.set(c.url, u);
    }
  }
  const marcaDeDominio = (d) =>
    [config.marca, ...(config.competidores || [])].find((m) => (m.dominios || []).some((x) => perteneceA(d, x)))?.nombre || '';
  const topDominios = [...dominios.values()]
    .map((d) => ({ dominio: d.dominio, citas: d.citas, preguntas: d.preguntas.size, motores: [...d.motores], marca: marcaDeDominio(d.dominio) }))
    .sort((a, b) => b.citas - a.citas);
  const topUrls = [...urls.values()]
    .map((u) => ({ ...u, motores: [...u.motores], propia: dominiosPropios.some((d) => perteneceA(u.dominio, d)) }))
    .sort((a, b) => b.citas - a.citas);

  // Por pregunta: en qué motores apareces, quién aparece en tu lugar.
  const porPregunta = new Map();
  for (const r of respuestas) {
    const p = porPregunta.get(r.id) || { id: r.id, pregunta: r.pregunta, categoria: r.categoria, motores: {} };
    p.motores[r.motor] = r.error
      ? { error: true }
      : {
          mencionada: Boolean(r.marcas?.some((x) => x.propia && x.mencionada)),
          citada: Boolean(r.marcas?.some((x) => x.propia && x.citada)),
          competidores: (r.marcas || []).filter((x) => !x.propia && x.mencionada).map((x) => x.marca),
          urls: (r.citas || []).map((c) => c.url),
        };
    porPregunta.set(r.id, p);
  }
  const preguntas = [...porPregunta.values()].map((p) => {
    const vals = Object.values(p.motores).filter((x) => !x.error);
    const competidores = [...new Set(vals.flatMap((v) => v.competidores))];
    const urlsCitadas = [...new Set(vals.flatMap((v) => v.urls))];
    return {
      ...p,
      presencia: vals.filter((v) => v.mencionada || v.citada).length,
      motoresValidos: vals.length,
      competidores,
      urlsCitadas,
    };
  });
  const huecos = preguntas
    .filter((p) => p.motoresValidos && p.presencia < p.motoresValidos)
    .sort((a, b) => a.presencia - b.presencia || b.competidores.length - a.competidores.length);

  return {
    motores,
    totales: {
      respuestas: respuestas.length,
      validas: validas.length,
      errores: respuestas.length - validas.length,
      preguntas: porPregunta.size,
      mencion: pct(validas.filter((r) => r.marcas?.some((x) => x.propia && x.mencionada)).length, validas.length),
      citacion: pct(validas.filter((r) => r.marcas?.some((x) => x.propia && x.citada)).length, validas.length),
    },
    porMotor,
    cuotaVoz,
    topDominios,
    topUrls,
    preguntas,
    huecos,
  };
}

/** Compara dos análisis: variación de visibilidad y preguntas ganadas/perdidas. */
export function comparar(actual, anterior) {
  if (!anterior) return null;
  const motores = {};
  for (const m of actual.motores) {
    const a = actual.porMotor[m];
    const b = anterior.porMotor[m];
    if (!b) continue;
    motores[m] = {
      mencion: Math.round(10 * (a.mencion - b.mencion)) / 10,
      citacion: Math.round(10 * (a.citacion - b.citacion)) / 10,
    };
  }
  // Solo cuentan los motores con respuesta válida en ambas semanas: un motor desactivado
  // o con error no es una pregunta perdida.
  const presentes = (motoresPregunta, comunes) =>
    comunes.filter((m) => motoresPregunta[m]?.mencionada || motoresPregunta[m]?.citada).length;
  const prev = new Map(anterior.preguntas.map((p) => [p.id, p]));
  const ganadas = [];
  const perdidas = [];
  for (const p of actual.preguntas) {
    const q = prev.get(p.id);
    if (!q) continue;
    const comunes = Object.keys(p.motores).filter((m) => !p.motores[m].error && q.motores[m] && !q.motores[m].error);
    const de = presentes(q.motores, comunes);
    const a = presentes(p.motores, comunes);
    if (a > de) ganadas.push({ pregunta: p.pregunta, de, a });
    if (a < de) perdidas.push({ pregunta: p.pregunta, de, a });
  }
  return {
    mencion: Math.round(10 * (actual.totales.mencion - anterior.totales.mencion)) / 10,
    citacion: Math.round(10 * (actual.totales.citacion - anterior.totales.citacion)) / 10,
    motores,
    ganadas,
    perdidas,
  };
}
