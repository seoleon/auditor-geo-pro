// Función que se ejecuta DENTRO de la página del motor (Playwright o marcador del navegador).
// Debe ser autocontenida: no puede usar nada de fuera de su cuerpo.

export function extraerRespuesta(op) {
  const ultimo = (sel) => {
    if (!sel) return null;
    try {
      const n = document.querySelectorAll(sel);
      return n.length ? n[n.length - 1] : null;
    } catch {
      return null;
    }
  };
  const todos = (sel) => {
    if (!sel) return [];
    try {
      return [...document.querySelectorAll(sel)];
    } catch {
      return [];
    }
  };
  const desenvolver = (href) => {
    try {
      const u = new URL(href, location.href);
      if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url') {
        return u.searchParams.get('q') || u.searchParams.get('url') || null;
      }
      return u.href;
    } catch {
      return null;
    }
  };
  const interno = (url) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return true;
    }
    const h = u.hostname.replace(/^www\./, '');
    return (op.hosts || []).some((d) => {
      const [dom, ruta] = d.split('/');
      const coincide = h === dom || h.endsWith('.' + dom);
      return coincide && (!ruta || u.pathname.startsWith('/' + ruta));
    });
  };

  let nodo = ultimo(op.selRespuesta);
  const seleccion = op.usarSeleccion ? window.getSelection() : null;
  let ambitos = [];
  let texto = '';
  if (seleccion && seleccion.rangeCount && seleccion.toString().trim().length > 20) {
    texto = seleccion.toString().trim();
    const frag = document.createElement('div');
    frag.appendChild(seleccion.getRangeAt(0).cloneContents());
    ambitos = [frag];
    nodo = null;
  } else {
    texto = nodo ? (nodo.innerText || nodo.textContent || '').trim() : '';
    ambitos = [nodo, ...todos(op.selFuentes)].filter(Boolean);
  }

  const vistos = new Set();
  const enlaces = [];
  for (const amb of ambitos) {
    for (const a of amb.querySelectorAll('a[href]')) {
      const url = desenvolver(a.getAttribute('href'));
      if (!url || !/^https?:/i.test(url) || interno(url) || vistos.has(url)) continue;
      vistos.add(url);
      const titulo = (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim();
      enlaces.push({ url, titulo: titulo.slice(0, 200) });
    }
  }

  const pregunta = (ultimo(op.selPregunta)?.innerText || '').trim();
  let ocupado = false;
  try {
    ocupado = Boolean(op.selOcupado && document.querySelector(op.selOcupado));
  } catch {
    ocupado = false;
  }
  const visible = (document.body?.innerText || '').slice(0, 20000);
  let bloqueo = null;
  for (const b of op.bloqueos || []) {
    const re = new RegExp(b.fuente, b.flags);
    const enRespuesta = b.tipo === 'limite' && re.test(texto.slice(0, 400));
    if (enRespuesta || (!texto && re.test(visible))) {
      bloqueo = b.tipo;
      break;
    }
  }
  return { texto, pregunta, enlaces, ocupado, bloqueo, encontrado: Boolean(nodo) || Boolean(texto), url: location.href };
}

/** Opciones serializables (las RegExp no cruzan a la página) para `extraerRespuesta`. */
export function opcionesExtractor(s, { SEL_OCUPADO, BLOQUEOS }, extra = {}) {
  return {
    selRespuesta: s.selRespuesta,
    selPregunta: s.selPregunta,
    selFuentes: s.selFuentes,
    hosts: s.hosts,
    selOcupado: SEL_OCUPADO,
    bloqueos: BLOQUEOS.map((b) => ({ tipo: b.tipo, fuente: b.re.source, flags: b.re.flags })),
    ...extra,
  };
}
