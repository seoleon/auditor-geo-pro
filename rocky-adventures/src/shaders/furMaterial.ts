// Material de pelo corto atigrado (brindle) para Rocky y los demás bulldogs.
// Base PBR de Three.js (MeshPhysicalMaterial con "sheen" para el brillo aterciopelado del pelo corto)
// ampliada con: patrón atigrado procedural anclado a la pose de reposo, máscara negra del hocico,
// trufa de cuero, uñas, interior rosado de las orejas, micro-relieve de pelo y capas ("shells")
// opcionales para dar volumen al contorno.

import * as THREE from 'three'
import { NOISE_GLSL } from './noise.glsl'

export interface CoatPalette {
  /** Color del pelo claro entre las rayas (en sRGB). */
  base: string
  /** Color de las rayas atigradas. */
  stripe: string
  /** Mancha del pecho. */
  white: string
  /** Máscara del hocico. */
  mask: string
  /** 0 = sin rayas, 1 = casi negro. */
  brindle: number
  /** Intensidad de la mancha blanca del pecho (0-1). */
  whiteAmount: number
  /** Manchas blancas grandes (bulldog "pied"), 0-1. */
  pied: number
}

export const ROCKY_COAT: CoatPalette = {
  base: '#6a4127',
  stripe: '#100a06',
  white: '#e8ddd0',
  mask: '#0b0806',
  brindle: 0.66,
  whiteAmount: 0.55,
  pied: 0,
}

const FUR_FUNCS = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uBase;
uniform vec3 uStripe;
uniform vec3 uWhite;
uniform vec3 uMaskCol;
uniform float uBrindle;
uniform float uWhiteAmt;
uniform float uPied;
varying vec3 vRest;
varying vec4 vMask;
varying vec4 vMask2;
float rkPx = 0.001;
float rkDark = 0.0; // huella del píxel en metros (para filtrar el detalle fino)

// Color del manto en un punto de la pose de reposo.
vec3 rk_coat(vec3 p, out float rough, out float sheenAmt, out float furAmt) {
  float warp = rk_fbm(p * vec3(13.0, 9.0, 13.0));
  float warp2 = rk_fbm(p * vec3(31.0, 12.0, 31.0) + 5.0);
  // Rayas finas e irregulares que bajan del lomo al vientre (atigrado real, no "tigre")
  float band = p.z * 290.0 + abs(p.x) * 50.0 + warp * 18.0 + warp2 * 8.0;
  // en la cabeza siguen el contorno del cráneo; en las patas son casi horizontales
  float headW = smoothstep(0.34, 0.38, p.y) * smoothstep(0.17, 0.21, p.z);
  float legW = 1.0 - smoothstep(0.12, 0.17, p.y);
  band = mix(band, p.y * 240.0 + abs(p.x) * 90.0 + warp * 10.0, headW);
  band = mix(band, p.y * 260.0 + warp * 9.0, legW);
  float st = 0.5 + 0.5 * sin(band);
  st = mix(st, 0.75, headW * 0.45); // en la cara el atigrado es más oscuro y difuso
  float st2 = 0.5 + 0.5 * sin(band * 0.43 + warp2 * 9.0);
  float thr = 1.0 - uBrindle + (rk_vnoise(p * 23.0) - 0.5) * 0.45;
  float dark = smoothstep(thr - 0.28, thr + 0.28, mix(st, st2, 0.4));
  // las rayas se rompen en trazos cortos, como mechones
  dark *= 0.55 + 0.45 * smoothstep(0.25, 0.6, rk_vnoise(p * vec3(60.0, 18.0, 60.0)));
  // zonas más oscuras en grandes manchas (el atigrado nunca es uniforme)
  dark = clamp(dark * 0.85 + 0.12 + (rk_fbm(p * 6.0) - 0.45) * 0.5, 0.0, 1.0);
  // el detalle fino se desvanece cuando una hebra ocupa menos de un píxel (sin "ruido" ni aliasing)
  float fineA = 1.0 - smoothstep(0.0008, 0.003, rkPx);
  float fineB = 1.0 - smoothstep(0.0004, 0.0018, rkPx);
  float streak = mix(0.5, rk_vnoise(vec3(p.x * 300.0, p.y * 300.0, p.z * 70.0)), fineA);
  float streak2 = mix(0.5, rk_vnoise(vec3(p.x * 520.0, p.y * 140.0, p.z * 520.0)), fineB);
  vec3 light = uBase * (0.85 + 0.3 * streak) * (0.95 + 0.1 * streak2);
  // reflejos cálidos rojizos en las zonas claras
  light = mix(light, light * vec3(1.18, 0.92, 0.75), rk_vnoise(p * 9.0));
  vec3 darkC = uStripe * (0.8 + 0.5 * streak);
  // mezcla de pelos claros y oscuros incluso dentro de cada raya
  vec3 c = mix(light, darkC, clamp(dark + (streak - 0.5) * 0.35, 0.0, 1.0));
  rkDark = dark;
  // vientre algo más claro y lomo algo más oscuro
  c = mix(c, c * 1.25 + vec3(0.02, 0.015, 0.01), vMask2.y * 0.5);
  c *= mix(1.0, 0.82, smoothstep(0.31, 0.37, p.y) * (1.0 - headW));
  // máscara negra del hocico, con rastro de atigrado
  c = mix(c, uMaskCol * (0.8 + 0.6 * streak), clamp(vMask.x * 1.3, 0.0, 1.0));
  // mancha blanca del pecho con borde irregular
  float wEdge = smoothstep(0.35, 0.65, vMask.y * uWhiteAmt + (rk_fbm(p * 40.0) - 0.5) * 0.35);
  // manchas "pied" opcionales (otros perros de la ciudad)
  float pied = uPied * smoothstep(0.48, 0.56, rk_fbm(p * 7.0 + 3.0));
  vec3 white = uWhite * (0.88 + 0.18 * streak);
  c = mix(c, white, max(wEdge, pied));
  rough = 0.74 - streak * 0.08;
  sheenAmt = 1.0;
  furAmt = 1.0;
  // interior rosado de las orejas, con algo de pelo
  vec3 ear = mix(vec3(0.42, 0.27, 0.24), vec3(0.25, 0.16, 0.14), streak2 * 0.7);
  c = mix(c, ear, vMask2.x * 0.85);
  furAmt *= 1.0 - vMask2.x * 0.7;
  // interior de la boca
  c = mix(c, vec3(0.07, 0.025, 0.025), smoothstep(0.3, 0.8, vMask2.z));
  rough = mix(rough, 0.45, vMask2.z);
  // trufa: cuero negro con poros
  float pores = mix(0.5, rk_vnoise(p * 900.0), fineB);
  vec3 nose = vec3(0.025, 0.022, 0.024) * (0.7 + 0.6 * pores);
  float nm = smoothstep(0.35, 0.7, vMask.z);
  c = mix(c, nose, nm);
  rough = mix(rough, 0.38 + pores * 0.2, nm);
  sheenAmt *= 1.0 - nm;
  furAmt *= 1.0 - nm;
  // uñas oscuras y brillantes
  float nail = smoothstep(0.35, 0.7, vMask.w);
  c = mix(c, vec3(0.06, 0.05, 0.045), nail);
  rough = mix(rough, 0.3, nail);
  sheenAmt *= 1.0 - nail;
  furAmt *= 1.0 - nail;
  return c;
}

