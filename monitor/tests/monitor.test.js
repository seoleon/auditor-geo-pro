import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { normalizarUrl, unirCitas, detectarMarcas, marcasDeConfig, parsearPreguntas, idPregunta } from '../src/extraer.js';
import * as chatgpt from '../src/motores/chatgpt.js';
import * as claude from '../src/motores/claude.js';
import * as gemini from '../src/motores/gemini.js';
import * as perplexity from '../src/motores/perplexity.js';
import { ejecutar } from '../src/ejecutar.js';
import { leerRespuestas } from '../src/almacen.js';
import { analizar, comparar } from '../src/analizar.js';
import { generarHtml } from '../src/informe.js';
import { extraerEsquema } from '../src/inspeccionar.js';
import { generarLlmsTxt, generarEsquema, etiquetaScript } from '../src/generar.js';
import { htmlATexto } from '../src/reescribir.js';
import { conReintentos, ErrorHttp } from '../src/http.js';

const CONFIG = {
  marca: { nombre: 'Facturalia', alias: ['Facturalia.app'], dominios: ['facturalia.app'], url: 'https://facturalia.app' },
  competidores: [
    { nombre: 'Holded', dominios: ['holded.com'] },
    { nombre: 'Quipu', dominios: ['getquipu.com'] },
  ],
  idioma: 'es',
  pais: 'ES',
  concurrencia: 2,
  reintentos: 0,
  motores: {
    chatgpt: { activo: true, modelo: 'gpt-5' },
    claude: { activo: true, modelo: 'claude-opus-5-5', esfuerzo: 'medium' },
    gemini: { activo: true, modelo: 'gemini-2.5-flash' },
    perplexity: { activo: true, modelo: 'sonar-pro' },
  },
  inspeccion: { activo: false, maxUrls: 10 },
  reescritura: { modelo: 'claude-opus-5-5', esfuerzo: 'high' },
  paginas: [],
};

const json = (cuerpo, status = 200, headers = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...headers } });

test('normaliza URLs y quita parámetros de rastreo', () => {
  assert.equal(normalizarUrl('https://WWW.Holded.com/precios/?utm_source=chatgpt.com#x'), 'https://holded.com/precios');
  assert.equal(normalizarUrl('https://holded.com/'), 'https://holded.com');
  assert.equal(normalizarUrl('https://a.com/b?id=2&utm_medium=x'), 'https://a.com/b?id=2');
  assert.equal(normalizarUrl('javascript:alert(1)'), null);
});

test('une citas estructuradas con URLs del texto sin duplicar', () => {
  const citas = unirCitas([{ url: 'https://holded.com/precios?utm_source=openai', titulo: 'Holded' }], 'Ver https://holded.com/precios. y https://getquipu.com/blog).');
  assert.deepEqual(citas.map((c) => c.url), ['https://holded.com/precios', 'https://getquipu.com/blog']);
  assert.equal(citas[0].dominio, 'holded.com');
});

test('detecta marcas con acentos, límites de palabra, posición y cita por dominio', () => {
  const marcas = marcasDeConfig({ ...CONFIG, competidores: [...CONFIG.competidores, { nombre: 'Anfix' }, { nombre: 'Holdeds' }] });
  const texto = 'Te recomiendo QUIPU o holded; también facturalia.app. Anfixer no cuenta.';
  const citas = unirCitas([{ url: 'https://blog.facturalia.app/guia' }], '');
  const r = detectarMarcas(texto, citas, marcas);
  const porNombre = Object.fromEntries(r.map((x) => [x.marca, x]));
  assert.equal(porNombre.Quipu.posicion, 1);
  assert.equal(porNombre.Holded.posicion, 2);
  assert.equal(porNombre.Facturalia.posicion, 3);
  assert.equal(porNombre.Facturalia.citada, true);
  assert.equal(porNombre.Anfix, undefined, 'Anfixer no debe contar como Anfix');
  assert.equal(porNombre.Holdeds, undefined);
});

test('parsea preguntas con categoría, comentarios y duplicados', () => {
  const p = parsearPreguntas('# comentario\n\nprecio | ¿Cuánto cuesta?\n¿Cuánto  cuesta?\nOtra pregunta\n');
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { id: idPregunta('¿Cuánto cuesta?'), categoria: 'precio', texto: '¿Cuánto cuesta?' });
  assert.equal(p[1].categoria, 'general');
});

