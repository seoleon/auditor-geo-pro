// Almacenamiento en disco: una carpeta por ejecución semanal con JSONL de respuestas.
import { mkdir, readFile, readdir, appendFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function dirDatos(config) {
  return path.resolve(config._dir, config.datos || 'datos');
}

export function dirEjecucion(config, fecha) {
  return path.join(dirDatos(config), 'ejecuciones', fecha);
}

export function fechaHoy(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de `d`: todas las sesiones de una misma semana se guardan juntas. */
export function fechaSemana(d = new Date()) {
  const lunes = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  return lunes.toISOString().slice(0, 10);
}

export async function listarEjecuciones(config) {
  const base = path.join(dirDatos(config), 'ejecuciones');
  if (!existsSync(base)) return [];
  const dirs = await readdir(base, { withFileTypes: true });
  return dirs
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

/** Lee las respuestas de una ejecución quedándose con el último registro de cada pregunta × motor. */
export async function leerRespuestas(config, fecha) {
  const archivo = path.join(dirEjecucion(config, fecha), 'respuestas.jsonl');
  if (!existsSync(archivo)) return [];
  const ultimos = new Map();
  for (const linea of (await readFile(archivo, 'utf8')).split('\n')) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea);
      ultimos.set(`${r.id}|${r.motor}`, r);
    } catch {
      // Línea truncada por una interrupción: se ignora y se volverá a preguntar.
    }
  }
  return [...ultimos.values()];
}

// Las escrituras al mismo archivo se encadenan: varios motores guardan a la vez sin mezclar líneas.
const colas = new Map();

export function guardarRespuesta(config, fecha, registro) {
  const dir = dirEjecucion(config, fecha);
  const archivo = path.join(dir, 'respuestas.jsonl');
  const linea = JSON.stringify(registro) + '\n';
  const anterior = colas.get(archivo) || Promise.resolve();
  const siguiente = anterior
    .catch(() => {})
    .then(async () => {
      await mkdir(dir, { recursive: true });
      await appendFile(archivo, linea);
    });
  colas.set(archivo, siguiente);
  return siguiente;
}

export async function guardarJson(ruta, datos) {
  await mkdir(path.dirname(ruta), { recursive: true });
  await writeFile(ruta, JSON.stringify(datos, null, 2) + '\n');
}

export async function leerJson(ruta, porDefecto = null) {
  if (!existsSync(ruta)) return porDefecto;
  return JSON.parse(await readFile(ruta, 'utf8'));
}

export function csv(filas) {
  const celda = (v) => {
    let s = v == null ? '' : String(v);
    // Evita que Excel/Sheets ejecute como fórmula un título o texto que empiece por = + - @.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return filas.map((f) => f.map(celda).join(',')).join('\n') + '\n';
}

/** Escribe meta.json de la ejecución solo si aún no existe. */
export async function escribirMetaSiFalta(config, fecha, datos) {
  const ruta = path.join(dirEjecucion(config, fecha), 'meta.json');
  if (existsSync(ruta)) return;
  await guardarJson(ruta, { fecha, ...datos });
}