// Altura del micro-relieve: hebras alargadas orientadas de la cabeza a la cola
`

export interface FurUniforms {
  uBase: { value: THREE.Color }
  uStripe: { value: THREE.Color }
  uWhite: { value: THREE.Color }
  uMaskCol: { value: THREE.Color }
  uBrindle: { value: number }
  uWhiteAmt: { value: number }
  uPied: { value: number }
  uShell: { value: number }
  uShellOffset: { value: number }
}

export function makeFurUniforms(p: CoatPalette): FurUniforms {
  const col = (hex: string) => new THREE.Color(hex)
  return {
    uBase: { value: col(p.base) },
    uStripe: { value: col(p.stripe) },
    uWhite: { value: col(p.white) },
    uMaskCol: { value: col(p.mask) },
    uBrindle: { value: p.brindle },
    uWhiteAmt: { value: p.whiteAmount },
    uPied: { value: p.pied },
    uShell: { value: 0 },
    uShellOffset: { value: 0 },
  }
}

/**
 * Crea el material del pelo.
 * @param shell 0 para la piel principal; 0 < shell <= 1 para una capa de pelo (volumen).
 */
export function createFurMaterial(uniforms: FurUniforms, shell = 0, shellOffset = 0): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0,
    sheen: shell > 0 ? 0 : 0.6,
    // el pelo corto apenas tiene reflejo especular; las capas exteriores ninguno (evita halos)
    specularIntensity: shell > 0 ? 0 : 0.35,
    envMapIntensity: shell > 0 ? 0.4 : 0.9,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#c99a6b'),
    transparent: shell > 0,
    depthWrite: shell === 0,
  })
  const own = { uShell: { value: shell }, uShellOffset: { value: shellOffset } }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, own)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aMask;
attribute vec4 aMask2;
varying vec3 vRest;
varying vec4 vMask;
varying vec4 vMask2;
uniform float uShellOffset;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRest = position;
vMask = aMask;
vMask2 = aMask2;`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
transformed += normalize(objectNormal) * uShellOffset;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FUR_FUNCS}\nuniform float uShell;`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float rkRough; float rkSheen; float rkFur;
rkPx = length(fwidth(vRest));
vec3 rkCol = rk_coat(vRest, rkRough, rkSheen, rkFur);
vec4 diffuseColor = vec4( rkCol, opacity );
if (uShell > 0.0) {
  // cada hebra es una celda de ~1 mm; las capas exteriores solo conservan las hebras más largas
  float strand = rk_hash13(floor(vRest * vec3(700.0, 700.0, 380.0)));
  // las capas solo se ven de canto (contorno aterciopelado), nunca como "ruido" de frente
  vec3 vdir = normalize(vViewPosition);
  float rim = 1.0 - abs(dot(normalize(vNormal), vdir));
  float alive = step(uShell * 0.9, strand) * rkFur;
  if (alive < 0.5 || rim < 0.35) discard;
  diffuseColor.rgb *= 0.92 + uShell * 0.08;
  diffuseColor.a = (0.75 - uShell * 0.55) * smoothstep(0.35, 0.85, rim);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = rkRough;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // micro-relieve del pelo: perturbación suave de la normal con ruido 3D (sin derivadas de pantalla,
  // que producen bloques de 2x2 píxeles); se desvanece cuando la hebra es menor que un píxel.
  float fa = (1.0 - smoothstep(0.0009, 0.0028, rkPx)) * rkFur;
  if (fa > 0.0) {
    vec3 q = vRest * vec3(240.0, 240.0, 90.0);
    vec3 pert = vec3(rk_vnoise(q), rk_vnoise(q + 17.3), rk_vnoise(q + 41.7)) - 0.5;
    pert -= normal * dot(pert, normal);
    normal = normalize(normal + pert * 0.45 * fa);
  }
}`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor *= rkSheen;
#endif`,
      )
  }
  mat.customProgramCacheKey = () => (shell > 0 ? 'rk-fur-shell' : 'rk-fur')
  return mat
}
