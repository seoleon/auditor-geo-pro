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

  // Para escribir la pregunta solo se usa el selector exacto (nunca el plan B), y antes se
  // comprueba que la web no la haya enviado ya sola: así nunca se envía dos veces.
  const opEnvio = { ...op, heuristica: false };
  const yaEnviada = async () => {
    const x = await pagina.evaluate(extraerRespuesta, opEnvio).catch(() => null);
    return Boolean(x && (x.texto || x.pregunta || x.ocupado));
  };

  let enviada = false;
  if (!s.envioAutomatico) {
    await esperar(2500);
    if (!(await yaEnviada())) await escribirPregunta(pagina, s, pregunta);
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
    if (!enviada && Date.now() - inicio > 10_000) {
      enviada = true;
      if (!(await yaEnviada())) {
        await escribirPregunta(pagina, s, pregunta).catch(() => {});
        continue;
      }
    }
    // La respuesta está completa cuando ni el texto ni sus enlaces cambian durante 3 sondeos
    // seguidos y no se ve el botón de "detener".
    const firma = `${r.texto}\u0000${r.enlaces.length}`;
    if (r.texto && firma === anterior && !r.ocupado) estables++;
    else estables = 0;
    anterior = firma;
    if (estables >= 3 && r.texto.length > 20) {
      // Confirmación final: algunas webs cargan las fuentes unos segundos después del texto.
      await esperar(sondeoMs + 500);
      const conf = await pagina.evaluate(extraerRespuesta, op).catch(() => null);
      if (conf && conf.texto === r.texto && conf.enlaces.length === r.enlaces.length && !conf.ocupado) return resultado(conf);
      estables = 0;
      anterior = '';
    }
  }
  if (r?.texto && r.texto.length > 20) return { ...resultado(r), incompleta: true };
  throw errorTipo('vacio', 'No encontré la respuesta en la página (puede que hayan cambiado los selectores)');
}

