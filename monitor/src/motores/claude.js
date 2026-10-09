// Claude vía Messages API con la herramienta de búsqueda web del servidor.
import Anthropic from '@anthropic-ai/sdk';

const clientes = new Map();

export function cliente({ clave, fetchImpl }) {
  const k = `${clave}|${fetchImpl ? 'mock' : 'real'}`;
  if (!clientes.has(k)) {
    // Los reintentos los gestiona el ejecutor para que sean iguales en los cuatro motores.
    clientes.set(k, new Anthropic({ apiKey: clave, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));
  }
  return clientes.get(k);
}

export async function preguntar(pregunta, { clave, modelo, pais, instruccion, esfuerzo, maxBusquedas = 5, fetchImpl }) {
  const anthropic = cliente({ clave, fetchImpl });
  const herramienta = { type: 'web_search_20260209', name: 'web_search', max_uses: maxBusquedas };
  if (pais) herramienta.user_location = { type: 'approximate', country: pais };

  const messages = [{ role: 'user', content: pregunta }];
  let respuesta;
  // La búsqueda web puede devolver `pause_turn` en turnos largos: se reenvía para que continúe.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    respuesta = await anthropic.beta.messages.create({
      model: modelo,
      max_tokens: 16000,
      ...(instruccion ? { system: instruccion } : {}),
      ...(esfuerzo ? { output_config: { effort: esfuerzo } } : {}),
      // Si el modelo declina por política, la API reintenta en un modelo alternativo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [herramienta],
      messages,
    });
    if (respuesta.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: respuesta.content });
  }
  if (respuesta.stop_reason === 'refusal') {
    throw new Error(`Claude declinó responder (${respuesta.stop_details?.category ?? 'sin categoría'})`);
  }
  return interpretar(respuesta, messages.slice(1));
}

/** Extrae texto y fuentes: primero las citas del texto y después el resto de resultados de búsqueda. */
export function interpretar(respuesta, turnosPrevios = []) {
  const bloques = [
    ...turnosPrevios.filter((m) => m.role === 'assistant').flatMap((m) => m.content),
    ...respuesta.content,
  ];
  const partes = [];
  const citadas = [];
  const consultadas = [];
  for (const b of bloques) {
    if (b.type === 'text') {
      partes.push(b.text);
      for (const c of b.citations || []) if (c.url) citadas.push({ url: c.url, titulo: c.title || '' });
    } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) consultadas.push({ url: r.url, titulo: r.title || '' });
    }
  }
  return {
    texto: partes.join('').trim(),
    citas: citadas,
    consultadas,
    modelo: respuesta.model,
  };
}
