// Banco de fotos de la web. Los archivos van en src/assets/fotos/ y sus datos
// (alt, crédito, licencia) en src/data/fotos.json. Astro las optimiza en el build
// (AVIF/WebP, varios tamaños, width/height explícitos).
import type { ImageMetadata } from 'astro';
import datos from '../data/fotos.json';

export type ClaveFoto = keyof typeof datos;
export type Foto = (typeof datos)[ClaveFoto] & { clave: string; src: ImageMetadata };

const archivos = import.meta.glob<{ default: ImageMetadata }>('../assets/fotos/*.{jpg,jpeg,png,webp}', { eager: true });

export function foto(clave: string): Foto {
  const d = (datos as Record<string, (typeof datos)[ClaveFoto]>)[clave];
  if (!d) throw new Error(`Foto "${clave}" no está en src/data/fotos.json`);
  const mod = archivos[`../assets/fotos/${d.archivo}`];
  if (!mod) throw new Error(`Falta el archivo src/assets/fotos/${d.archivo}`);
  return { ...d, clave, src: mod.default };
}

export const todasLasFotos = () => Object.keys(datos).map(foto);