test('ChatGPT: envía web_search y lee anotaciones url_citation', async () => {
  let enviado;
  const fetchImpl = async (url, init) => {
    enviado = { url, cuerpo: JSON.parse(init.body), auth: init.headers.authorization };
    return json({
      model: 'gpt-5-2026',
      output: [
        { type: 'web_search_call', id: 'ws_1' },
        { type: 'message', content: [{ type: 'output_text', text: 'Holded es popular.', annotations: [{ type: 'url_citation', url: 'https://holded.com/?utm_source=chatgpt.com', title: 'Holded' }] }] },
      ],
    });
  };
  const r = await chatgpt.preguntar('¿Mejor programa?', { clave: 'k', modelo: 'gpt-5', pais: 'ES', fetchImpl });
  assert.equal(enviado.url, 'https://api.openai.com/v1/responses');
  assert.equal(enviado.auth, 'Bearer k');
  assert.equal(enviado.cuerpo.tools[0].type, 'web_search');
  assert.equal(enviado.cuerpo.tools[0].user_location.country, 'ES');
  assert.equal(r.texto, 'Holded es popular.');
  assert.deepEqual(r.citas, [{ url: 'https://holded.com/?utm_source=chatgpt.com', titulo: 'Holded' }]);
});

test('Perplexity: lee search_results y citations', async () => {
  const fetchImpl = async () =>
    json({
      model: 'sonar-pro',
      choices: [{ message: { content: 'Quipu [1]' } }],
      search_results: [{ title: 'Quipu', url: 'https://getquipu.com' }],
      citations: ['https://getquipu.com', 'https://otra.com/x'],
    });
  const r = await perplexity.preguntar('x', { clave: 'k', modelo: 'sonar-pro', fetchImpl });
  assert.equal(r.texto, 'Quipu [1]');
  assert.equal(unirCitas(r.citas, r.texto).length, 2);
});

test('Gemini: usa google_search y resuelve las URLs de redirección', async () => {
  let cuerpo;
  const fetchImpl = async (url, init) => {
    if (url.includes('generativelanguage')) {
      cuerpo = JSON.parse(init.body);
      assert.equal(init.headers['x-goog-api-key'], 'k');
      return json({
        modelVersion: 'gemini-2.5-flash',
        candidates: [{
          content: { parts: [{ text: 'Usa Holded.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', title: 'holded.com' } },
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', title: 'getquipu.com' } },
            ],
          },
        }],
      });
    }
    if (url.endsWith('AAA')) return new Response(null, { status: 302, headers: { location: 'https://holded.com/facturas' } });
    throw new TypeError('red caída');
  };
  const r = await gemini.preguntar('x', { clave: 'k', modelo: 'gemini-2.5-flash', fetchImpl });
  assert.deepEqual(cuerpo.tools, [{ google_search: {} }]);
  assert.deepEqual(r.citas.map((c) => c.url), ['https://holded.com/facturas', 'https://getquipu.com']);
});

test('Claude: usa web_search, continúa tras pause_turn y separa citadas de consultadas', async () => {
  const peticiones = [];
  const fetchImpl = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    peticiones.push({ url: String(url), cuerpo, beta: init.headers instanceof Headers ? init.headers.get('anthropic-beta') : init.headers['anthropic-beta'] });
    const base = { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 } };
    if (peticiones.length === 1) {
      return json({
        ...base,
        stop_reason: 'pause_turn',
        content: [
          { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'x' } },
          { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [
            { type: 'web_search_result', url: 'https://holded.com/precios', title: 'Holded precios', encrypted_content: 'e' },
            { type: 'web_search_result', url: 'https://getquipu.com', title: 'Quipu', encrypted_content: 'e' },
          ] },
        ],
      });
    }
    return json({
      ...base,
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'Holded cuesta 15 €.', citations: [{ type: 'web_search_result_location', url: 'https://holded.com/precios', title: 'Holded precios', cited_text: '15 €', encrypted_index: 'x' }] },
        { type: 'text', text: ' Facturalia es otra opción.' },
      ],
    });
  };
  const r = await claude.preguntar('¿Precio?', { clave: 'k', modelo: 'claude-opus-5-5', esfuerzo: 'medium', pais: 'ES', fetchImpl });
  assert.equal(peticiones.length, 2);
  assert.match(peticiones[0].url, /\/v1\/messages/);
  assert.equal(peticiones[0].cuerpo.tools[0].type, 'web_search_20260209');
  assert.equal(peticiones[0].cuerpo.tools[0].user_location.country, 'ES');
  assert.equal(peticiones[0].cuerpo.output_config.effort, 'medium');
  assert.equal(peticiones[0].cuerpo.fallbacks, 'default');
  assert.match(peticiones[0].beta, /server-side-fallback-2026-07-01/);
  assert.equal(peticiones[1].cuerpo.messages.at(-1).role, 'assistant');
  assert.equal(r.texto, 'Holded cuesta 15 €. Facturalia es otra opción.');
  assert.deepEqual(r.citas.map((c) => c.url), ['https://holded.com/precios']);
  assert.equal(r.consultadas.length, 2);
});

