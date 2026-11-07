import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cliente from './cliente.json' with { type: 'json' };

export default defineConfig({
  site: cliente.negocio.dominio,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (url) => !/\/(aviso-legal|privacidad)\/$/.test(url),
    }),
  ],
});
