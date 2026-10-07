// Réplicas mínimas del DOM de cada motor para probar el modo navegador sin conexión.
import http from 'node:http';

const pagina = (cuerpo) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${cuerpo}</body></html>`;

const RESPUESTA = [
  'Las opciones más usadas son ',
  '<a href="https://holded.com/precios?utm_source=chatgpt.com">Holded</a> y ',
  '<strong>Facturalia</strong>, que destaca por precio. ',
  'Más detalles en <a href="https://chatgpt.com/share/abc">esta conversación</a> ',
  'y en <a href="https://www.google.com/url?q=https://getquipu.com/blog&amp;sa=U">Quipu</a>.',
];

// Escribe la respuesta en trozos, con botón de "Stop" mientras genera.
const STREAM = (selContenedor, claseRespuesta, atributos, interno = 'https://chatgpt.com') => `
function responder(pregunta){
  const cont=document.querySelector('${selContenedor}');
  const u=document.createElement('div');u.setAttribute('data-message-author-role','user');u.setAttribute('data-testid','user-message');u.textContent=pregunta;cont.appendChild(u);
  const r=document.createElement('div');r.className='${claseRespuesta}';${atributos}cont.appendChild(r);
  const stop=document.createElement('button');stop.setAttribute('aria-label','Stop generating');document.body.appendChild(stop);
  const trozos=${JSON.stringify(RESPUESTA).replace('https://chatgpt.com', interno)};let i=0;
  const t=setInterval(()=>{r.innerHTML+=trozos[i++];if(i>=trozos.length){clearInterval(t);stop.remove()}},250);
}`;

export function servirSitiosFalsos() {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (url.pathname === '/chatgpt') {
      // Envío automático por ?q=, como chatgpt.com
      return res.end(pagina(`<main id="hilo"></main><script>${STREAM('#hilo', 'markdown', "r.setAttribute('data-message-author-role','assistant');")}
        const q=new URLSearchParams(location.search).get('q');if(q)setTimeout(()=>responder(q),300);</script>`));
    }
    if (url.pathname === '/claude') {
      // Hay que escribir la pregunta y pulsar Enter, como claude.ai
      return res.end(pagina(`<div id="hilo"></div><div contenteditable="true" id="editor" style="min-height:40px;border:1px solid"></div>
        <script>${STREAM('#hilo', 'font-claude-response', '', 'https://claude.ai')}
        document.getElementById('editor').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const t=e.target.innerText.trim();e.target.innerText='';if(t)responder(t)}});</script>`));
    }
    if (url.pathname === '/google') {
      return res.end(pagina(`<div data-subtree="aimc"><p>Respuesta de AI Mode: Quipu y Holded son populares en España.</p>
        <a href="https://www.google.com/url?q=https://getquipu.com/blog&amp;sa=U">Quipu blog</a>
        <a href="https://support.google.com/ayuda">Ayuda</a></div>`));
    }
    if (url.pathname === '/captcha') return res.end(pagina('<h1>Verify you are human</h1>'));
    res.end(pagina('<p>?</p>'));
  });
  return new Promise((r) => servidor.listen(0, '127.0.0.1', () => r({ servidor, puerto: servidor.address().port })));
}
