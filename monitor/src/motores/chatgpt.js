// ChatGPT vía OpenAI Responses API con la herramienta de búsqueda web.
import { postJson } from '../http.js';

export async function preguntar(pregunta, { clave, modelo, pais, instruccion, fetchImpl }) {
  const cuerpo = {
    model: modelo,
    input: pregunta,
    tools: [{ type: 'web_search', ...(pais ? { user_location: { type: 'approximate', country: pais } } : {}) }],
  };
  if (instruccion) cuerpo.instructions = instruccion;
  const r = await postJson('https://api.openai.com/v1/responses', cuerpo, {
    headers: { authorization: `Bearer ${clave}` },
    fetchImpl,
  });
  return interpretar(r);
}

export function interpretar(r) {
  const partes = [];
  const citas = [];
  for (const item of r.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.type !== 'output_text') continue;
      partes.push(c.text);
      for (const a of c.annotations || []) {
        if (a.type === 'url_citation' && a.url) citas.push({ url: a.url, titulo: a.title || '' });
      }
    }
  }
  return { texto: partes.join('\n\n'), citas, modelo: r.model };
}
