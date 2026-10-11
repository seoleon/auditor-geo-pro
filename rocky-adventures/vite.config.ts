import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Rocky Adventures — configuración de Vite.
// base relativa para que el build funcione abriéndolo desde cualquier subcarpeta (p. ej. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('rapier')) return 'rapier'
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  server: { host: true },
})
