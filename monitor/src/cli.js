#!/usr/bin/env node
// geo-monitor: pregunta a ChatGPT, Claude, Gemini y Perplexity, guarda las respuestas
// y registra qué marcas y URLs citan. Ver README.md.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cargarConfig, MOTORES, CLAVES_API, NOMBRES_MOTOR } from './config.js';
import { parsearPreguntas, idPregunta } from './extraer.js';
import { ejecutar } from './ejecutar.js';
import { inspeccionar } from './inspeccionar.js';
import { analizar } from './analizar.js';
import { generarSalidas } from './salidas.js';
import { listarEjecuciones, leerRespuestas, leerJson, dirEjecucion, dirDatos, fechaHoy, fechaSemana } from './almacen.js';
import { generarLlmsTxt, generarEsquema, etiquetaScript } from './generar.js';
import { htmlATexto, contextoPregunta, construirBrief, pedirReescritura, limitarTextoPagina } from './reescribir.js';

const AYUDA = `geo-monitor · visibilidad de tu marca en las versiones gratuitas de ChatGPT, Claude, Gemini, Perplexity y Google AI Mode

Uso: node src/cli.js <comando> [opciones]

Comandos (gratis: usan las versiones gratuitas de cada motor en tu navegador)
  capturar     Panel local: abre cada pregunta en tu navegador y guardas la respuesta con un marcador (manual, 100 % seguro)
  acceder      Abre el navegador automático para iniciar sesión una vez en cada motor
  ejecutar     Hace todas las preguntas, guarda respuestas, inspecciona schema/llms.txt y genera el informe
               (modo "navegador": automatiza las webs gratuitas; modo "api": APIs de pago)
  informe      Regenera el informe de una ejecución ya guardada
  huecos       Escribe huecos.md: preguntas donde no apareces y quién aparece en tu lugar
  reescribir   Brief (y reescritura con Claude) de tu página para las preguntas con hueco
  llms         Genera el llms.txt de tu web
  schema       Genera el JSON-LD (Organization, WebSite, FAQPage) de tu web
  motores      Comprueba qué motores están activos y qué claves faltan

Opciones
  --config <ruta>       config.json (por defecto ./config.json)
  --preguntas <ruta>    archivo de preguntas (por defecto ./preguntas.txt)
  --fecha <AAAA-MM-DD>  ejecución a usar (por defecto el lunes de esta semana o la última)
  --modo <m>            navegador | api (por defecto el de config.json: navegador)
  --puerto <n>          (capturar) puerto local, por defecto 4567
  --motores <lista>     p. ej. chatgpt,claude
  --limite <n>          solo las n primeras preguntas (para probar)
  --simular             respuestas falsas, sin APIs ni coste
  --sin-inspeccion      no visitar las URLs citadas
  --pregunta <ids>      (reescribir) IDs separados por comas; por defecto los 5 peores huecos
  --categoria <c>       (reescribir) usar los huecos de esa categoría
  --url <url>           (reescribir) tu página a reescribir
  --solo-brief          (reescribir) no llamar a Claude, solo guardar el brief
  --salida <ruta>       (llms/schema) archivo de salida
`;

const { values: op, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: 'config.json' },
    preguntas: { type: 'string', default: 'preguntas.txt' },
    fecha: { type: 'string' },
    modo: { type: 'string' },
    puerto: { type: 'string' },
    motores: { type: 'string' },
    limite: { type: 'string' },
    simular: { type: 'boolean', default: false },
    'sin-inspeccion': { type: 'boolean', default: false },
    pregunta: { type: 'string' },
    categoria: { type: 'string' },
    url: { type: 'string' },
    'solo-brief': { type: 'boolean', default: false },
    salida: { type: 'string' },
    ayuda: { type: 'boolean', short: 'h', default: false },
  },
});

const comando = positionals[0];

async function cargarPreguntas(config) {
  const ruta = path.resolve(op.preguntas);
  const preguntas = parsearPreguntas(await readFile(ruta, 'utf8'));
  if (!preguntas.length) throw new Error(`${ruta} no contiene preguntas.`);
  return op.limite ? preguntas.slice(0, Number(op.limite)) : preguntas;
}

