// Modo asistido (100 % manual y gratis): un panel local abre cada pregunta en la versión
// gratuita de cada motor, en TU navegador normal; un marcador ("bookmarklet") lee la
// respuesta que tienes delante, con sus enlaces, y la guarda aquí.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { MOTORES, NOMBRES_MOTOR } from '../config.js';
import { marcasDeConfig, normalizarTexto } from '../extraer.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { guardarRespuesta, leerRespuestas, escribirMetaSiFalta, dirEjecucion } from '../almacen.js';
import { construirRegistro } from '../ejecutar.js';
import { generarSalidas } from '../salidas.js';
import { inspeccionar } from '../inspeccionar.js';
import { SITIOS, SEL_OCUPADO, BLOQUEOS, sitio, urlPregunta, motorDeHost } from './sitios.js';
import { extraerRespuesta, opcionesExtractor } from './extractor.js';

export function codigoMarcador(config, puerto) {
  const conf = {};
  for (const m of MOTORES) if (SITIOS[m]) conf[m] = opcionesExtractor(sitio(config, m), { SEL_OCUPADO, BLOQUEOS: [] }, { usarSeleccion: true });
  const destino = `http://127.0.0.1:${puerto}/guardar`;
  const codigo = `(()=>{const f=${extraerRespuesta.toString()};const C=${JSON.stringify(conf)};const m=(${motorDeHost.toString()})(location.hostname);if(!m){alert('geo-monitor: usa este marcador en ChatGPT, Claude, Gemini, Perplexity o Google.');return}const r=f(C[m]);if(!r.texto){alert('geo-monitor: no encuentro la respuesta. Selecciona su texto con el ratón y vuelve a pulsar el marcador.');return}const d=JSON.stringify({motor:m,texto:r.texto,pregunta:r.pregunta,enlaces:r.enlaces,url:r.url});try{navigator.clipboard.writeText(d)}catch(e){}window.open(${JSON.stringify(destino)}+'#'+encodeURIComponent(d),'_blank')})()`;
  return 'javascript:' + encodeURIComponent(codigo);
}

/** Busca a qué pregunta corresponde una captura. */
export function emparejar(captura, preguntas, abiertas) {
  if (captura.id && preguntas.some((p) => p.id === captura.id)) return captura.id;
  const t = normalizarTexto(captura.pregunta);
  if (t.length > 8) {
    const exacta = preguntas.find((p) => normalizarTexto(p.texto) === t);
    if (exacta) return exacta.id;
    const parecida = preguntas.find((p) => {
      const q = normalizarTexto(p.texto);
      return q.length > 15 && (t.includes(q) || q.includes(t));
    });
    if (parecida) return parecida.id;
  }
  const abierta = abiertas.get(captura.motor);
  if (abierta && Date.now() - abierta.cuando < 30 * 60_000) return abierta.id;
  return null;
}

const ESTILO = `
:root{--fondo:#f7f7f5;--panel:#fff;--texto:#1d1d1b;--suave:#5f5f5a;--borde:#e3e2dd;--acento:#2f5bd3;--ok:#1f8a4c;--aviso:#b7791f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--fondo:#141414;--panel:#1d1d1d;--texto:#ecebe7;--suave:#a5a49e;--borde:#333;--acento:#7d9cf0;--ok:#4cc27e;--aviso:#e0a84a}}
:root[data-theme="dark"]{--fondo:#141414;--panel:#1d1d1d;--texto:#ecebe7;--suave:#a5a49e;--borde:#333;--acento:#7d9cf0;--ok:#4cc27e;--aviso:#e0a84a}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 10px}
.sub{color:var(--suave)}.panel{background:var(--panel);border:1px solid var(--borde);border-radius:10px;padding:14px 16px;margin:14px 0}
.marcador{display:inline-block;padding:8px 14px;border-radius:8px;background:var(--acento);color:#fff;text-decoration:none;font-weight:600;cursor:grab}
button{font:inherit;padding:5px 10px;border-radius:6px;border:1px solid var(--borde);background:var(--panel);color:var(--texto);cursor:pointer}
button.prim{background:var(--acento);border-color:var(--acento);color:#fff}
.tabla{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--borde);border-radius:10px;font-size:.9rem}
th,td{padding:7px 9px;border-bottom:1px solid var(--borde);text-align:left;vertical-align:middle}thead th{font-size:.8rem;color:var(--suave)}
td.c{text-align:center;white-space:nowrap}.ok{color:var(--ok);font-weight:600}.err{color:var(--aviso)}
.cat{font-size:.72rem;color:var(--suave);text-transform:uppercase}progress{width:100%;height:10px}
textarea,select{font:inherit;width:100%;padding:8px;border:1px solid var(--borde);border-radius:6px;background:var(--fondo);color:var(--texto)}
ol li{margin:4px 0}code{font-size:.85em}
`;

