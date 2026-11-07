// Lista de guías (src/pages/guias/*.md) para enlazarlas desde otras páginas.
type Front = { titulo: string; descripcion: string; actualizado: string; orden?: number; foto?: string };
const modulos = import.meta.glob<{ frontmatter: Front; url: string }>('../pages/guias/*.md', { eager: true });

export const guias = Object.values(modulos)
  .map((m) => ({ ...m.frontmatter, ruta: m.url.endsWith('/') ? m.url : `${m.url}/` }))
  .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
