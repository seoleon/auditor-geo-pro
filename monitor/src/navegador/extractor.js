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

  // Plan B si la web cambió de diseño: el bloque de texto más denso de la página
  // (la respuesta suele ser el mayor bloque de prosa). Se marca como `heuristico`.
  const bloqueMayor = () => {
    const raiz = document.querySelector('main, [role="main"]') || document.body;
    if (!raiz) return null;
    let mejor = null;
    let mejorLong = 0;
    for (const el of raiz.querySelectorAll('div, article, section, p')) {
      if (el.closest('nav, header, footer, aside, form, [contenteditable="true"]')) continue;
      const largo = (el.innerText || '').trim().length;
      if (largo < 120) continue;
      // Preferimos el contenedor más pequeño que concentra casi todo su texto en un único hijo.
      const hijoMayor = Math.max(0, ...[...el.children].map((c) => (c.innerText || '').length));
      const denso = hijoMayor < largo * 0.8;
      if (denso && largo > mejorLong) {
        mejor = el;
        mejorLong = largo;
      }
    }
    return mejor;
  };

  let nodo = ultimo(op.selRespuesta);
  let heuristico = false;
  if (!nodo && op.heuristica) {
    nodo = bloqueMayor();
    heuristico = Boolean(nodo);
  }
  const seleccion = op.usarSeleccion ? window.getSelection() : null;
  let ambitos = [];
  let texto = '';
  if (seleccion && seleccion.rangeCount && seleccion.toString().trim().length > 20) {
    texto = seleccion.toString().trim();
    const frag = document.createElement('div');
    frag.appendChild(seleccion.getRangeAt(0).cloneContents());
    ambitos = [frag];
    nodo = null;
    heuristico = false;
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
  // Un aviso de captcha o de cupo agotado solo cuenta si NO hay respuesta localizada por su
  // selector: una respuesta que hable de "límites de uso" de un producto no es un bloqueo.
  // Con el plan B sí se comprueba, porque el bloque elegido podría ser el propio aviso.
  const visible = (document.body?.innerText || '').slice(0, 20000);
  let bloqueo = null;
  if (!texto || heuristico) {
    for (const b of op.bloqueos || []) {
      const re = new RegExp(b.fuente, b.flags);
      if (re.test(heuristico ? texto : visible)) {
        bloqueo = b.tipo;
        break;
      }
    }
  }
  return { texto, pregunta, enlaces, ocupado, bloqueo, heuristico, encontrado: Boolean(nodo) || Boolean(texto), url: location.href };
}

/** Opciones serializables (las RegExp no cruzan a la página) para `extraerRespuesta`. */
export function opcionesExtractor(s, { SEL_OCUPADO, BLOQUEOS }, extra = {}) {
  return {
    selRespuesta: s.selRespuesta,
    selPregunta: s.selPregunta,
    selFuentes: s.selFuentes,
    hosts: s.hosts,
    heuristica: s.heuristica !== false,
    selOcupado: SEL_OCUPADO,
    bloqueos: BLOQUEOS.map((b) => ({ tipo: b.tipo, fuente: b.re.source, flags: b.re.flags })),
    ...extra,
  };
}
