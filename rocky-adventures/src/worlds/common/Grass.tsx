// Hierba instanciada por parcelas con viento suave, se aparta al paso de Rocky,
// degradado de color raíz-punta, recorte por frustum y LOD por distancia (densidad decreciente).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../../utils/random'
import { runtime } from '../../systems/runtime'
import { NOISE_GLSL } from '../../shaders/noise.glsl'

export const windUniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uWind: { value: 1 } }

function bladeClumpGeometry(blades: number, seed: number) {
  const rnd = mulberry32(seed)
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = []
  const SEG = 3
  for (let b = 0; b < blades; b++) {
    const ox = (rnd() - 0.5) * 0.34, oz = (rnd() - 0.5) * 0.34
    const h = 0.11 + rnd() * 0.2
    const w = 0.02 + rnd() * 0.016
    const a = rnd() * Math.PI
    const lean = (rnd() - 0.5) * 0.25
    const ca = Math.cos(a), sa = Math.sin(a)
    const base = pos.length / 3
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG
      const ww = w * (1 - t * 0.92)
      const bend = lean * t * t
      for (const side of [-1, 1]) {
        const lx = side * ww
        pos.push(ox + lx * ca + bend * sa, h * t, oz - lx * sa + bend * ca)
        nrm.push(0, 1, 0)
        uv.push(side > 0 ? 1 : 0, t)
      }
    }
    for (let s = 0; s < SEG; s++) {
      const i0 = base + s * 2
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Inyecta viento (y empuje del jugador) en un material instanciado. */
export function applyWind(mat: THREE.Material, opts: { strength: number; push: boolean; heightVar: 'uv' | 'y'; tipColor?: boolean }) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    Object.assign(sh.uniforms, windUniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${NOISE_GLSL}
uniform float uTime; uniform vec3 uPlayer; uniform float uWind;
varying float vTip;`)
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
vec3 rootW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
vec3 rootW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
float tip = ${opts.heightVar === 'uv' ? 'uv.y' : 'clamp(position.y / 6.0, 0.0, 1.0)'};
vTip = tip;
float gust = rk_vnoise(vec3(rootW.xz * 0.06 + vec2(uTime * 0.25, uTime * 0.1), 0.0));
float sway = sin(uTime * 1.9 + rootW.x * 0.45 + rootW.z * 0.31) * 0.5 + gust * 1.2 - 0.3;
vec3 off = vec3(0.8, 0.0, 0.45) * sway * ${opts.strength.toFixed(3)} * uWind * tip * tip;
${opts.push ? `
vec2 dp = rootW.xz - uPlayer.xz;
float dl = length(dp);
float pushK = (1.0 - smoothstep(0.25, 0.95, dl)) * step(abs(rootW.y - uPlayer.y), 1.4);
off.xz += normalize(dp + 1e-4) * pushK * 0.32 * tip;
off.y -= pushK * 0.12 * tip;` : ''}
mvPosition.xyz += (inverse(mat3(modelMatrix)) * off);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTip;')
      .replace('#include <color_fragment>', `#include <color_fragment>
${opts.tipColor ? 'diffuseColor.rgb *= mix(0.55, 1.2, vTip);' : ''}`)
  }
  mat.customProgramCacheKey = () => `wind-${opts.strength}-${opts.push}-${opts.heightVar}-${opts.tipColor}`
}

interface GrassProps {
  area: [number, number, number, number] // minX, minZ, maxX, maxZ
  heightAt: (x: number, z: number) => number
  density: (x: number, z: number) => number
  perChunk: number
  chunk?: number
  colors?: [string, string]
  maxDist?: number
  seed?: number
}

export function Grass({ area, heightAt, density, perChunk, chunk = 12, colors = ['#5a9a30', '#a6cc52'], maxDist = 55, seed = 7 }: GrassProps) {
  const group = useRef<THREE.Group>(null)
  const { meshes, mat, geo } = useMemo(() => {
    const geo = bladeClumpGeometry(7, seed)
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, color: '#ffffff' })
    applyWind(mat, { strength: 0.16, push: true, heightVar: 'uv', tipColor: true })
    const rnd = mulberry32(seed * 13)
    const meshes: { mesh: THREE.InstancedMesh; cx: number; cz: number; full: number }[] = []
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3()
    const c0 = new THREE.Color(colors[0]), c1 = new THREE.Color(colors[1]), col = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    for (let x = area[0]; x < area[2]; x += chunk)
      for (let z = area[1]; z < area[3]; z += chunk) {
        const mats: THREE.Matrix4[] = []
        const cols: THREE.Color[] = []
        for (let i = 0; i < perChunk; i++) {
          const px = x + rnd() * chunk, pz = z + rnd() * chunk
          const d = density(px, pz)
          if (d <= 0 || rnd() > d) continue
          p.set(px, heightAt(px, pz) - 0.02, pz)
          q.setFromAxisAngle(up, rnd() * Math.PI * 2)
          const s = 0.8 + rnd() * 0.45
          sc.set(s, s * (0.75 + d * 0.4), s)
          mats.push(m.compose(p, q, sc).clone())
          cols.push(col.copy(c0).lerp(c1, rnd()).clone())
        }
        if (!mats.length) continue
        const mesh = new THREE.InstancedMesh(geo, mat, mats.length)
        mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, cols[i]) })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        mesh.receiveShadow = true
        meshes.push({ mesh, cx: x + chunk / 2, cz: z + chunk / 2, full: mats.length })
      }
    return { meshes, mat, geo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, perChunk, chunk, seed])

  useEffect(() => () => { geo.dispose(); mat.dispose(); meshes.forEach((c) => c.mesh.dispose()) }, [geo, mat, meshes])

  useFrame(({ camera }) => {
    // LOD: la densidad baja con la distancia; más allá de maxDist no se dibuja
    for (const c of meshes) {
      const d = Math.hypot(camera.position.x - c.cx, camera.position.z - c.cz)
      if (d > maxDist) { c.mesh.visible = false; continue }
      c.mesh.visible = true
      const k = d < maxDist * 0.35 ? 1 : 1 - (d - maxDist * 0.35) / (maxDist * 0.65) * 0.85
      c.mesh.count = Math.max(1, Math.floor(c.full * k))
    }
  })

  return (
    <group ref={group} dispose={null}>
      {meshes.map((c, i) => <primitive key={i} object={c.mesh} />)}
    </group>
  )
}

/** Avanza el tiempo del viento y la posición del jugador (una vez por escena). */
export function WindDriver() {
  useFrame((_, dt) => {
    windUniforms.uTime.value += dt
    windUniforms.uPlayer.value.copy(runtime.player.pos)
    windUniforms.uPlayer.value.y -= 0.4
  })
  return null
}
