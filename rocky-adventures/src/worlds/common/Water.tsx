// Agua: superficie PBR con oleaje animado (normales procedurales), reflejo del cielo (envMap),
// color según profundidad real (usa un mapa de alturas del terreno), espuma en la orilla
// y ondulación de vértices para el mar.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise.glsl'

interface Props {
  y: number
  size: number
  center?: [number, number]
  heightAt: (x: number, z: number) => number
  shallow?: string
  deep?: string
  /** Altura de las olas (mar). */
  waves?: number
  segments?: number
}

export function makeHeightTexture(heightAt: (x: number, z: number) => number, size: number, cx: number, cz: number, res = 256) {
  const data = new Uint16Array(res * res)
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const x = cx - size / 2 + (i / (res - 1)) * size
      const z = cz - size / 2 + (j / (res - 1)) * size
      data[j * res + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z))
    }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

export function Water({ y, size, center = [0, 0], heightAt, shallow = '#4fb3a9', deep = '#0d4f6b', waves = 0, segments = 1 }: Props) {
  const { mat, geo, uniforms } = useMemo(() => {
    const uniforms = {
      uTime: { value: 0 },
      uHeight: { value: makeHeightTexture(heightAt, size, center[0], center[1]) },
      uOrigin: { value: new THREE.Vector2(center[0] - size / 2, center[1] - size / 2) },
      uSize: { value: size },
      uWaterY: { value: y },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uWaves: { value: waves },
    }
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      envMapIntensity: 1.1,
      specularIntensity: 1,
      ior: 1.33,
    })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWaves;
varying vec3 vWPos;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
if (uWaves > 0.0) {
  transformed.y += (sin(wp0.x * 0.18 + uTime * 1.1) * 0.6 + sin(wp0.z * 0.23 - uTime * 0.9) * 0.4 + sin((wp0.x + wp0.z) * 0.41 + uTime * 1.7) * 0.25) * uWaves;
}
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
${NOISE_GLSL}
uniform float uTime; uniform sampler2D uHeight; uniform vec2 uOrigin; uniform float uSize; uniform float uWaterY;
uniform vec3 uShallow; uniform vec3 uDeep; uniform float uWaves;
varying vec3 vWPos;
float wDepth; float wFoam;`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
vec2 huv = (vWPos.xz - uOrigin) / uSize;
float ground = texture2D(uHeight, huv).r;
wDepth = max(0.0, uWaterY - ground);
float shore = 1.0 - smoothstep(0.0, 0.45, wDepth);
float n = rk_vnoise(vec3(vWPos.xz * 1.6, uTime * 0.6));
wFoam = smoothstep(0.55, 0.95, shore + n * 0.35 * shore) ;
// espuma de las olas en mar abierto
if (uWaves > 0.0) wFoam = max(wFoam, smoothstep(0.78, 0.95, rk_fbm(vec3(vWPos.xz * 0.25, uTime * 0.2))) * 0.6);
vec3 wc = mix(uShallow, uDeep, smoothstep(0.0, 3.5, wDepth));
vec4 diffuseColor = vec4(mix(wc, vec3(0.95), wFoam), mix(0.55, 0.92, smoothstep(0.0, 1.8, wDepth)));
diffuseColor.a = max(diffuseColor.a, wFoam);
diffuseColor.a *= smoothstep(0.0, 0.06, wDepth + wFoam * 0.1);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // oleaje: dos capas de ruido desplazándose en direcciones distintas
  vec2 p = vWPos.xz;
  float e = 0.08;
  float s1 = 1.8, s2 = 0.55;
  float h0 = rk_vnoise(vec3(p * s1 + vec2(uTime * 0.35, uTime * 0.2), uTime * 0.3)) + rk_vnoise(vec3(p * s2 - vec2(uTime * 0.12, -uTime * 0.17), 3.0)) * 1.6;
  float hx = rk_vnoise(vec3((p + vec2(e, 0.0)) * s1 + vec2(uTime * 0.35, uTime * 0.2), uTime * 0.3)) + rk_vnoise(vec3((p + vec2(e, 0.0)) * s2 - vec2(uTime * 0.12, -uTime * 0.17), 3.0)) * 1.6;
  float hz = rk_vnoise(vec3((p + vec2(0.0, e)) * s1 + vec2(uTime * 0.35, uTime * 0.2), uTime * 0.3)) + rk_vnoise(vec3((p + vec2(0.0, e)) * s2 - vec2(uTime * 0.12, -uTime * 0.17), 3.0)) * 1.6;
  vec3 wn = normalize(vec3(-(hx - h0) / e * 0.09, 1.0, -(hz - h0) / e * 0.09));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.05, 0.7, wFoam);')
    }
    const geo = new THREE.PlaneGeometry(size, size, segments, segments)
    geo.rotateX(-Math.PI / 2)
    return { mat, geo, uniforms }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, size, heightAt, waves, segments])

  useFrame((_, dt) => { uniforms.uTime.value += dt })

  return <mesh geometry={geo} material={mat} position={[center[0], y, center[1]]} renderOrder={5} receiveShadow />
}
