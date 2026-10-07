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
import { analizar, comparar } from './analizar.js';
import { escribirInforme, actualizarHistorico } from './informe.js';
import { listarEjecuciones, leerRespuestas, leerJson, dirEjecucion, dirDatos, fechaHoy } from './almacen.js';
import { generarLlmsTxt, generarEsquema, etiquetaScript } from './generar.js';
import { htmlATexto, contextoPregunta, construirBrief, pedirReescritura, informeHuecos, limitarTextoPagina } from './reescribir.js';

const AYUDA = `geo-monitor · visibilidad de tu marca en ChatGPT, Claude, Gemini y Perplexity

Uso: node src/cli.js <comando> [opciones]

Comandos
  ejecutar     Hace todas las preguntas, guarda respuestas, inspecciona schema/llms.txt y genera el informe
  informe      Regenera el informe de una ejecución ya guardada
  huecos       Escribe huecos.md: preguntas donde no apareces y quién aparece en tu lugar
  reescribir   Brief (y reescritura con Claude) de tu página para las preguntas con hueco
  llms         Genera el llms.txt de tu web
  schema       Genera el JSON-LD (Organization, WebSite, FAQPage) de tu web
  motores      Comprueba qué motores están activos y qué claves faltan

Opciones
  --config <ruta>       config.json (por defecto ./config.json)
  --preguntas <ruta>    archivo de preguntas (por defecto ./preguntas.txt)
  --fecha <AAAA-MM-DD>  ejecución a usar (por defecto hoy o la última)
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

/** Analiza una ejecución, la compara con la anterior y escribe informe, CSV, histórico y huecos. */
async function generarSalidas(config, fecha) {
  const respuestas = await leerRespuestas(config, fecha);
  const analisis = analizar(respuestas, config);
  const fechas = await listarEjecuciones(config);
  const fechaAnterior = fechas.filter((f) => f < fecha).at(-1);
  const anterior = fechaAnterior ? analizar(await leerRespuestas(config, fechaAnterior), config) : null;
  const dir = dirEjecucion(config, fecha);
  const historico = await actualizarHistorico(config, fecha, analisis);
  const ruta = await escribirInforme(config, fecha, {
    respuestas,
    analisis,
    comparacion: comparar(analisis, anterior),
    fechaAnterior,
    inspeccion: await leerJson(path.join(dir, 'inspeccion.json')),
    meta: await leerJson(path.join(dir, 'meta.json')),
    historico,
  });
  await writeFile(path.join(dir, 'huecos.md'), informeHuecos(config, fecha, analisis));
  return { ruta, analisis };
}

async function main() {
  if (!comando || op.ayuda) {
    console.log(AYUDA);
    return;
  }
  const config = await cargarConfig(path.resolve(op.config));

  switch (comando) {
    case 'ejecutar': {
      const fecha = op.fecha || fechaHoy();
      const preguntas = await cargarPreguntas(config);
      const { errores, total } = await ejecutar(config, preguntas, {
        fecha,
        simular: op.simular,
        soloMotores: op.motores?.split(',').map((s) => s.trim()),
      });
      if (config.inspeccion.activo && !op['sin-inspeccion'] && !op.simular) {
        await inspeccionar(config, fecha, await leerRespuestas(config, fecha));
      }
      const { ruta, analisis } = await generarSalidas(config, fecha);
      console.log(`\n✅ Mención de ${config.marca.nombre}: ${analisis.totales.mencion}% · citación: ${analisis.totales.citacion}% · huecos: ${analisis.huecos.length}`);
      console.log(`📄 Informe: ${ruta}`);
      if (errores) {
        console.log(`⚠️  ${errores}/${total} preguntas fallaron. Vuelve a lanzar el mismo comando para reintentarlas.`);
        process.exitCode = 2;
      }
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
      for (const m of MOTORES) {
        const c = config.motores[m];
        const clave = process.env[CLAVES_API[m]] ? 'clave OK' : `falta ${CLAVES_API[m]}`;
        console.log(`${c.activo ? '✔' : '✖'} ${NOMBRES_MOTOR[m].padEnd(11)} ${c.modelo.padEnd(22)} ${c.activo ? clave : 'desactivado'}`);
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
