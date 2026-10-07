// Modo navegador automático: abre las versiones GRATUITAS de cada motor en un navegador
// real (con tu sesión iniciada una vez), escribe cada pregunta como un usuario y guarda
// la respuesta con los enlaces que muestra.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { MOTORES, NOMBRES_MOTOR } from '../config.js';
import { marcasDeConfig } from '../extraer.js';
import { guardarRespuesta, leerRespuestas, dirEjecucion } from '../almacen.js';
import { construirRegistro, escribirMeta } from '../ejecutar.js';
import { SITIOS, SEL_OCUPADO, BLOQUEOS, sitio, urlPregunta } from './sitios.js';
import { extraerRespuesta, opcionesExtractor } from './extractor.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (min, max) => min + Math.random() * (max - min);

export async function abrirNavegador(config, { oculto } = {}) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error('Falta Playwright. Ejecuta: npm install');
  }
  const conf = config.navegador;
  const perfil = path.resolve(config._dir, conf.perfil);
  const opciones = {
    headless: oculto ?? conf.oculto,
    viewport: null,
    locale: config.idioma === 'es' ? 'es-ES' : config.idioma,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized', ...(conf.args || [])],
    ignoreDefaultArgs: ['--enable-automation'],
    ...(conf.canal && conf.canal !== 'chromium' ? { channel: conf.canal } : {}),
    ...(conf.ejecutable ? { executablePath: conf.ejecutable } : {}),
  };
  try {
    return await playwright.chromium.launchPersistentContext(perfil, opciones);
  } catch (err) {
    if (opciones.channel) {
      throw new Error(
        `No pude abrir ${opciones.channel}: ${err.message.split('\n')[0]}\n` +
          'Instala Google Chrome, o pon "navegador": { "canal": "chromium" } en config.json y ejecuta: npx playwright install chromium',
      );
    }
    throw err;
  }
}

/** Abre una pestaña por motor para que inicies sesión. Termina al cerrar el navegador. */
export async function acceder(config, { log = console.log } = {}) {
  const ctx = await abrirNavegador(config, { oculto: false });
  const motores = MOTORES.filter((m) => config.motores[m]?.activo);
  const [primera] = ctx.pages();
  for (const [i, m] of motores.entries()) {
    const pagina = i === 0 && primera ? primera : await ctx.newPage();
    await pagina.goto(sitio(config, m).url.replace(/[?&][^?&]*\{q\}/, '')).catch(() => {});
  }
  log('🔐 Inicia sesión en cada pestaña (si el motor lo pide) y acepta las cookies.');
  log('   Consejo: usa cuentas gratuitas dedicadas y desactiva la memoria/personalización.');
  log('   Cierra el navegador cuando termines: la sesión queda guardada en el perfil.');
  await new Promise((r) => ctx.on('close', r));
}

async function escribirPregunta(pagina, s, pregunta) {
  const editor = pagina.locator(s.selEditor).first();
  await editor.waitFor({ state: 'visible', timeout: 20_000 });
  await editor.click();
  const actual = (await editor.evaluate((el) => el.value ?? el.innerText ?? '')).trim();
  if (actual !== pregunta.trim()) {
    await pagina.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await pagina.keyboard.press('Backspace');
    await pagina.keyboard.type(pregunta, { delay: azar(15, 45) });
  }
  await esperar(azar(300, 900));
  await pagina.keyboard.press('Enter');
}

/**
 * Hace una pregunta en una pestaña y espera a que la respuesta deje de cambiar.
 * Devuelve { texto, citas } o lanza un error con `tipo` = acceso | limite | sesion | vacio.
 */
export async function preguntarEnPagina(pagina, s, pregunta, { esperaMaxSeg = 180, sondeoMs = 1500 } = {}) {
  const op = opcionesExtractor(s, { SEL_OCUPADO, BLOQUEOS });
  await pagina.goto(urlPregunta(s, pregunta), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (/\/(login|auth|signin|sign-in)|accounts\.google\.com/i.test(pagina.url())) throw errorTipo('sesion', 'Hay que iniciar sesión: ejecuta node src/cli.js acceder');

  let enviada = false;
  if (!s.envioAutomatico) {
    await esperar(1500);
    await escribirPregunta(pagina, s, pregunta);
    enviada = true;
  }

  const limite = Date.now() + esperaMaxSeg * 1000;
  const inicio = Date.now();
  let anterior = '';
  let estables = 0;
  let r;
  while (Date.now() < limite) {
    await esperar(sondeoMs);
    r = await pagina.evaluate(extraerRespuesta, op).catch(() => null);
    if (!r) continue;
    if (r.bloqueo) throw errorTipo(r.bloqueo, r.bloqueo === 'limite' ? 'Cupo gratuito agotado por ahora' : 'El motor pide verificación (captcha/acceso)');
    // Si el envío automático por URL no funcionó, la escribimos como un usuario.
    if (!enviada && !r.texto && Date.now() - inicio > 10_000) {
      await escribirPregunta(pagina, s, pregunta).catch(() => {});
      enviada = true;
      continue;
    }
    if (r.texto && r.texto === anterior && !r.ocupado) estables++;
    else estables = 0;
    anterior = r.texto;
    if (estables >= 3 && r.texto.length > 20) return { texto: r.texto, citas: r.enlaces, url: r.url };
  }
  if (r?.texto && r.texto.length > 20) return { texto: r.texto, citas: r.enlaces, url: r.url, incompleta: true };
  throw errorTipo('vacio', 'No encontré la respuesta en la página (puede que hayan cambiado los selectores)');
}

function errorTipo(tipo, mensaje) {
  const e = new Error(mensaje);
  e.tipo = tipo;
  return e;
}

async function diagnostico(config, fecha, pagina, motor, id) {
  const dir = path.join(dirEjecucion(config, fecha), 'diagnostico');
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, `${motor}-${id}`);
  await pagina.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
  await writeFile(`${base}.html`, await pagina.content().catch(() => '')).catch(() => {});
  return `${base}.png`;
}

