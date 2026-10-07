import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const MOTORES = ['chatgpt', 'claude', 'gemini', 'perplexity'];

export const NOMBRES_MOTOR = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export const CLAVES_API = {
  chatgpt: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
};

const POR_DEFECTO = {
  idioma: 'es',
  pais: 'ES',
  concurrencia: 3,
  reintentos: 3,
  motores: {
    chatgpt: { activo: true, modelo: 'gpt-5' },
    claude: { activo: true, modelo: 'claude-opus-5-5', esfuerzo: 'medium', maxBusquedas: 5 },
    gemini: { activo: true, modelo: 'gemini-2.5-flash' },
    perplexity: { activo: true, modelo: 'sonar-pro' },
  },
  inspeccion: { activo: true, maxUrls: 30 },
  reescritura: { modelo: 'claude-opus-5-5', esfuerzo: 'high' },
  competidores: [],
  paginas: [],
  faq: [],
};

export async function cargarConfig(ruta) {
  if (!existsSync(ruta)) {
    throw new Error(
      `No encuentro ${ruta}. Copia config.example.json a config.json y rellena tu marca y competidores.`,
    );
  }
  const datos = JSON.parse(await readFile(ruta, 'utf8'));
  if (!datos.marca?.nombre) throw new Error('config.json: falta "marca.nombre".');
  const motores = {};
  for (const m of MOTORES) motores[m] = { ...POR_DEFECTO.motores[m], ...(datos.motores?.[m] || {}) };
  return {
    ...POR_DEFECTO,
    ...datos,
    motores,
    inspeccion: { ...POR_DEFECTO.inspeccion, ...(datos.inspeccion || {}) },
    reescritura: { ...POR_DEFECTO.reescritura, ...(datos.reescritura || {}) },
    _dir: path.dirname(path.resolve(ruta)),
  };
}
