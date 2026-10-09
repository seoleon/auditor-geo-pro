// Pruebas del modo gratuito (navegador automático y captura asistida) con réplicas locales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

import { servirSitiosFalsos } from './fixtures/sitios-falsos.js';
import { ejecutarNavegador, abrirNavegador } from '../src/navegador/automatico.js';
import { crearServidor, emparejar } from '../src/navegador/asistido.js';
import { motorDeHost } from '../src/navegador/sitios.js';
import { leerRespuestas } from '../src/almacen.js';
import { parsearPreguntas } from '../src/extraer.js';
import { analizar } from '../src/analizar.js';

let falsos;
let dir;

const PREGUNTAS = parsearPreguntas('precio | ¿Cuánto cuesta un programa de facturación?\nrecomendacion | ¿Mejor programa de facturación para autónomos?');

function configBase(extra = {}) {
  const base = `http://127.0.0.1:${falsos.puerto}`;
  return {
    marca: { nombre: 'Facturalia', dominios: ['facturalia.app'] },
    competidores: [
      { nombre: 'Holded', dominios: ['holded.com'] },
      { nombre: 'Quipu', dominios: ['getquipu.com'] },
    ],
    idioma: 'es',
    modo: 'navegador',
    motores: {
      chatgpt: { activo: true, web: { url: `${base}/chatgpt?q={q}` } },
      claude: { activo: true, web: { url: `${base}/claude` } },
      gemini: { activo: false },
      perplexity: { activo: true, web: { url: `${base}/captcha?q={q}` } },
      google: { activo: true, web: { url: `${base}/google?q={q}` } },
    },
    navegador: { canal: 'chromium', perfil: 'perfil', oculto: true, pausaMinSeg: 0, pausaMaxSeg: 0, esperaMaxSeg: 20 },
    inspeccion: { activo: false, maxUrls: 0 },
    paginas: [],
    _dir: dir,
    datos: 'datos',
    ...extra,
  };
}

before(async () => {
  falsos = await servirSitiosFalsos();
  dir = await mkdtemp(path.join(tmpdir(), 'geo-nav-'));
});

after(async () => {
  falsos.servidor.close();
  await rm(dir, { recursive: true, force: true });
});

test('modo navegador: pregunta como un usuario, espera la respuesta completa y guarda enlaces', { timeout: 120_000 }, async () => {
  const config = configBase();
  const mensajes = [];
  const r = await ejecutarNavegador(config, PREGUNTAS, { fecha: '2026-10-05', log: (m) => mensajes.push(m) });

  const respuestas = await leerRespuestas(config, '2026-10-05');
  const de = (motor) => respuestas.filter((x) => x.motor === motor);

  // ChatGPT (envío por URL) y Claude (escribiendo en el editor): respuesta completa, no a medias.
  for (const motor of ['chatgpt', 'claude']) {
    assert.equal(de(motor).length, 2, motor);
    for (const x of de(motor)) {
      assert.equal(x.error, undefined, `${motor}: ${x.error}`);
      assert.match(x.texto, /Quipu\.$/, `${motor} debe esperar al final del streaming`);
      assert.deepEqual(x.citas.map((c) => c.url).sort(), ['https://getquipu.com/blog', 'https://holded.com/precios']);
      assert.deepEqual(x.marcas.filter((m) => m.mencionada).map((m) => m.marca), ['Holded', 'Facturalia', 'Quipu']);
      assert.equal(x.fuente, 'navegador');
    }
  }
  // Google AI Mode: desenvuelve /url?q= y descarta enlaces internos de Google.
  assert.deepEqual(de('google')[0].citas.map((c) => c.url), ['https://getquipu.com/blog']);

  // Captcha: se detiene el motor tras el primer intento y guarda diagnóstico.
  assert.equal(de('perplexity').length, 1);
  assert.equal(de('perplexity')[0].tipoError, 'acceso');
  assert.equal(r.resumen.perplexity.parado, 'acceso');
  assert.ok(mensajes.some((m) => /Perplexity se detiene/.test(m)));

  // Al relanzar en la misma semana solo repite lo pendiente (Perplexity).
  const config2 = configBase();
  config2.motores.perplexity.web = { url: `http://127.0.0.1:${falsos.puerto}/google?q={q}`, selRespuesta: '[data-subtree="aimc"]' };
  await ejecutarNavegador(config2, PREGUNTAS, { fecha: '2026-10-05', log: () => {} });
  const final = await leerRespuestas(config2, '2026-10-05');
  assert.equal(final.filter((x) => !x.error).length, 8);

  const a = analizar(final, config2);
  assert.equal(a.porMotor.chatgpt.mencion, 100);
  assert.equal(a.porMotor.google.mencion, 0);
});

