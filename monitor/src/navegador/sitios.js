// Cómo se usa la versión gratuita de cada motor desde el navegador.
// Las webs cambian a menudo: cualquier campo se puede sobrescribir en
// config.json → motores.<motor>.web (por ejemplo, { "selRespuesta": "…" }).

const GOOGLE = ['google.com', 'google.es', 'gstatic.com', 'googleusercontent.com', 'gemini.google.com'];

export const SITIOS = {
  chatgpt: {
    // Chat temporal (no usa memoria ni historial) y búsqueda web forzada, como un usuario nuevo.
    url: 'https://chatgpt.com/?temporary-chat=true&hints=search&q={q}',
    envioAutomatico: true,
    hosts: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com'],
    selRespuesta: '[data-message-author-role="assistant"]',
    selPregunta: '[data-message-author-role="user"]',
    selFuentes: '',
    selEditor: '#prompt-textarea, div[contenteditable="true"], textarea',
  },
  claude: {
    url: 'https://claude.ai/new?q={q}',
    envioAutomatico: false,
    hosts: ['claude.ai', 'claude.com', 'anthropic.com'],
    selRespuesta: '.font-claude-response, [data-is-streaming] .font-claude-message, .font-claude-message',
    selPregunta: '[data-testid="user-message"]',
    selFuentes: '',
    selEditor: 'div[contenteditable="true"], textarea',
  },
  gemini: {
    url: 'https://gemini.google.com/app?hl=es',
    envioAutomatico: false,
    hosts: GOOGLE,
    selRespuesta: 'model-response message-content, model-response .model-response-text, model-response',
    selPregunta: 'user-query .query-text, user-query',
    selFuentes: 'model-response sources-list, model-response [class*="source"]',
    selEditor: 'rich-textarea div[contenteditable="true"], div[contenteditable="true"], textarea',
  },
  perplexity: {
    url: 'https://www.perplexity.ai/search?q={q}',
    envioAutomatico: true,
    hosts: ['perplexity.ai', 'pplx.ai'],
    selRespuesta: '[id^="markdown-content"], div.prose',
    selPregunta: 'h1, [class*="query"]',
    selFuentes: '[data-testid*="source"], [class*="citation"], [class*="source"]',
    selEditor: 'textarea, div[contenteditable="true"]',
  },
  google: {
    // AI Mode de Google (udm=50): la búsqueda con IA que usa un comprador en Google.
    url: 'https://www.google.com/search?udm=50&hl=es&gl=es&q={q}',
    envioAutomatico: true,
    hosts: [...GOOGLE, 'youtube.com/redirect'],
    // Solo el bloque de AI Mode: nunca los resultados orgánicos (#rso), que no son la respuesta de la IA.
    selRespuesta: '[data-subtree="aimc"], [data-container-id="main-col"]',
    heuristica: false,
    selPregunta: '',
    selFuentes: '',
    selEditor: 'textarea[name="q"], textarea',
  },
};

/** Selector de los botones de "detener" que se ven mientras el motor está escribiendo. */
export const SEL_OCUPADO = [
  '[data-testid="stop-button"]',
  'button[aria-label*="Stop" i]',
  'button[aria-label*="Detener" i]',
  'button[aria-label*="Parar" i]',
].join(', ');

/** Frases que indican que hay que iniciar sesión, resolver un captcha o que se agotó el cupo gratis. */
export const BLOQUEOS = [
  { tipo: 'acceso', re: /verify you are human|verifica que eres humano|unusual traffic|tráfico inusual|captcha|are you a robot/i },
  { tipo: 'limite', re: /usage limit|message limit|you've (hit|reached)|has alcanzado (el|tu) límite|límite de (mensajes|uso)|try again (later|in)|vuelve a intentarlo (más tarde|en)|out of free messages/i },
];

export function sitio(config, motor) {
  const base = SITIOS[motor];
  if (!base) throw new Error(`Motor desconocido: ${motor}`);
  return { ...base, ...(config.motores?.[motor]?.web || {}) };
}

export function urlPregunta(s, pregunta) {
  return s.url.replace('{q}', encodeURIComponent(pregunta));
}

/** Motor al que pertenece un host (para el marcador del modo asistido). */
export function motorDeHost(host) {
  const h = host.replace(/^www\./, '');
  if (h === 'chatgpt.com') return 'chatgpt';
  if (h === 'claude.ai') return 'claude';
  if (h === 'gemini.google.com') return 'gemini';
  if (h.endsWith('perplexity.ai')) return 'perplexity';
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
  return null;
}
