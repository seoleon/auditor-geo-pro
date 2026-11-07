// Única fuente de datos de la web. Todo sale de cliente.json:
// para un cliente nuevo se cambia ese archivo, no las plantillas.
import cliente from '../../cliente.json';

export type Servicio = (typeof cliente.servicios)[number];
export type Zona = (typeof cliente.zonas)[number];
export type Faq = { p: string; r: string };

export const { negocio, marca, textos, diferenciales, proceso, servicios, zonas } = cliente;
export const esDemo = cliente.demo === true;

export const url = {
  inicio: '/',
  servicio: (s: Servicio) => `/servicios/${s.slug}/`,
  landing: (s: Servicio, z: Zona) => `/${s.slug}/${z.slug}/`,
  zonas: '/zonas/',
  contacto: '/contacto/',
  presupuesto: '/presupuesto/',
  guias: '/guias/',
  comoFunciona: '/como-funciona/',
};

export const servicioPorSlug = (slug: string) => {
  const s = servicios.find((x) => x.slug === slug);
  if (!s) throw new Error(`cliente.json: el servicio "${slug}" no existe`);
  return s;
};

export const serviciosConLanding = cliente.landings.servicios.map(servicioPorSlug);
export const tieneLanding = (s: Servicio) => serviciosConLanding.some((x) => x.slug === s.slug);

export const absoluta = (ruta: string) => new URL(ruta, negocio.dominio).href;
export const telHref = `tel:${negocio.telefono}`;
export const whatsappHref = (texto: string) =>
  negocio.whatsapp ? `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(texto)}` : '';

export const listaNatural = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

// ---------- Schema.org (JSON-LD) ----------

const idNegocio = absoluta('/#negocio');

// Modelo portal: la web es un intermediario. Se declara como Organization (sin dirección
// física ni LocalBusiness) y aparece como "broker" de los servicios, no como quien los presta.
export function schemaNegocio() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': idNegocio,
    name: negocio.nombre,
    description: negocio.descripcion,
    url: absoluta('/'),
    email: negocio.email,
    areaServed: zonas.map((z) => ({ '@type': 'City', name: z.nombre })),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: negocio.telefono,
      areaServed: 'ES',
      availableLanguage: 'es',
      hoursAvailable: negocio.horario.map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.dias,
        opens: h.abre,
        closes: h.cierra,
      })),
    },
    ...(negocio.redes.length ? { sameAs: negocio.redes } : {}),
  };
}

export function schemaServicio(s: Servicio, z?: Zona) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: z ? `${s.nombre} en ${z.nombre}` : s.nombre,
    serviceType: s.nombre,
    description: s.resumen,
    broker: { '@id': idNegocio },
    areaServed: z
      ? { '@type': 'City', name: z.nombre }
      : zonas.map((x) => ({ '@type': 'City', name: x.nombre })),
    url: absoluta(z ? url.landing(s, z) : url.servicio(s)),
  };
}

export function schemaArticulo(a: { titulo: string; descripcion: string; ruta: string; publicado: string; actualizado: string; imagen?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.titulo,
    description: a.descripcion,
    url: absoluta(a.ruta),
    ...(a.imagen ? { image: a.imagen } : {}),
    mainEntityOfPage: absoluta(a.ruta),
    datePublished: a.publicado,
    dateModified: a.actualizado,
    inLanguage: 'es-ES',
    author: { '@id': idNegocio },
    publisher: { '@id': idNegocio },
  };
}

export function schemaFaq(faq: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.p,
      acceptedAnswer: { '@type': 'Answer', text: f.r },
    })),
  };
}

export type Miga = { nombre: string; ruta: string };

export function schemaMigas(migas: Miga[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: migas.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nombre,
      item: absoluta(m.ruta),
    })),
  };
}
