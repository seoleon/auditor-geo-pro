#!/usr/bin/env node
// Genera ilustraciones propias (sin licencias de terceros) para cada hueco de imagen.
// Uso: node scripts/ilustraciones.mjs  → escribe src/assets/fotos/*.jpg
// Sustitúyelas por fotos reales con el mismo nombre de archivo cuando las tengas.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const destino = fileURLToPath(new URL('../src/assets/fotos/', import.meta.url));
mkdirSync(destino, { recursive: true });
const W = 1600, H = 1200;

const azulejos = (x, y, w, h, t, c1, c2, junta = '#ffffff') => {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${junta}"/>`;
  for (let i = 0, fila = 0; i < h; i += t, fila++)
    for (let j = 0; j < w; j += t * 2) {
      const off = fila % 2 ? t : 0;
      s += `<rect x="${x + j + off - (off ? t * 2 : 0) + 3}" y="${y + i + 3}" width="${t * 2 - 6}" height="${t - 6}" fill="${(fila + j / t) % 3 ? c1 : c2}"/>`;
    }
  return `<g clip-path="url(#c${x}${y})"><clipPath id="c${x}${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>${s}</g>`;
};
const suelo = (c1, c2) => `<rect x="0" y="930" width="${W}" height="270" fill="${c1}"/>` +
  Array.from({ length: 9 }, (_, i) => `<line x1="${i * 200}" y1="930" x2="${i * 200 - 160}" y2="1200" stroke="${c2}" stroke-width="4"/>`).join('') +
  `<line x1="0" y1="1040" x2="${W}" y2="1040" stroke="${c2}" stroke-width="4"/>`;
