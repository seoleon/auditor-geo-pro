// Gemini con grounding en Google Search. Las fuentes llegan como URLs de redirección
// (vertexaisearch.cloud.google.com/grounding-api-redirect/…) que resolvemos a la URL real.
import { postJson } from '../http.js';

const REDIRECCION = /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/;

export async function preguntar(pregunta, { clave, modelo, instruccion, fetchImpl = fetch }) {
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: pregunta }] }],
    tools: [{ google_search: {} }],
  };
  if (instruccion) cuerpo.systemInstruction = { parts: [{ text: instruccion }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const r = await postJson(url, cuerpo, { headers: { 'x-goog-api-key': clave }, fetchImpl });
  const res = interpretar(r);
  res.modelo = r.modelVersion || modelo;
  res.citas = await Promise.all(res.citas.map((c) => resolverCita(c, fetchImpl)));
  return res;
}

export function interpretar(r) {
  const cand = r.candidates?.[0];
  const texto = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  const citas = (cand?.groundingMetadata?.groundingChunks || [])
    .map((ch) => ch.web)
    .filter((w) => w?.uri)
    .map((w) => ({ url: w.uri, titulo: w.title || '' }));
  return { texto, citas };
}

async function resolverCita(cita, fetchImpl) {
  if (!REDIRECCION.test(cita.url)) return cita;
  try {
    const res = await fetchImpl(cita.url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const destino = res.headers.get('location');
    if (destino) return { ...cita, url: destino };
  } catch {
    // Sin resolver: usamos el título, que en Gemini suele ser el dominio de la fuente.
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cita.titulo)) return { ...cita, url: `https://${cita.titulo}` };
  return cita;
}
