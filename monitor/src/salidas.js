// Análisis + informe + CSV + histórico + huecos de una ejecución (común a todos los modos).
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { analizar, comparar } from './analizar.js';
import { escribirInforme, actualizarHistorico } from './informe.js';
import { informeHuecos } from './reescribir.js';
import { listarEjecuciones, leerRespuestas, leerJson, dirEjecucion } from './almacen.js';

export async function generarSalidas(config, fecha) {
  const respuestas = await leerRespuestas(config, fecha);
  const analisis = analizar(respuestas, config);
  const fechas = await listarEjecuciones(config);
  const fechaAnterior = fechas.filter((f) => f < fecha).at(-1);
  const anterior = fechaAnterior ? analizar(await leerRespuestas(config, fechaAnterior), config) : null;
  const dir = dirEjecucion(config, fecha);
  const historico = await actualizarHistorico(config, fecha, analisis);
  const ruta = await escribirInforme(config, fecha, {
    respuestas,
    analisis,
    comparacion: comparar(analisis, anterior),
    fechaAnterior,
    inspeccion: await leerJson(path.join(dir, 'inspeccion.json')),
    meta: await leerJson(path.join(dir, 'meta.json')),
    historico,
  });
  await writeFile(path.join(dir, 'huecos.md'), informeHuecos(config, fecha, analisis));
  return { ruta, analisis };
}