const luz = `<defs><linearGradient id="luz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
const lavabo = (x, mueble = '#8a6a4f') => `
  <rect x="${x}" y="640" width="380" height="170" rx="12" fill="${mueble}"/>
  <rect x="${x + 20}" y="665" width="160" height="120" rx="8" fill="${mueble}" stroke="#00000022" stroke-width="4"/>
  <rect x="${x + 200}" y="665" width="160" height="120" rx="8" fill="${mueble}" stroke="#00000022" stroke-width="4"/>
  <rect x="${x - 10}" y="615" width="400" height="34" rx="10" fill="#f4f4f2"/>
  <ellipse cx="${x + 190}" cy="622" rx="120" ry="16" fill="#dcdcd8"/>
  <path d="M${x + 190} 615 v-60 h50 v14" stroke="#9aa3ab" stroke-width="12" fill="none" stroke-linecap="round"/>
  <rect x="${x + 30}" y="300" width="320" height="260" rx="140" fill="#cfe3ea" stroke="#9aa3ab" stroke-width="8"/>
  <path d="M${x + 80} 360 l60 -40" stroke="#ffffff" stroke-width="10" opacity=".7"/>`;
const inodoro = (x) => `
  <rect x="${x}" y="560" width="150" height="190" rx="18" fill="#f4f4f2" stroke="#d7d7d2" stroke-width="4"/>
  <path d="M${x - 20} 760 h190 a20 20 0 0 1 0 40 h-30 l-20 110 h-90 l-20 -110 h-30 a20 20 0 0 1 0 -40z" fill="#f4f4f2" stroke="#d7d7d2" stroke-width="4"/>`;
const ducha = (x, w, conPlato = true) => `
  <path d="M${x + w - 90} 230 v-40 h-140" stroke="#9aa3ab" stroke-width="14" fill="none" stroke-linecap="round"/>
  <ellipse cx="${x + w - 230}" cy="200" rx="70" ry="16" fill="#9aa3ab"/>
  ${Array.from({ length: 7 }, (_, i) => `<line x1="${x + w - 270 + i * 14}" y1="225" x2="${x + w - 300 + i * 20}" y2="${520 + (i % 3) * 40}" stroke="#bcdbe8" stroke-width="4" stroke-dasharray="14 18"/>`).join('')}
  <rect x="${x + w - 110}" y="470" width="70" height="40" rx="8" fill="#9aa3ab"/>
  ${conPlato ? `<rect x="${x}" y="905" width="${w}" height="30" rx="6" fill="#e9e7e2"/><rect x="${x + w / 2 - 80}" y="915" width="160" height="8" rx="4" fill="#9aa3ab"/>` : `<rect x="${x + 30}" y="926" width="${w - 60}" height="8" rx="4" fill="#9aa3ab"/>`}
  <rect x="${x - 10}" y="140" width="14" height="${conPlato ? 770 : 790}" fill="#c9d3d9"/>
  <rect x="${x + 4}" y="140" width="${w * 0.55}" height="${conPlato ? 765 : 790}" fill="#d9eef5" opacity=".35" stroke="#c9d3d9" stroke-width="6"/>`;
const planta = (x, y) => `<rect x="${x}" y="${y}" width="70" height="80" rx="10" fill="#c97b4a"/>
  <path d="M${x + 35} ${y} c-50 -40 -60 -110 -20 -150 M${x + 35} ${y} c20 -60 60 -90 90 -100 M${x + 35} ${y} c-10 -60 10 -120 30 -150" stroke="#4f7b52" stroke-width="16" fill="none" stroke-linecap="round"/>`;
const barra = (x, y, l, vertical = false) => vertical
  ? `<rect x="${x}" y="${y}" width="22" height="${l}" rx="11" fill="#b8c0c6" stroke="#8b949b" stroke-width="3"/>`
  : `<rect x="${x}" y="${y}" width="${l}" height="22" rx="11" fill="#b8c0c6" stroke="#8b949b" stroke-width="3"/>`;

const escenas = {
  'portada-bano-reformado-leon': () => `${luz}
    <rect width="${W}" height="${H}" fill="#e9e4dc"/>
    ${azulejos(0, 0, 760, 930, 90, '#dfe9ec', '#d3e1e6')}
    ${ducha(80, 620)}
    ${lavabo(900)}
    ${planta(1380, 850)}
    ${suelo('#b9a48c', '#a8937b')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'reforma-integral-bano-terminada': () => `${luz}
    <rect width="${W}" height="${H}" fill="#f1ece5"/>
    ${azulejos(0, 0, W, 930, 110, '#ece7df', '#e3ddd3', '#f7f4ef')}
    ${lavabo(200, '#5e4a3b')}
    ${inodoro(760)}
    ${ducha(1020, 560)}
    ${suelo('#7d7a76', '#6b6864')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'plato-ducha-extraplano-mampara': () => `${luz}
    <rect width="${W}" height="${H}" fill="#e3e8ea"/>
    ${azulejos(0, 0, W, 930, 120, '#cfd6da', '#c4ccd1', '#e8ecee')}
    ${ducha(260, 1080)}
    <rect x="640" y="640" width="160" height="70" rx="8" fill="#ffffff" stroke="#c9d3d9" stroke-width="4"/>
    ${suelo('#9aa0a4', '#8b9195')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'bano-adaptado-barras-apoyo': () => `${luz}
    <rect width="${W}" height="${H}" fill="#eef0ea"/>
    ${azulejos(0, 0, W, 930, 100, '#e4e9df', '#dae1d4', '#f4f6f1')}
    ${ducha(90, 640, false)}
    <rect x="520" y="560" width="160" height="22" rx="6" fill="#8a6a4f"/><rect x="520" y="560" width="22" height="120" fill="#b8c0c6"/>
    ${barra(150, 520, 300)}${barra(110, 360, 260, true)}
    ${inodoro(1000)}
    ${barra(900, 620, 220)}${barra(1200, 620, 200)}
    ${suelo('#c9cfc2', '#b9bfb2')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'aseo-pequeno-reformado': () => `${luz}
    <rect width="${W}" height="${H}" fill="#f3efe8"/>
    ${azulejos(0, 0, W, 930, 80, '#e9eef0', '#dde6ea')}
    <rect x="250" y="160" width="260" height="770" rx="6" fill="#d9c2a5" stroke="#bfa585" stroke-width="6"/><rect x="460" y="520" width="16" height="80" rx="8" fill="#8b949b"/>
    ${lavabo(640, '#ffffff')}
    ${inodoro(1180)}
    ${suelo('#b9a48c', '#a8937b')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'alicatado-pared-bano-obra': () => `
    <rect width="${W}" height="${H}" fill="#d9d2c6"/>
    ${azulejos(0, 0, W, 620, 120, '#f2f2f0', '#e8e8e5', '#cfcac2')}
    <rect x="0" y="620" width="${W}" height="580" fill="#b8ada0"/>
    <path d="M0 620 h${W}" stroke="#9c9184" stroke-width="6"/>
    <rect x="300" y="760" width="420" height="40" rx="6" fill="#6c757d"/><path d="M330 760 l30 -40 h300 l30 40z" fill="#adb5bd"/>
    <rect x="980" y="700" width="260" height="190" rx="14" fill="#8a8f94"/><rect x="1000" y="680" width="220" height="30" rx="8" fill="#5a6066"/>
    <rect x="1290" y="820" width="180" height="130" rx="8" fill="#e8e8e5" stroke="#cfcac2" stroke-width="6"/>
    <path d="M760 580 l120 -60 l40 30 l-120 60z" fill="#f2f2f0" stroke="#bdb6ac" stroke-width="5"/>`,
  'lavabo-mueble-espejo-bano': () => `${luz}
    <rect width="${W}" height="${H}" fill="#e8e2d8"/>
    ${azulejos(0, 0, W, 930, 140, '#ece6dc', '#e2dbcf', '#f5f1ea')}
    ${lavabo(600, '#3f5e5a')}
    ${planta(1180, 850)}
    <rect x="300" y="420" width="18" height="160" rx="9" fill="#9aa3ab"/><rect x="250" y="470" width="120" height="14" rx="7" fill="#9aa3ab"/>
    ${suelo('#a69886', '#958775')}
    <rect width="${W}" height="${H}" fill="url(#luz)"/>`,
  'reforma-bano-en-obra': () => `
    <rect width="${W}" height="${H}" fill="#cfc7bb"/>
    <rect x="0" y="0" width="${W}" height="930" fill="#bfb6a8"/>
    ${azulejos(900, 0, 700, 520, 100, '#f2f2f0', '#e8e8e5', '#cfcac2')}
    <path d="M180 0 v930 M260 380 h520" stroke="#b87333" stroke-width="18" fill="none"/>
    <path d="M520 0 v400" stroke="#e0e0e0" stroke-width="24"/>
    <rect x="380" y="560" width="70" height="70" rx="8" fill="#e9e7e2" stroke="#8b949b" stroke-width="4"/>
    ${suelo('#9e9486', '#8d8375')}
    <rect x="120" y="820" width="320" height="200" rx="12" fill="#d0812f"/><rect x="150" y="790" width="260" height="40" rx="8" fill="#a8641f"/>
    <rect x="1100" y="760" width="40" height="260" fill="#c69c6d"/><rect x="1240" y="760" width="40" height="260" fill="#c69c6d"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="1090" y="${790 + i * 40}" width="200" height="14" fill="#c69c6d"/>`).join('')}`,
};

for (const [nombre, svg] of Object.entries(escenas)) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg()}</svg>`;
  await sharp(Buffer.from(doc)).jpeg({ quality: 88, mozjpeg: true }).toFile(`${destino}${nombre}.jpg`);
  console.log('✓', nombre);
}
