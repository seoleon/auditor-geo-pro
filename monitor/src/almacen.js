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

export async function guardarRespuesta(config, fecha, registro) {
  const dir = dirEjecucion(config, fecha);
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, 'respuestas.jsonl'), JSON.stringify(registro) + '\n');
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
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return filas.map((f) => f.map(celda).join(',')).join('\n') + '\n';
}
