// Motor de prueba: respuestas deterministas sin llamar a ninguna API (--simular).
import { createHash } from 'node:crypto';

export function crearSimulado(motor, config) {
  const marcas = [config.marca, ...(config.competidores || [])].filter(Boolean);
  return async function preguntar(pregunta) {
    const h = createHash('sha1').update(motor + pregunta).digest();
    const elegidas = marcas.filter((_, i) => h[i % h.length] % 3 !== 0);
    const orden = elegidas.sort((a, b) => h[a.nombre.length % h.length] - h[b.nombre.length % h.length]);
    const texto = orden.length
      ? `Para «${pregunta}» las opciones más recomendadas son ${orden.map((m) => `**${m.nombre}**`).join(', ')}.`
      : `No hay una respuesta clara para «${pregunta}».`;
    const citas = orden
      .filter((m) => m.dominios?.length)
      .map((m, i) => ({ url: `https://${m.dominios[0]}/${i % 2 ? 'blog/guia' : 'precios'}`, titulo: m.nombre }));
    if (h[0] % 2) citas.push({ url: 'https://es.wikipedia.org/wiki/Comparativa', titulo: 'Wikipedia' });
    return { texto, citas, modelo: `simulado-${motor}` };
  };
}
