// Genera el llms.txt y el marcado de esquema (JSON-LD) de tu propia web
// a partir de config.json y de las preguntas reales de compradores.

/**
 * llms.txt según la propuesta llmstxt.org: H1 con el nombre, cita con el resumen,
 * y secciones H2 con listas de enlaces `- [título](url): descripción`.
 */
export function generarLlmsTxt(config, preguntas = []) {
  const m = config.marca;
  const lineas = [`# ${m.nombre}`, ''];
  if (m.descripcion) lineas.push(`> ${m.descripcion.replace(/\s+/g, ' ').trim()}`, '');
  if (m.detalles) lineas.push(m.detalles.trim(), '');

  const paginas = config.paginas || [];
  const secciones = new Map();
  for (const p of paginas) {
    const s = p.seccion || 'Páginas principales';
    if (!secciones.has(s)) secciones.set(s, []);
    secciones.get(s).push(p);
  }
  // "Optional" es la sección que llmstxt.org reserva para contenido prescindible: va al final.
  const orden = [...secciones.keys()].sort((a, b) => (a === 'Optional') - (b === 'Optional'));
  for (const s of orden) {
    lineas.push(`## ${s}`, '');
    for (const p of secciones.get(s)) {
      const desc = p.descripcion ? `: ${p.descripcion.replace(/\s+/g, ' ').trim()}` : '';
      lineas.push(`- [${p.titulo || p.url}](${p.url})${desc}`);
    }
    lineas.push('');
  }

  // Preguntas que esas páginas responden: ayuda a los modelos a mapear intención → URL.
  const porCategoria = new Map();
  for (const q of preguntas) {
    const pagina = paginas.find((p) => (p.categorias || []).includes(q.categoria));
    if (!pagina) continue;
    if (!porCategoria.has(pagina.url)) porCategoria.set(pagina.url, { pagina, preguntas: [] });
    porCategoria.get(pagina.url).preguntas.push(q.texto);
  }
  if (porCategoria.size) {
    lineas.push('## Preguntas frecuentes de compradores', '');
    for (const { pagina, preguntas: qs } of porCategoria.values()) {
      for (const q of qs.slice(0, 8)) lineas.push(`- [${q}](${pagina.url})`);
    }
    lineas.push('');
  }
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** JSON-LD con Organization + WebSite y, si hay respuestas en config.faq, FAQPage. */
export function generarEsquema(config) {
  const m = config.marca;
  const url = (m.url || (m.dominios?.[0] ? `https://${m.dominios[0]}` : '')).replace(/\/$/, '');
  const org = {
    '@type': 'Organization',
    '@id': `${url}/#organization`,
    name: m.nombre,
    url,
  };
  if (m.alias?.length) org.alternateName = m.alias;
  if (m.descripcion) org.description = m.descripcion;
  if (m.logo) org.logo = m.logo;
  if (m.sameAs?.length) org.sameAs = m.sameAs;

  const grafo = [
    org,
    { '@type': 'WebSite', '@id': `${url}/#website`, url, name: m.nombre, publisher: { '@id': `${url}/#organization` }, inLanguage: config.idioma },
  ];
  const faq = (config.faq || []).filter((f) => f.pregunta && f.respuesta);
  if (faq.length) {
    grafo.push({
      '@type': 'FAQPage',
      ...(config.faqUrl ? { '@id': `${config.faqUrl}#faq`, url: config.faqUrl } : {}),
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': grafo };
}

export function etiquetaScript(esquema) {
  const json = JSON.stringify(esquema, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>\n`;
}