test('modo asistido: el marcador lee la respuesta en la web del motor y la guarda en el panel', { timeout: 60_000 }, async () => {
  const config = configBase({ datos: 'datos-asistido' });
  const puertoPanel = 4600 + Math.floor(Math.random() * 300);
  const { servidor, url } = crearServidor(config, PREGUNTAS, { fecha: '2026-10-05', puerto: puertoPanel, log: () => {} });
  await new Promise((r) => servidor.listen(puertoPanel, '127.0.0.1', r));
  // chatgpt.com apunta a la réplica local para que el marcador reconozca el motor por su dominio.
  const navegador = await chromium.launch({ args: [`--host-resolver-rules=MAP chatgpt.com 127.0.0.1:${falsos.puerto}`] });
  try {
    const ctx = await navegador.newContext();
    const panel = await ctx.newPage();
    await panel.goto(url);
    await panel.waitForSelector('button[data-m="chatgpt"]');
    const marcador = await panel.getAttribute('a.marcador', 'href');
    assert.match(marcador, /^javascript:/);

    const chat = await ctx.newPage();
    await chat.goto(`http://chatgpt.com/chatgpt?q=${encodeURIComponent(PREGUNTAS[1].texto)}`);
    await chat.waitForFunction(() => !document.querySelector('button[aria-label="Stop generating"]') && document.body.innerText.includes('Quipu.'));
    const [ventana] = await Promise.all([ctx.waitForEvent('page'), chat.evaluate(decodeURIComponent(marcador.slice('javascript:'.length)))]);
    await ventana.waitForLoadState();
    await ventana.waitForFunction(() => document.getElementById('titulo')?.textContent === 'Guardada ✓', null, { timeout: 10_000 }).catch(() => {});

    const guardadas = await leerRespuestas(config, '2026-10-05');
    assert.equal(guardadas.length, 1);
    assert.equal(guardadas[0].id, PREGUNTAS[1].id, 'se empareja por el texto de la pregunta mostrado en el chat');
    assert.equal(guardadas[0].fuente, 'marcador');
    assert.equal(guardadas[0].citas.length, 2);

    // Pegado manual desde el panel.
    await panel.selectOption('#mPregunta', PREGUNTAS[0].id);
    await panel.selectOption('#mMotor', 'claude');
    await panel.fill('#mTexto', 'Te recomiendo Facturalia (https://facturalia.app/precios) o Holded.');
    await panel.click('#mGuardar');
    await panel.waitForFunction(() => /Guardada/.test(document.getElementById('mEstado').textContent));
    const todas = await leerRespuestas(config, '2026-10-05');
    const manual = todas.find((x) => x.motor === 'claude');
    assert.equal(manual.fuente, 'manual');
    assert.equal(manual.marcas.find((m) => m.propia).citada, true);

    // Otra web no puede escribir datos sin el token del panel.
    const intruso = await fetch(`${url}api/guardar`, { method: 'POST', body: '{}' });
    assert.equal(intruso.status, 403);
  } finally {
    await navegador.close();
    servidor.close();
  }
});

