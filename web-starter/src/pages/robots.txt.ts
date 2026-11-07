import type { APIRoute } from 'astro';
import cliente from '../../cliente.json';

export const GET: APIRoute = ({ site }) => {
  const lineas = cliente.demo
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap-index.xml', site).href}`];
  return new Response(lineas.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