function paginaPanel(token, puerto, marcador, fecha, marca) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Captura gratuita GEO</title><style>${ESTILO}</style></head><body><main>
<h1>Captura semanal · ${esc(marca)}</h1>
<p class="sub">Semana del ${esc(fecha)} · versiones gratuitas de cada motor, en tu navegador · <span id="progreso"></span></p>
<progress id="barra" value="0" max="1"></progress>
<div class="panel">
<strong>Una sola vez:</strong> arrastra este botón a tu barra de marcadores →
<a class="marcador" href="${marcador}" onclick="event.preventDefault();alert('Arrástralo a la barra de marcadores (Ctrl/⌘+Mayús+B para mostrarla).')">📥 Guardar respuesta GEO</a>
<ol>
<li>Pulsa <strong>Abrir</strong> en una casilla: se abre la pregunta en ese motor (y se copia al portapapeles; en Claude y Gemini pégala con Ctrl/⌘+V y pulsa Enter).</li>
<li>Cuando termine de responder, pulsa el marcador <strong>📥 Guardar respuesta GEO</strong>. Se abre una pestañita que confirma y se cierra.</li>
<li>Al acabar, pulsa <strong>Generar informe</strong>.</li>
</ol>
<p class="sub">Para que se parezca a un comprador cualquiera: usa cuentas gratuitas, sin memoria ni instrucciones personalizadas, o el chat temporal/incógnito de cada motor. Si el marcador no encuentra la respuesta, selecciona su texto con el ratón y vuelve a pulsarlo.</p>
<button class="prim" id="informe">Generar informe</button> <span id="estadoInforme" class="sub"></span>
</div>
<div class="tabla"><table><thead><tr id="cabecera"><th>Pregunta</th></tr></thead><tbody id="filas"></tbody></table></div>
<h2>¿El marcador no funciona? Pega la respuesta a mano</h2>
<div class="panel">
<select id="mPregunta"></select><br><br><select id="mMotor"></select><br><br>
<textarea id="mTexto" rows="6" placeholder="Pega aquí la respuesta completa. Si copias con el botón «Copiar» del motor, suelen venir también los enlaces."></textarea><br><br>
<button class="prim" id="mGuardar">Guardar</button> <span id="mEstado" class="sub"></span>
</div>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
let estado;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function api(ruta,cuerpo){const r=await fetch(ruta,cuerpo?{method:'POST',headers:{'content-type':'application/json','x-geo-token':TOKEN},body:JSON.stringify(cuerpo)}:{});return r.json()}
async function cargar(){
  estado=await api('/api/estado');
  document.getElementById('cabecera').innerHTML='<th>Pregunta</th>'+estado.motores.map(m=>'<th class="c">'+esc(m.nombre)+'</th>').join('');
  let hechas=0;const total=estado.preguntas.length*estado.motores.length;
  document.getElementById('filas').innerHTML=estado.preguntas.map(p=>'<tr><td><span class="cat">'+esc(p.categoria)+'</span><br>'+esc(p.texto)+'</td>'+estado.motores.map(m=>{
    const h=estado.hechas[p.id+'|'+m.id];
    if(h&&!h.error){hechas++;return '<td class="c ok" title="'+esc(h.marcas)+'">✓ '+h.citas+' enl.</td>'}
    return '<td class="c">'+(h&&h.error?'<span class="err" title="'+esc(h.error)+'">⚠</span> ':'')+'<button data-id="'+p.id+'" data-m="'+m.id+'">Abrir</button></td>'}).join('')+'</tr>').join('');
  document.getElementById('progreso').textContent=hechas+' de '+total+' respuestas guardadas';
  const b=document.getElementById('barra');b.max=total||1;b.value=hechas;
  const opP=estado.preguntas.map(p=>'<option value="'+p.id+'">'+esc(p.texto)+'</option>').join('');
  const sp=document.getElementById('mPregunta');if(!sp.options.length)sp.innerHTML=opP;
  const sm=document.getElementById('mMotor');if(!sm.options.length)sm.innerHTML=estado.motores.map(m=>'<option value="'+m.id+'">'+esc(m.nombre)+'</option>').join('');
}
document.getElementById('filas').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  const p=estado.preguntas.find(x=>x.id===b.dataset.id);const m=estado.motores.find(x=>x.id===b.dataset.m);
  try{await navigator.clipboard.writeText(p.texto)}catch(_){}
  await api('/api/abierta',{id:p.id,motor:m.id});
  window.open(m.url.replace('{q}',encodeURIComponent(p.texto)),'_blank');
  b.textContent='Abierta…';
});
document.getElementById('informe').addEventListener('click',async()=>{
  const s=document.getElementById('estadoInforme');s.textContent='Generando…';
  const r=await api('/api/informe',{});s.innerHTML=r.ok?'Listo: <a href="/informe" target="_blank">abrir informe</a> · mención '+r.mencion+'% · huecos '+r.huecos:esc(r.error);
});
document.getElementById('mGuardar').addEventListener('click',async()=>{
  const texto=document.getElementById('mTexto').value.trim();const s=document.getElementById('mEstado');
  if(texto.length<20){s.textContent='Pega la respuesta completa.';return}
  const r=await api('/api/guardar',{id:document.getElementById('mPregunta').value,motor:document.getElementById('mMotor').value,texto,enlaces:[],fuente:'manual'});
  s.textContent=r.ok?'Guardada ✓ ('+r.citas+' enlaces, marcas: '+(r.marcas||'—')+')':r.error;if(r.ok){document.getElementById('mTexto').value='';cargar()}
});
cargar();setInterval(cargar,4000);
</script></body></html>`;
}

function paginaGuardar(token) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guardar respuesta</title><style>${ESTILO}</style></head><body><main>
<h1 id="titulo">Guardando…</h1><div id="detalle" class="panel"></div>
<div id="manual" hidden class="panel"><p>No llegaron los datos (tu navegador bloqueó el paso directo). Pulsa para leerlos del portapapeles:</p><button class="prim" id="leer">Pegar captura</button></div>
<div id="elegir" hidden class="panel"><p>¿A qué pregunta corresponde esta respuesta?</p><select id="opciones"></select><br><br><button class="prim" id="confirmar">Guardar</button></div>
</main><script>
const TOKEN=${JSON.stringify(token)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let datos=null;
async function enviar(extra){
  const r=await (await fetch('/api/guardar',{method:'POST',headers:{'content-type':'application/json','x-geo-token':TOKEN},body:JSON.stringify({...datos,...extra})})).json();
  if(r.ok){document.getElementById('titulo').textContent='Guardada ✓';document.getElementById('elegir').hidden=true;
    document.getElementById('detalle').innerHTML='<strong>'+esc(r.motor)+'</strong> · '+esc(r.pregunta)+'<br>'+r.citas+' enlaces · marcas: '+esc(r.marcas||'ninguna vigilada');
    setTimeout(()=>window.close(),1800);return}
  if(r.necesitaPregunta){document.getElementById('titulo').textContent='Falta un dato';const s=document.getElementById('opciones');
    s.innerHTML=r.opciones.map(o=>'<option value="'+o.id+'">'+esc(o.texto)+'</option>').join('');document.getElementById('elegir').hidden=false;return}
  document.getElementById('titulo').textContent='No se pudo guardar';document.getElementById('detalle').textContent=r.error||'Error';
}
document.getElementById('confirmar').onclick=()=>enviar({id:document.getElementById('opciones').value});
document.getElementById('leer').onclick=async()=>{try{datos=JSON.parse(await navigator.clipboard.readText());document.getElementById('manual').hidden=true;enviar({})}catch(e){alert('El portapapeles no contiene una captura. Vuelve a pulsar el marcador.')}};
try{datos=JSON.parse(decodeURIComponent(location.hash.slice(1)))}catch(e){}
history.replaceState(null,'',location.pathname);
if(datos)enviar({});else{document.getElementById('titulo').textContent='Captura';document.getElementById('manual').hidden=false}
</script></body></html>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function leerCuerpo(req, max = 2_000_000) {
  let datos = '';
  for await (const trozo of req) {
    datos += trozo;
    if (datos.length > max) throw new Error('Cuerpo demasiado grande');
  }
  return datos ? JSON.parse(datos) : {};
}

export function crearServidor(config, preguntas, { fecha, puerto = 4567, log = console.log } = {}) {
  const token = randomBytes(16).toString('hex');
  const marcas = marcasDeConfig(config);
  const motores = MOTORES.filter((m) => config.motores[m]?.activo && SITIOS[m]);
  const abiertas = new Map();
  const marcador = codigoMarcador(config, puerto);

  const responder = (res, codigo, cuerpo, tipo = 'application/json; charset=utf-8') => {
    res.writeHead(codigo, { 'content-type': tipo, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
  };

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${puerto}`);
      if (req.method === 'GET' && url.pathname === '/') return responder(res, 200, paginaPanel(token, puerto, marcador, fecha, config.marca.nombre), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/guardar') return responder(res, 200, paginaGuardar(token), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/informe') {
        const html = await readFile(path.join(dirEjecucion(config, fecha), 'informe.html'), 'utf8').catch(() => '<p>Genera primero el informe.</p>');
        return responder(res, 200, html, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/api/estado') {
        const hechas = {};
        for (const r of await leerRespuestas(config, fecha)) {
          hechas[`${r.id}|${r.motor}`] = r.error
            ? { error: r.error }
            : { citas: r.citas?.length || 0, marcas: (r.marcas || []).filter((x) => x.mencionada).map((x) => x.marca).join(', ') };
        }
        return responder(res, 200, {
          fecha,
          preguntas,
          motores: motores.map((m) => ({ id: m, nombre: NOMBRES_MOTOR[m], url: sitio(config, m).url })),
          hechas,
        });
      }
      if (req.method !== 'POST') return responder(res, 404, { error: 'No encontrado' });
      // Solo las páginas servidas aquí conocen el token: otras webs no pueden escribir datos.
      if (req.headers['x-geo-token'] !== token) return responder(res, 403, { error: 'Token no válido' });
      const cuerpo = await leerCuerpo(req);

      if (url.pathname === '/api/abierta') {
        abiertas.set(cuerpo.motor, { id: cuerpo.id, cuando: Date.now() });
        return responder(res, 200, { ok: true });
      }
      if (url.pathname === '/api/guardar') {
        if (!motores.includes(cuerpo.motor)) return responder(res, 400, { error: `Motor no activo: ${cuerpo.motor}` });
        if (!cuerpo.texto || cuerpo.texto.trim().length < 20) return responder(res, 400, { error: 'La respuesta está vacía.' });
        const id = emparejar(cuerpo, preguntas, abiertas);
        if (!id) {
          const hechas = new Set((await leerRespuestas(config, fecha)).filter((r) => !r.error && r.motor === cuerpo.motor).map((r) => r.id));
          return responder(res, 200, { necesitaPregunta: true, opciones: preguntas.filter((p) => !hechas.has(p.id)) });
        }
        const pregunta = preguntas.find((p) => p.id === id);
        const fuente = cuerpo.fuente === 'manual' ? 'manual' : 'marcador';
        const registro = construirRegistro(
          { fecha, pregunta, motor: cuerpo.motor, modelo: 'gratis-web', fuente },
          { texto: String(cuerpo.texto), citas: (cuerpo.enlaces || []).filter((e) => typeof e?.url === 'string').map((e) => ({ url: e.url, titulo: String(e.titulo || '') })) },
          marcas,
        );
        if (typeof cuerpo.url === 'string') registro.urlConversacion = cuerpo.url;
        await guardarRespuesta(config, fecha, registro);
        await escribirMetaSiFalta(config, fecha, { modo: 'asistido', preguntas: preguntas.length, motores: motores.map((m) => ({ motor: m, modelo: 'gratis-web' })) });
        abiertas.delete(cuerpo.motor);
        const vistas = registro.marcas.filter((x) => x.mencionada).map((x) => x.marca).join(', ');
        log(`  ✓ ${NOMBRES_MOTOR[cuerpo.motor]} · ${pregunta.texto.slice(0, 60)} · ${registro.citas.length} enlaces · ${vistas || 'sin marcas vigiladas'}`);
        return responder(res, 200, { ok: true, motor: NOMBRES_MOTOR[cuerpo.motor], pregunta: pregunta.texto, citas: registro.citas.length, marcas: vistas });
      }
      if (url.pathname === '/api/informe') {
        if (config.inspeccion.activo && !cuerpo.sinInspeccion) {
          await inspeccionar(config, fecha, await leerRespuestas(config, fecha), { log }).catch((e) => log(`⚠️  Inspección: ${e.message}`));
        }
        const { analisis } = await generarSalidas(config, fecha);
        return responder(res, 200, { ok: true, mencion: analisis.totales.mencion, huecos: analisis.huecos.length });
      }
      return responder(res, 404, { error: 'No encontrado' });
    } catch (err) {
      return responder(res, 500, { error: err.message });
    }
  });
  return { servidor, token, url: `http://127.0.0.1:${puerto}/` };
}
