// Perplexity Sonar (chat completions): las fuentes vienen en `search_results` y `citations`.
import { postJson } from '../http.js';

export async function preguntar(pregunta, { clave, modelo, pais, instruccion, fetchImpl }) {
  const messages = [];
  if (instruccion) messages.push({ role: 'system', content: instruccion });
  messages.push({ role: 'user', content: pregunta });
  const cuerpo = { model: modelo, messages };
  if (pais) cuerpo.web_search_options = { user_location: { country: pais } };
  const r = await postJson('https://api.perplexity.ai/chat/completions', cuerpo, {
    headers: { authorization: `Bearer ${clave}` },
    fetchImpl,
  });
  return interpretar(r);
}

export function interpretar(r) {
  const texto = r.choices?.[0]?.message?.content || '';
  const citas = [];
  for (const s of r.search_results || []) if (s.url) citas.push({ url: s.url, titulo: s.title || '' });
  for (const u of r.citations || []) if (typeof u === 'string') citas.push({ url: u, titulo: '' });
  return { texto, citas, modelo: r.model };
}