async function fechaElegida(config) {
  if (op.fecha) return op.fecha;
  const fechas = await listarEjecuciones(config);
  if (!fechas.length) throw new Error('Todavía no hay ejecuciones. Lanza primero: node src/cli.js ejecutar');
  return fechas.at(-1);
}

async function main() {
  if (!comando || op.ayuda) {
    console.log(AYUDA);
    return;
  }
  const config = await cargarConfig(path.resolve(op.config));

  switch (comando) {
    case 'ejecutar': {
      const fecha = op.fecha || fechaSemana();
      const preguntas = await cargarPreguntas(config);
      const soloMotores = op.motores?.split(',').map((s) => s.trim());
      const modo = op.modo || config.modo;
      let errores = 0;
      let total = 0;
      if (modo === 'navegador' && !op.simular) {
        const { ejecutarNavegador } = await import('./navegador/automatico.js');
        const r = await ejecutarNavegador(config, preguntas, { fecha, soloMotores });
        errores = r.errores;
        total = r.pendientes;
      } else {
        ({ errores, total } = await ejecutar(config, preguntas, { fecha, simular: op.simular, soloMotores }));
      }
      if (config.inspeccion.activo && !op['sin-inspeccion'] && !op.simular) {
        await inspeccionar(config, fecha, await leerRespuestas(config, fecha));
      }
      const { ruta, analisis } = await generarSalidas(config, fecha);
      console.log(`\n✅ Mención de ${config.marca.nombre}: ${analisis.totales.mencion}% · citación: ${analisis.totales.citacion}% · huecos: ${analisis.huecos.length}`);
      console.log(`📄 Informe: ${ruta}`);
      if (errores) {
        console.log(`⚠️  ${errores} preguntas fallaron${modo === 'navegador' ? ` y quedan ${total} pendientes` : ''}. Vuelve a lanzar el mismo comando esta semana para completarlas.`);
        process.exitCode = 2;
      }
      break;
    }
    case 'acceder': {
      const { acceder } = await import('./navegador/automatico.js');
      await acceder(config);
      console.log('✅ Sesiones guardadas. Ya puedes lanzar: node src/cli.js ejecutar');
      break;
    }
    case 'capturar': {
      const { crearServidor } = await import('./navegador/asistido.js');
      const fecha = op.fecha || fechaSemana();
      const preguntas = await cargarPreguntas(config);
      const { servidor, url } = crearServidor(config, preguntas, { fecha, puerto: Number(op.puerto || 4567) });
      servidor.listen(Number(op.puerto || 4567), '127.0.0.1', () => {
        console.log(`🧭 Panel de captura de la semana ${fecha}: ${url}`);
        console.log('   Ábrelo en tu navegador habitual. Ctrl+C para salir.');
      });
      await new Promise((r) => servidor.on('close', r));
      break;
    }
    case 'informe': {
      const { ruta } = await generarSalidas(config, await fechaElegida(config));
      console.log(`📄 Informe: ${ruta}`);
      break;
    }
    case 'huecos': {
      const fecha = await fechaElegida(config);
      await generarSalidas(config, fecha);
      console.log(`📝 ${path.join(dirEjecucion(config, fecha), 'huecos.md')}`);
      break;
    }
    case 'reescribir':
      await comandoReescribir(config);
      break;
    case 'llms': {
      let preguntas = [];
      try {
        preguntas = await cargarPreguntas(config);
      } catch {
        // Sin archivo de preguntas el llms.txt se genera solo con las páginas.
      }
      const salida = path.resolve(op.salida || path.join(dirDatos(config), 'salida', 'llms.txt'));
      await mkdir(path.dirname(salida), { recursive: true });
      await writeFile(salida, generarLlmsTxt(config, preguntas));
      console.log(`📄 ${salida}\nSúbelo a la raíz de tu dominio: https://${config.marca.dominios?.[0] || 'tu-dominio'}/llms.txt`);
      break;
    }
    case 'schema': {
      const esquema = generarEsquema(config);
      const salida = path.resolve(op.salida || path.join(dirDatos(config), 'salida', 'schema.html'));
      await mkdir(path.dirname(salida), { recursive: true });
      await writeFile(salida, etiquetaScript(esquema));
      console.log(`📄 ${salida}\nPega el <script> en el <head> de tu web.`);
      if (!esquema['@graph'].some((n) => n['@type'] === 'FAQPage')) {
        console.log('ℹ️  Añade "faq": [{"pregunta": "…", "respuesta": "…"}] en config.json para incluir FAQPage.');
      }
      break;
    }
    case 'motores': {
      console.log(`Modo: ${config.modo}${config.modo === 'navegador' ? ' (versiones gratuitas, sin claves)' : ''}`);
      for (const m of MOTORES) {
        const c = config.motores[m];
        const detalle = config.modo === 'navegador'
          ? 'web gratuita'
          : CLAVES_API[m] ? `${c.modelo} · ${process.env[CLAVES_API[m]] ? 'clave OK' : `falta ${CLAVES_API[m]}`}` : 'solo modo navegador';
        console.log(`${c.activo ? '✔' : '✖'} ${NOMBRES_MOTOR[m].padEnd(15)} ${c.activo ? detalle : 'desactivado'}`);
      }
      break;
    }
    default:
      console.error(`Comando desconocido: ${comando}\n`);
      console.log(AYUDA);
      process.exitCode = 1;
  }
}