test('empareja capturas por texto, por similitud o por la última pregunta abierta', () => {
  const abiertas = new Map([['gemini', { id: PREGUNTAS[0].id, cuando: Date.now() }]]);
  assert.equal(emparejar({ motor: 'chatgpt', pregunta: '¿cuanto cuesta un programa de facturacion?' }, PREGUNTAS, abiertas), PREGUNTAS[0].id);
  assert.equal(emparejar({ motor: 'claude', pregunta: 'Tú: ¿Mejor programa de facturación para autónomos? (editado)' }, PREGUNTAS, abiertas), PREGUNTAS[1].id);
  assert.equal(emparejar({ motor: 'gemini', pregunta: '' }, PREGUNTAS, abiertas), PREGUNTAS[0].id);
  assert.equal(emparejar({ motor: 'perplexity', pregunta: '' }, PREGUNTAS, abiertas), null);
});

test('reconoce cada motor por su dominio', () => {
  assert.equal(motorDeHost('chatgpt.com'), 'chatgpt');
  assert.equal(motorDeHost('claude.ai'), 'claude');
  assert.equal(motorDeHost('gemini.google.com'), 'gemini');
  assert.equal(motorDeHost('www.perplexity.ai'), 'perplexity');
  assert.equal(motorDeHost('www.google.es'), 'google');
  assert.equal(motorDeHost('example.com'), null);
});

test('abrirNavegador explica cómo seguir si no está Chrome instalado', async () => {
  const config = configBase();
  config.navegador = { ...config.navegador, canal: 'canal-inexistente' };
  await assert.rejects(abrirNavegador(config), /npx playwright install chromium/);
});

test('casos difíciles: no envía dos veces, no confunde "límite de uso", plan B y fuentes tardías', { timeout: 120_000 }, async () => {
  const { probarMotores } = await import('../src/navegador/automatico.js');
  const base = `http://127.0.0.1:${falsos.puerto}`;
  const config = configBase({ datos: 'datos-dificiles' });
  config.motores = {
    chatgpt: { activo: true, web: { url: `${base}/rediseno?q={q}` } },
    claude: { activo: true, web: { url: `${base}/claude-auto?q={q}` } },
    gemini: { activo: false },
    perplexity: { activo: true, web: { url: `${base}/limite-producto?q={q}` } },
    google: { activo: true, web: { url: `${base}/fuentes-tardias?q={q}` } },
  };
  config.navegador.esperaMaxSeg = 30;
  const r = await probarMotores(config, PREGUNTAS[1].texto, { log: () => {} });

  assert.equal(r.claude.estado, 'ok');
  assert.doesNotMatch(r.claude.inicio, /DOS VECES/, 'no debe reenviar una pregunta que la web ya envió');

  assert.equal(r.perplexity.estado, 'ok', 'una respuesta sobre "límite de uso" no es un cupo agotado');
  assert.deepEqual(r.perplexity.marcas, ['Facturalia', 'Holded']);

  assert.equal(r.chatgpt.estado, 'plan-b', 'web rediseñada: se lee con el plan B');
  assert.match(r.chatgpt.inicio, /^Para autónomos/);
  assert.equal(r.chatgpt.enlaces, 1);
  assert.deepEqual(r.chatgpt.marcas.sort(), ['Facturalia', 'Holded', 'Quipu']);

  assert.equal(r.google.estado, 'ok');
  assert.equal(r.google.enlaces, 1, 'espera a las fuentes que cargan después del texto');
});

test('el panel rechaza peticiones con otro Host (DNS rebinding)', async () => {
  const config = configBase({ datos: 'datos-host' });
  const puerto = 4950 + Math.floor(Math.random() * 40);
  const { servidor } = crearServidor(config, PREGUNTAS, { fecha: '2026-10-05', puerto, log: () => {} });
  await new Promise((r) => servidor.listen(puerto, '127.0.0.1', r));
  try {
    const http = await import('node:http');
    const status = await new Promise((r) =>
      http.get({ host: '127.0.0.1', port: puerto, path: '/', headers: { host: `atacante.com:${puerto}` } }, (res) => r(res.statusCode)),
    );
    assert.equal(status, 421);
    assert.equal((await fetch(`http://127.0.0.1:${puerto}/`)).status, 200);
  } finally {
    servidor.close();
  }
});
