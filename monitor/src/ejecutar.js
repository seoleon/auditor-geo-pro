// Lanza todas las preguntas contra los motores activos y guarda cada respuesta.
import { MOTORES, CLAVES_API, NOMBRES_MOTOR } from './config.js';
import { unirCitas, detectarMarcas, marcasDeConfig } from './extraer.js';
import { guardarRespuesta, leerRespuestas, guardarJson, dirEjecucion } from './almacen.js';
import { conReintentos } from './http.js';
import * as chatgpt from './motores/chatgpt.js';
import * as claude from './motores/claude.js';
import * as gemini from './motores/gemini.js';
import * as perplexity from './motores/perplexity.js';
import { crearSimulado } from './motores/simulado.js';
import path from 'node:path';

const IMPLEMENTACIONES = { chatgpt, claude, gemini, perplexity };

/** Decide qué motores se usan y con qué función de pregunta. */
export function prepararMotores(config, { soloMotores, simular, env = process.env, fetchImpl } = {}) {
  const activos = [];
  const omitidos = [];
  for (const m of MOTORES) {
    const conf = config.motores[m];
    if (!conf?.activo || (soloMotores && !soloMotores.includes(m))) continue;
    if (!simular && !IMPLEMENTACIONES[m]) {
      omitidos.push(`${NOMBRES_MOTOR[m]} (solo en modo navegador)`);
      continue;
    }
    if (simular) {
      activos.push({ motor: m, modelo: `simulado-${m}`, preguntar: crearSimulado(m, config) });
      continue;
    }
    const clave = env[CLAVES_API[m]];
    if (!clave) {
      omitidos.push(`${NOMBRES_MOTOR[m]} (falta ${CLAVES_API[m]})`);
      continue;
    }
    const opciones = {
      ...conf,
      clave,
      pais: config.pais,
      instruccion: config.instruccionSistema,
      fetchImpl,
    };
    activos.push({ motor: m, modelo: conf.modelo, preguntar: (p) => IMPLEMENTACIONES[m].preguntar(p, opciones) });
  }
  return { activos, omitidos };
}

/** Registro común a los modos API, navegador y asistido. */
export function construirRegistro({ fecha, pregunta, motor, modelo, fuente }, r, marcas) {
  const citas = unirCitas(r.citas, r.texto);
  return {
    fecha,
    id: pregunta.id,
    categoria: pregunta.categoria,
    pregunta: pregunta.texto,
    motor,
    modelo: r.modelo || modelo,
    fuente,
    texto: r.texto,
    citas,
    consultadas: r.consultadas ? unirCitas(r.consultadas, '') : undefined,
    marcas: detectarMarcas(r.texto, citas, marcas),
  };
}

async function enParalelo(tareas, limite, fn) {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, tareas.length) }, async () => {
    while (i < tareas.length) await fn(tareas[i++]);
  });
  await Promise.all(trabajadores);
}

/** Guarda meta.json de la ejecución. */
export async function escribirMeta(config, fecha, datos) {
  const ruta = path.join(dirEjecucion(config, fecha), 'meta.json');
  await guardarJson(ruta, { fecha, terminado: new Date().toISOString(), ...datos });
}

export async function ejecutar(config, preguntas, { fecha, soloMotores, simular, reintentarErrores = true, log = console.log, env, fetchImpl } = {}) {
  const { activos, omitidos } = prepararMotores(config, { soloMotores, simular, env, fetchImpl });
  for (const o of omitidos) log(`⚠️  Se omite ${o}`);
  if (!activos.length) throw new Error('No hay ningún motor activo con clave de API. Usa --simular para probar sin claves.');

  const marcas = marcasDeConfig(config);
  const previas = await leerRespuestas(config, fecha);
  const hechas = new Set(previas.filter((r) => !r.error || !reintentarErrores).map((r) => `${r.id}|${r.motor}`));

  const total = preguntas.length * activos.length;
  let completadas = 0;
  let errores = 0;
  log(`▶ ${fecha}: ${preguntas.length} preguntas × ${activos.length} motores (${activos.map((a) => NOMBRES_MOTOR[a.motor]).join(', ')})`);
  if (hechas.size) log(`  Reanudando: ${hechas.size} respuestas ya guardadas.`);

  await Promise.all(
    activos.map(({ motor, modelo, preguntar }) => {
      const pendientes = preguntas.filter((p) => !hechas.has(`${p.id}|${motor}`));
      completadas += preguntas.length - pendientes.length;
      return enParalelo(pendientes, config.concurrencia, async (p) => {
        const inicio = Date.now();
        let registro = { fecha, id: p.id, categoria: p.categoria, pregunta: p.texto, motor, modelo, fuente: 'api' };
        try {
          const r = await conReintentos(() => preguntar(p.texto), { reintentos: config.reintentos });
          registro = construirRegistro({ fecha, pregunta: p, motor, modelo, fuente: simular ? 'simulado' : 'api' }, r, marcas);
        } catch (err) {
          errores++;
          registro.error = String(err?.message || err).slice(0, 500);
        }
        registro.ms = Date.now() - inicio;
        await guardarRespuesta(config, fecha, registro);
        completadas++;
        if (completadas % 10 === 0 || completadas === total) log(`  ${completadas}/${total} respuestas${errores ? ` · ${errores} errores` : ''}`);
      });
    }),
  );

  await guardarJson(path.join(dirEjecucion(config, fecha), 'meta.json'), {
    fecha,
    terminado: new Date().toISOString(),
    preguntas: preguntas.length,
    motores: activos.map((a) => ({ motor: a.motor, modelo: a.modelo })),
    omitidos,
    simulado: Boolean(simular),
    errores,
  });
  return { errores, total };
}
