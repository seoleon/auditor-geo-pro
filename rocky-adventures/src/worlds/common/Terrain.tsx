// Terreno: malla de alturas con mezcla de 4 materiales (splat por vértice) con relieve,
// variación a gran escala para evitar repeticiones, y colisionador trimesh exacto.
import { useMemo } from 'react'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import type { Surface } from '../../systems/events'

type Tex = { map: THREE.Texture; normal: THREE.Texture }

export interface TerrainLayers {
  /** Capas en orden: r, g, b, a del splat. */
  layers: [Tex, Tex, Tex, Tex]
  /** Metros que abarca una repetición de cada capa. */
  scales: [number, number, number, number]
  tints?: [string, string, string, string]
}

interface Props extends TerrainLayers {
  size: number
  segments: number
  center?: [number, number]
  heightAt: (x: number, z: number) => number
  splat: (x: number, z: number, h: number, ny: number) => [number, number, number, number]
  surface?: Surface
}

export function buildTerrainGeometry(size: number, segments: number, cx: number, cz: number, heightAt: Props['heightAt'], splat: Props['splat']) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz
    pos.setXYZ(i, x, heightAt(x, z), z)
  }
  geo.computeVertexNormals()
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const sp = new Float32Array(pos.count * 4)
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const w = splat(x, z, y, nrm.getY(i))
    const s = w[0] + w[1] + w[2] + w[3] || 1
    sp.set([w[0] / s, w[1] / s, w[2] / s, w[3] / s], i * 4)
    uv[i * 2] = x
    uv[i * 2 + 1] = -z
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(sp, 4))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeBoundingSphere()
  return geo
}

export function makeTerrainMaterial({ layers, scales, tints }: TerrainLayers) {
  const mat = new THREE.MeshStandardMaterial({
    map: layers[0].map,
    normalMap: layers[0].normal,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.93,
    metalness: 0,
  })
  const uni = {
    tMap1: { value: layers[1].map }, tMap2: { value: layers[2].map }, tMap3: { value: layers[3].map },
    tNrm1: { value: layers[1].normal }, tNrm2: { value: layers[2].normal }, tNrm3: { value: layers[3].normal },
    uScales: { value: new THREE.Vector4(...scales.map((s) => 1 / s)) },
    uTint0: { value: new THREE.Color(tints?.[0] ?? '#ffffff') },
    uTint1: { value: new THREE.Color(tints?.[1] ?? '#ffffff') },
    uTint2: { value: new THREE.Color(tints?.[2] ?? '#ffffff') },
    uTint3: { value: new THREE.Color(tints?.[3] ?? '#ffffff') },
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWorldXZ = uv;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vSplat;
varying vec2 vWorldXZ;
uniform sampler2D tMap1; uniform sampler2D tMap2; uniform sampler2D tMap3;
uniform sampler2D tNrm1; uniform sampler2D tNrm2; uniform sampler2D tNrm3;
uniform vec4 uScales;
uniform vec3 uTint0; uniform vec3 uTint1; uniform vec3 uTint2; uniform vec3 uTint3;
vec4 tSplatW;
vec4 sharpSplat(vec4 w, vec4 h) {
  // transición dependiente de la altura de cada material (bordes naturales, no difuminados)
  vec4 v = w + h * 0.45;
  float m = max(max(v.x, v.y), max(v.z, v.w)) - 0.22;
  vec4 r = max(v - m, 0.0);
  return r / max(r.x + r.y + r.z + r.w, 1e-4);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 tuv = vWorldXZ;
vec4 c0 = texture2D(map, tuv * uScales.x);
vec4 c1 = texture2D(tMap1, tuv * uScales.y);
vec4 c2 = texture2D(tMap2, tuv * uScales.z);
vec4 c3 = texture2D(tMap3, tuv * uScales.w);
// rompe la repetición mezclando una segunda escala del mismo material
c0.rgb = mix(c0.rgb, texture2D(map, tuv * uScales.x * 0.23 + 0.37).rgb, 0.35);
tSplatW = sharpSplat(vSplat, vec4(dot(c0.rgb, vec3(0.33)), dot(c1.rgb, vec3(0.33)), dot(c2.rgb, vec3(0.33)), dot(c3.rgb, vec3(0.33))));
vec3 tcol = c0.rgb * uTint0 * tSplatW.x + c1.rgb * uTint1 * tSplatW.y + c2.rgb * uTint2 * tSplatW.z + c3.rgb * uTint3 * tSplatW.w;
// variación de color a gran escala (manchas de hierba seca, humedad…)
float macro = texture2D(map, tuv * 0.011).g;
tcol *= 0.82 + macro * 0.4;
diffuseColor.rgb *= tcol;`,
      )
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = (texture2D(normalMap, vWorldXZ * uScales.x).xyz * tSplatW.x
  + texture2D(tNrm1, vWorldXZ * uScales.y).xyz * tSplatW.y
  + texture2D(tNrm2, vWorldXZ * uScales.z).xyz * tSplatW.z
  + texture2D(tNrm3, vWorldXZ * uScales.w).xyz * tSplatW.w) * 2.0 - 1.0;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.72, tSplatW.z + tSplatW.w * 0.5);',
      )
  }
  return mat
}

export function Terrain({ size, segments, center = [0, 0], heightAt, splat, layers, scales, tints, surface = 'grass' }: Props) {
  const geo = useMemo(() => buildTerrainGeometry(size, segments, center[0], center[1], heightAt, splat), [size, segments, center, heightAt, splat])
  const mat = useMemo(() => makeTerrainMaterial({ layers, scales, tints }), [layers, scales, tints])
  const colliderArgs = useMemo(() => {
    const p = geo.attributes.position.array as Float32Array
    const idx = geo.index!.array as Uint32Array | Uint16Array
    return [new Float32Array(p), new Uint32Array(idx)] as [Float32Array, Uint32Array]
  }, [geo])
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <RigidBody type="fixed" colliders={false} userData={{ terrain: true, surface: surface === 'grass' ? undefined : surface }}>
        <TrimeshCollider args={colliderArgs} />
      </RigidBody>
    </>
  )
}