test('reintenta errores 429/5xx pero no 4xx', async () => {
  let n = 0;
  const r = await conReintentos(async () => {
    if (++n < 3) throw new ErrorHttp(503, 'ocupado', 'https://api.x.com');
    return 'ok';
  }, { reintentos: 3, base: 1 });
  assert.equal(r, 'ok');
  let m = 0;
  await assert.rejects(conReintentos(async () => {
    m++;
    throw new ErrorHttp(401, 'clave', 'https://api.x.com');
  }, { reintentos: 3, base: 1 }));
  assert.equal(m, 1);
});

test('ejecución completa: guarda, reanuda solo lo fallido, analiza y compara', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'geo-'));
  try {
    const config = { ...CONFIG, _dir: dir, datos: 'datos' };
    const preguntas = parsearPreguntas('precio | ¿Cuánto cuesta un programa de facturación?\nrecomendacion | ¿Mejor programa de facturación?');
    let fallar = true;
    let llamadas = 0;
    const fetchImpl = async (url, init) => {
      llamadas++;
      const u = String(url);
      if (u.includes('perplexity')) {
        if (fallar) return json({ error: 'caído' }, 500);
        return json({ choices: [{ message: { content: 'Facturalia y Holded.' } }], citations: ['https://facturalia.app/precios'] });
      }
      if (u.includes('openai')) {
        return json({ model: 'gpt-5', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Holded.', annotations: [{ type: 'url_citation', url: 'https://holded.com' }] }] }] });
      }
      throw new Error('inesperado ' + u);
    };
    const env = { OPENAI_API_KEY: 'a', PERPLEXITY_API_KEY: 'b' };
    const log = () => {};
    const r1 = await ejecutar(config, preguntas, { fecha: '2026-10-05', env, fetchImpl, log });
    assert.equal(r1.errores, 2);
    assert.equal(llamadas, 4);

    fallar = false;
    llamadas = 0;
    const r2 = await ejecutar(config, preguntas, { fecha: '2026-10-05', env, fetchImpl, log });
    assert.equal(r2.errores, 0);
    assert.equal(llamadas, 2, 'solo reintenta las dos de Perplexity');

    const respuestas = await leerRespuestas(config, '2026-10-05');
    assert.equal(respuestas.length, 4);
    assert.ok(respuestas.every((r) => !r.error));
    const meta = JSON.parse(await readFile(path.join(dir, 'datos/ejecuciones/2026-10-05/meta.json'), 'utf8'));
    assert.match(meta.omitidos.join(), /ANTHROPIC_API_KEY/);

    const a = analizar(respuestas, config);
    assert.equal(a.porMotor.perplexity.mencion, 100);
    assert.equal(a.porMotor.perplexity.citacion, 100);
    assert.equal(a.porMotor.chatgpt.mencion, 0);
    assert.equal(a.totales.mencion, 50);
    assert.equal(a.huecos.length, 2);
    assert.deepEqual(a.huecos[0].competidores, ['Holded']);
    assert.deepEqual(a.topDominios.map((d) => [d.dominio, d.citas, d.marca]).sort(), [['facturalia.app', 2, 'Facturalia'], ['holded.com', 2, 'Holded']]);

    // La semana siguiente desaparece Perplexity: no debe contar como pregunta perdida.
    const siguiente = analizar(respuestas.filter((r) => r.motor === 'chatgpt'), config);
    const c = comparar(siguiente, a);
    assert.equal(c.perdidas.length, 0);
    assert.equal(c.motores.chatgpt.mencion, 0);

    const html = generarHtml({ config, fecha: '2026-10-05', analisis: a, comparacion: null, respuestas });
    assert.match(html, /Huecos para reescribir/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('el informe escapa HTML de preguntas y URLs', () => {
  const respuestas = [{
    id: 'x', motor: 'chatgpt', pregunta: '<img src=x onerror=alert(1)>', categoria: 'g', texto: 'Holded',
    citas: [{ url: 'https://holded.com/"><script>', dominio: 'holded.com', titulo: '<b>' }],
    marcas: [{ marca: 'Holded', propia: false, mencionada: true, citada: true, posicion: 1, urls: [] }],
  }];
  const html = generarHtml({ config: CONFIG, fecha: '2026-10-05', analisis: analizar(respuestas, CONFIG), respuestas });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /"><script>/);
});

test('extrae tipos de schema de JSON-LD con @graph y microdatos', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["Product","SoftwareApplication"],"review":{"@type":"Review"}}]}</script>
  <script type='application/ld+json'>{roto</script><div itemscope itemtype="https://schema.org/FAQPage"></div>`;
  const e = extraerEsquema(html);
  assert.deepEqual(e.tipos, ['Organization', 'Product', 'Review', 'SoftwareApplication']);
  assert.deepEqual(e.microdatos, ['FAQPage']);
  assert.equal(e.errores.length, 1);
});

test('genera llms.txt con el formato de llmstxt.org y Optional al final', () => {
  const config = {
    ...CONFIG,
    marca: { ...CONFIG.marca, descripcion: 'Facturación para autónomos.' },
    paginas: [
      { url: 'https://facturalia.app/blog', titulo: 'Blog', seccion: 'Optional' },
      { url: 'https://facturalia.app/precios', titulo: 'Precios', descripcion: 'Planes', seccion: 'Producto', categorias: ['precio'] },
    ],
  };
  const txt = generarLlmsTxt(config, [{ categoria: 'precio', texto: '¿Cuánto cuesta?' }]);
  assert.match(txt, /^# Facturalia\n\n> Facturación para autónomos\.\n/);
  assert.match(txt, /- \[Precios\]\(https:\/\/facturalia\.app\/precios\): Planes/);
  assert.ok(txt.indexOf('## Producto') < txt.indexOf('## Optional'));
  assert.match(txt, /- \[¿Cuánto cuesta\?\]\(https:\/\/facturalia\.app\/precios\)/);
});

test('genera JSON-LD seguro con FAQPage solo si hay respuestas', () => {
  const sin = generarEsquema(CONFIG);
  assert.deepEqual(sin['@graph'].map((n) => n['@type']), ['Organization', 'WebSite']);
  const con = generarEsquema({ ...CONFIG, faq: [{ pregunta: '¿</script>?', respuesta: 'Sí' }] });
  assert.equal(con['@graph'][2]['@type'], 'FAQPage');
  const script = etiquetaScript(con);
  assert.equal(script.match(/<\/script>/g).length, 1);
  assert.doesNotThrow(() => JSON.parse(script.replace(/<\/?script[^>]*>/g, '')));
});

test('convierte HTML a texto conservando los encabezados', () => {
  const t = htmlATexto('<nav>menú</nav><h2>Precios</h2><p>Desde 9&nbsp;€</p><script>x()</script>');
  assert.match(t, /## Precios/);
  assert.match(t, /Desde 9 €/);
  assert.doesNotMatch(t, /menú|x\(\)/);
});

test('inspección: guarda schema de las URLs citadas y el llms.txt de cada dominio', async () => {
  const { inspeccionar } = await import('../src/inspeccionar.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'geo-'));
  try {
    const config = { ...CONFIG, _dir: dir, datos: 'datos', inspeccion: { activo: true, maxUrls: 5 } };
    const respuestas = [{ citas: [{ url: 'https://holded.com/precios' }, { url: 'https://getquipu.com' }] }];
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u === 'https://holded.com/llms.txt') return new Response('# Holded\n\n> ERP online', { headers: { 'content-type': 'text/plain' } });
      if (u.endsWith('.txt')) return new Response('<html>404</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (u === 'https://holded.com/precios') {
        return new Response('<title>Precios</title><script type="application/ld+json">{"@type":"FAQPage"}</script>', { headers: { 'content-type': 'text/html' } });
      }
      return new Response('', { status: 403, headers: { 'content-type': 'text/html' } });
    };
    const r = await inspeccionar(config, '2026-10-05', respuestas, { fetchImpl, log: () => {} });
    assert.deepEqual(r.paginas[0].esquema.tipos, ['FAQPage']);
    assert.equal(r.paginas[0].titulo, 'Precios');
    assert.equal(r.paginas[1].status, 403);
    assert.deepEqual(r.llms.map((l) => [l.dominio, l.llmsTxt]), [['holded.com', true], ['getquipu.com', false]]);
    const guardado = await readFile(path.join(dir, 'datos/ejecuciones/2026-10-05/llms/holded.com.txt'), 'utf8');
    assert.match(guardado, /^# Holded/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('reescritura: llama a Claude en streaming con esfuerzo y fallbacks', async () => {
  const { pedirReescritura } = await import('../src/reescribir.js');
  const eventos = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '## Diagnóstico' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  const sse = eventos.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  let enviado;
  const fetchImpl = async (url, init) => {
    enviado = JSON.parse(init.body);
    return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
  };
  const r = await pedirReescritura('brief', { reescritura: { modelo: 'claude-opus-5-5', esfuerzo: 'high' } }, { clave: 'k', fetchImpl });
  assert.equal(r.texto, '## Diagnóstico');
  assert.equal(r.truncado, false);
  assert.equal(enviado.stream, true);
  assert.equal(enviado.fallbacks, 'default');
  assert.deepEqual(enviado.output_config, { effort: 'high' });
});