async function comandoReescribir(config) {
  if (!op.url) throw new Error('Indica la página a reescribir con --url https://tu-dominio/pagina');
  const fecha = await fechaElegida(config);
  const respuestas = await leerRespuestas(config, fecha);
  const analisis = analizar(respuestas, config);
  const inspeccion = await leerJson(path.join(dirEjecucion(config, fecha), 'inspeccion.json'));

  let ids;
  if (op.pregunta) {
    ids = op.pregunta.split(',').map((s) => s.trim()).map((s) => (/^[0-9a-f]{10}$/.test(s) ? s : idPregunta(s)));
  } else if (op.categoria) {
    ids = analisis.huecos.filter((h) => h.categoria === op.categoria).slice(0, 8).map((h) => h.id);
  } else {
    ids = analisis.huecos.slice(0, 5).map((h) => h.id);
  }
  const contextos = ids.map((id) => contextoPregunta(id, respuestas, inspeccion)).filter(Boolean);
  if (!contextos.length) throw new Error(`No hay respuestas guardadas para esas preguntas en la ejecución ${fecha}.`);

  console.log(`⬇️  Descargando ${op.url}…`);
  const res = await fetch(op.url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'geo-monitor/1.0' } });
  if (!res.ok) throw new Error(`No se pudo descargar ${op.url}: HTTP ${res.status}`);
  const { texto: textoPagina, recortado } = limitarTextoPagina(htmlATexto(await res.text()));
  if (recortado) console.log('⚠️  La página es muy larga: se envían solo sus primeros 80 000 caracteres.');

  const brief = construirBrief({ config, url: op.url, textoPagina, contextos });
  const slug = new URL(op.url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'inicio';
  const dir = path.join(dirDatos(config), 'reescrituras');
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, `${fecha}-${slug}`);
  await writeFile(`${base}.brief.md`, brief);
  console.log(`📝 Brief: ${base}.brief.md (${contextos.length} preguntas)`);

  const clave = process.env.ANTHROPIC_API_KEY;
  if (op['solo-brief'] || !clave) {
    if (!clave && !op['solo-brief']) console.log('ℹ️  Sin ANTHROPIC_API_KEY: pega el brief en el asistente que prefieras.');
    return;
  }
  console.log(`✍️  Reescribiendo con ${config.reescritura.modelo}…`);
  const { texto, truncado, modelo } = await pedirReescritura(brief, config, { clave });
  const cabecera = `<!-- Reescritura generada por ${modelo} el ${fechaHoy()} para ${op.url} a partir de la ejecución ${fecha}. Revisa los marcadores [DATO: …] antes de publicar. -->\n\n`;
  await writeFile(`${base}.md`, cabecera + texto);
  console.log(`✅ Reescritura: ${base}.md${truncado ? ' (cortada por longitud: vuelve a lanzarla con menos preguntas)' : ''}`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
