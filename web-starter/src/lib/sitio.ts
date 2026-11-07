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

export function schemaNegocio() {
  const d = negocio.direccion;
  return {
    '@context': 'https://schema.org',
    '@type': negocio.tipoSchema,
    '@id': idNegocio,
    name: negocio.nombre,
    description: negocio.descripcion,
    url: absoluta('/'),
    telephone: negocio.telefono,
    email: negocio.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: d.calle,
      postalCode: d.cp,
      addressLocality: d.ciudad,
      addressRegion: d.provincia,
      addressCountry: d.pais,
    },
    geo: { '@type': 'GeoCoordinates', latitude: negocio.geo.lat, longitude: negocio.geo.lng },
    openingHoursSpecification: negocio.horario.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.dias,
      opens: h.abre,
      closes: h.cierra,
    })),
    areaServed: zonas.map((z) => ({ '@type': 'City', name: z.nombre })),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Servicios',
      itemListElement: servicios.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.nombre, url: absoluta(url.servicio(s)) },
      })),
    },
    ...(negocio.fichaGoogle || negocio.redes.length
      ? { sameAs: [negocio.fichaGoogle, ...negocio.redes].filter(Boolean) }
      : {}),
  };
}

export function schemaServicio(s: Servicio, z?: Zona) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: z ? `${s.nombre} en ${z.nombre}` : s.nombre,
    serviceType: s.nombre,
    description: s.resumen,
    provider: { '@id': idNegocio },
    areaServed: z
      ? { '@type': 'City', name: z.nombre }
      : zonas.map((x) => ({ '@type': 'City', name: x.nombre })),
    url: absoluta(z ? url.landing(s, z) : url.servicio(s)),
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
