import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cliente from './cliente.json' with { type: 'json' };

const hoy = new Date().toISOString();

export default defineConfig({
  site: cliente.negocio.dominio,
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [
    sitemap({
      filter: (url) => !/\/(aviso-legal|privacidad|creditos-fotos)\/$/.test(url),
      serialize: (item) => ({ ...item, lastmod: hoy }),
    }),
  ],
});