function resultado(r) {
  return { texto: r.texto, citas: r.enlaces, url: r.url, heuristico: r.heuristico };
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
  // Si cierras el navegador a mitad, se para limpiamente y lo guardado se conserva.
  let cerrado = false;
  ctx.on('close', () => {
    cerrado = true;
  });
  const resumen = {};
  log(`▶ Semana ${fecha}: ${preguntas.length} preguntas × ${motores.length} motores gratuitos (${motores.map((m) => NOMBRES_MOTOR[m]).join(', ')})`);
  if (hechas.size) log(`  Reanudando: ${hechas.size} respuestas ya guardadas esta semana.`);

  try {
    // Un motor por pestaña, en paralelo; dentro de cada motor, una pregunta tras otra con pausas.
    await Promise.all(
      motores.map(async (motor) => {
        const s = sitio(config, motor);
        const pendientes = preguntas.filter((p) => !hechas.has(`${p.id}|${motor}`));
        const est = (resumen[motor] = { hechas: preguntas.length - pendientes.length, errores: 0, parado: null });
        if (!pendientes.length || cerrado) return;
        const pagina = await ctx.newPage().catch(() => null);
        if (!pagina) return;
        let fallosSeguidos = 0;
        let avisoHeuristico = false;
        for (const [i, p] of pendientes.entries()) {
          if (cerrado || pagina.isClosed()) {
            est.parado = 'navegador cerrado';
            break;
          }
          const inicio = Date.now();
          try {
            const r = await preguntarEnPagina(pagina, s, p.texto, { esperaMaxSeg: conf.esperaMaxSeg });
            const registro = construirRegistro({ fecha, pregunta: p, motor, modelo: 'gratis-web', fuente: 'navegador' }, r, marcas);
            registro.urlConversacion = r.url;
            if (r.incompleta) registro.incompleta = true;
            if (r.heuristico) {
              registro.heuristico = true;
              if (!avisoHeuristico) {
                avisoHeuristico = true;
                log(`  ℹ️  ${NOMBRES_MOTOR[motor]}: su web ha cambiado; leo la respuesta con el plan B. Comprueba el resultado con "node src/cli.js probar".`);
              }
            }
            registro.ms = Date.now() - inicio;
            await guardarRespuesta(config, fecha, registro);
            est.hechas++;
            fallosSeguidos = 0;
            const marcasVistas = registro.marcas.filter((x) => x.mencionada).map((x) => x.marca).join(', ') || '—';
            log(`  ${NOMBRES_MOTOR[motor].padEnd(14)} ${est.hechas}/${preguntas.length} · ${registro.citas.length} enlaces · marcas: ${marcasVistas}`);
          } catch (err) {
            if (cerrado || pagina.isClosed()) {
              est.parado = 'navegador cerrado';
              break;
            }
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
  if (cerrado) log('  ⏹  Navegador cerrado: lo guardado se conserva. Vuelve a lanzar "ejecutar" para continuar.');

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

/**
 * Prueba rápida: una pregunta por motor, sin guardar nada en la semana. Dice si cada web
 * se lee con su selector, con el plan B o no se lee, y guarda una captura de cada una.
 */
export async function probarMotores(config, pregunta, { soloMotores, log = console.log, contexto } = {}) {
  const motores = MOTORES.filter((m) => config.motores[m]?.activo && SITIOS[m] && (!soloMotores || soloMotores.includes(m)));
  const marcas = marcasDeConfig(config);
  const dir = path.join(path.resolve(config._dir, config.datos || 'datos'), 'pruebas');
  await mkdir(dir, { recursive: true });
  const ctx = contexto || (await abrirNavegador(config));
  log(`🧪 Probando ${motores.length} motores con: «${pregunta}»`);
  const resultados = {};
  try {
    await Promise.all(
      motores.map(async (motor) => {
        const pagina = await ctx.newPage();
        const inicio = Date.now();
        let res;
        try {
          const r = await preguntarEnPagina(pagina, sitio(config, motor), pregunta, { esperaMaxSeg: config.navegador.esperaMaxSeg });
          const reg = construirRegistro({ fecha: 'prueba', pregunta: { id: 'prueba', categoria: 'prueba', texto: pregunta }, motor, modelo: 'gratis-web', fuente: 'navegador' }, r, marcas);
          res = {
            estado: r.heuristico ? 'plan-b' : r.incompleta ? 'incompleta' : 'ok',
            caracteres: r.texto.length,
            enlaces: reg.citas.length,
            marcas: reg.marcas.filter((x) => x.mencionada).map((x) => x.marca),
            inicio: r.texto.slice(0, 160).replace(/\s+/g, ' '),
          };
        } catch (err) {
          res = { estado: err.tipo || 'error', error: err.message };
        }
        res.segundos = Math.round((Date.now() - inicio) / 1000);
        res.captura = path.join(dir, `${motor}.png`);
        await pagina.screenshot({ path: res.captura }).catch(() => {});
        if (res.estado !== 'ok') await writeFile(path.join(dir, `${motor}.html`), await pagina.content().catch(() => '')).catch(() => {});
        await pagina.close().catch(() => {});
        resultados[motor] = res;
      }),
    );
  } finally {
    if (!contexto) await ctx.close().catch(() => {});
  }
  const ICONO = { ok: '✅', 'plan-b': '🟡', incompleta: '🟡' };
  for (const m of motores) {
    const r = resultados[m];
    const cabecera = `${ICONO[r.estado] || '❌'} ${NOMBRES_MOTOR[m].padEnd(15)}`;
    if (r.error) log(`${cabecera} ${r.error}`);
    else log(`${cabecera} ${r.caracteres} caracteres · ${r.enlaces} enlaces · marcas: ${r.marcas.join(', ') || '—'} · ${r.segundos}s\n${' '.repeat(18)}«${r.inicio}…»`);
  }
  if (Object.values(resultados).some((r) => r.estado !== 'ok')) {
    log(`\nCapturas y HTML en ${dir}. 🟡 = se lee con el plan B: funciona, pero conviene ajustar "selRespuesta" (ver README).`);
  }
  return resultados;
}