export async function ejecutarNavegador(config, preguntas, { fecha, soloMotores, log = console.log, contexto } = {}) {
  const motores = MOTORES.filter((m) => config.motores[m]?.activo && SITIOS[m] && (!soloMotores || soloMotores.includes(m)));
  if (!motores.length) throw new Error('No hay motores activos.');
  const marcas = marcasDeConfig(config);
  const previas = await leerRespuestas(config, fecha);
  const hechas = new Set(previas.filter((r) => !r.error).map((r) => `${r.id}|${r.motor}`));
  const conf = config.navegador;

  const ctx = contexto || (await abrirNavegador(config));
  const resumen = {};
  log(`▶ Semana ${fecha}: ${preguntas.length} preguntas × ${motores.length} motores gratuitos (${motores.map((m) => NOMBRES_MOTOR[m]).join(', ')})`);
  if (hechas.size) log(`  Reanudando: ${hechas.size} respuestas ya guardadas esta semana.`);

  try {
    // Un motor por pestaña, en paralelo; dentro de cada motor, una pregunta tras otra con pausas.
    await Promise.all(
      motores.map(async (motor) => {
        const s = sitio(config, motor);
        const pagina = await ctx.newPage();
        const pendientes = preguntas.filter((p) => !hechas.has(`${p.id}|${motor}`));
        const est = (resumen[motor] = { hechas: preguntas.length - pendientes.length, errores: 0, parado: null });
        let fallosSeguidos = 0;
        for (const [i, p] of pendientes.entries()) {
          const inicio = Date.now();
          try {
            const r = await preguntarEnPagina(pagina, s, p.texto, { esperaMaxSeg: conf.esperaMaxSeg });
            const registro = construirRegistro({ fecha, pregunta: p, motor, modelo: 'gratis-web', fuente: 'navegador' }, r, marcas);
            registro.urlConversacion = r.url;
            if (r.incompleta) registro.incompleta = true;
            registro.ms = Date.now() - inicio;
            await guardarRespuesta(config, fecha, registro);
            est.hechas++;
            fallosSeguidos = 0;
            const marcasVistas = registro.marcas.filter((x) => x.mencionada).map((x) => x.marca).join(', ') || '—';
            log(`  ${NOMBRES_MOTOR[motor].padEnd(14)} ${est.hechas}/${preguntas.length} · ${registro.citas.length} enlaces · marcas: ${marcasVistas}`);
          } catch (err) {
            est.errores++;
            fallosSeguidos++;
            const captura = await diagnostico(config, fecha, pagina, motor, p.id);
            await guardarRespuesta(config, fecha, {
              fecha, id: p.id, categoria: p.categoria, pregunta: p.texto, motor, modelo: 'gratis-web', fuente: 'navegador',
              error: err.message, tipoError: err.tipo || 'otro', ms: Date.now() - inicio,
            });
            log(`  ⚠️  ${NOMBRES_MOTOR[motor]}: ${err.message} (captura: ${path.relative(process.cwd(), captura)})`);
            if (['acceso', 'limite', 'sesion'].includes(err.tipo) || fallosSeguidos >= 3) {
              est.parado = err.tipo || 'fallos';
              log(`  ⏸  ${NOMBRES_MOTOR[motor]} se detiene. Vuelve a lanzar "ejecutar" más tarde esta semana: continuará donde lo dejó.`);
              break;
            }
          }
          if (i < pendientes.length - 1) await esperar(azar(conf.pausaMinSeg, conf.pausaMaxSeg) * 1000);
        }
        await pagina.close().catch(() => {});
      }),
    );
  } finally {
    if (!contexto) await ctx.close().catch(() => {});
  }

  await escribirMeta(config, fecha, {
    modo: 'navegador',
    preguntas: preguntas.length,
    motores: motores.map((m) => ({ motor: m, modelo: 'gratis-web' })),
    resumen,
  });
  const errores = Object.values(resumen).reduce((a, x) => a + x.errores, 0);
  const pendientes = Object.values(resumen).reduce((a, x) => a + (preguntas.length - x.hechas), 0);
  return { errores, pendientes, resumen };
}
