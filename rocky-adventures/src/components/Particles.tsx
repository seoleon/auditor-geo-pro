// Sistema de partículas: un único "pool" de puntos con tamaño y color por partícula
// (destellos al recoger premios, polvo al aterrizar y derrapar, salpicaduras, astillas, estrellas,
// rastro del olfato, confeti) + partículas ambientales (polen/motas de luz) y mariposas.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { on } from '../systems/events'
import { runtime } from '../systems/runtime'
import { softDotTexture } from '../worlds/common/textures'
import { LOW_FX } from '../utils/flags'

const MAX = 1400

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; grav: number; drag: number }

class Pool {
  ps: P[] = []
  spawn(p: Partial<P> & { x: number; y: number; z: number }) {
    if (this.ps.length >= MAX) this.ps.shift()
    this.ps.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.15, r: 1, g: 1, b: 1, grav: 0, drag: 0.5, ...p })
  }
  burst(n: number, x: number, y: number, z: number, opts: { speed: number; up?: number; color: [number, number, number] | (() => [number, number, number]); size: number; life: number; grav?: number; spread?: number; drag?: number }) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * (opts.spread ?? 1)
      const sp = opts.speed * (0.4 + Math.random() * 0.6)
      const c = typeof opts.color === 'function' ? opts.color() : opts.color
      this.spawn({
        x, y, z,
        vx: Math.cos(a) * sp * e, vz: Math.sin(a) * sp * e, vy: (opts.up ?? 0) + Math.random() * sp * 0.6,
        max: opts.life * (0.6 + Math.random() * 0.6), size: opts.size * (0.6 + Math.random() * 0.8),
        r: c[0], g: c[1], b: c[2], grav: opts.grav ?? 0, drag: opts.drag ?? 1.5,
      })
    }
  }
}

export const particles = new Pool()

// los destellos usan colores > 1 para que el bloom los haga brillar; el polvo es mate
const gold = (): [number, number, number] => [2.2, 1.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.4]

export function ParticleSystem() {
  const { geo, mat, points } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 4), 4))
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softDotTexture() }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec4 color; varying vec4 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size * uScale / max(0.1, -mv.z), 48.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec4 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, t.a * vColor.a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 10
    return { geo, mat, points }
  }, [])

  useEffect(() => {
    const off = on((e) => {
      switch (e.type) {
        case 'collect':
          particles.burst(e.kind === 'bone' ? 60 : 26, e.x, e.y, e.z, { speed: 3.5, up: 2, color: e.kind === 'shell' ? () => [0.7, 0.9, 1] : gold, size: 0.13, life: 1.1, grav: 3 })
          break
        case 'land':
          if (e.strength > 0.35) particles.burst(Math.floor(10 * e.strength), runtime.player.pos.x, runtime.player.pos.y - 0.38, runtime.player.pos.z, { speed: 2.2, up: 0.4, color: e.surface === 'sand' ? [0.85, 0.76, 0.55] : [0.62, 0.56, 0.45], size: 0.22, life: 0.7, grav: -0.3, drag: 3 })
          break
        case 'skid':
          particles.burst(16, runtime.player.pos.x, runtime.player.pos.y - 0.38, runtime.player.pos.z, { speed: 2.5, up: 0.5, color: [0.66, 0.58, 0.47], size: 0.26, life: 0.8, grav: -0.2, drag: 3 })
          break
        case 'splash':
          particles.burst(40, e.x, e.y, e.z, { speed: 3, up: 3.5, color: [0.7, 0.85, 1], size: 0.2, life: 1, grav: 9 })
          break
        case 'stomp':
          particles.burst(20, e.x, e.y, e.z, { speed: 4, up: 1.5, color: [1, 0.95, 0.5], size: 0.25, life: 0.7, grav: 2 })
          break
        case 'break':
          particles.burst(30, e.x, e.y, e.z, { speed: 4, up: 3, color: () => [0.6 + Math.random() * 0.2, 0.42, 0.22], size: 0.22, life: 1.2, grav: 10, drag: 0.5 })
          break
        case 'dig':
          particles.burst(30, e.x, e.y, e.z, { speed: 2.5, up: 3, color: [0.55, 0.4, 0.25], size: 0.25, life: 1, grav: 9, drag: 0.6 })
          break
        case 'checkpoint':
          for (let i = 0; i < 40; i++) particles.spawn({ x: e.x + (Math.random() - 0.5), y: e.y + Math.random() * 0.5, z: e.z + (Math.random() - 0.5), vy: 1.5 + Math.random() * 2, max: 1.6, size: 0.2, r: 0.5, g: 1, b: 0.7, drag: 0.2 })
          break
        case 'bark': {
          const yaw = runtime.player.yaw
          for (let i = 0; i < 10; i++) {
            const a = yaw + (Math.random() - 0.5) * 0.9
            particles.spawn({ x: e.x, y: e.y + 0.1, z: e.z, vx: Math.sin(a) * 5, vz: Math.cos(a) * 5, vy: (Math.random() - 0.3) * 1.2, max: 0.35, size: 0.18, r: 1, g: 1, b: 1, drag: 4 })
          }
          break
        }
        case 'victory':
        case 'gate':
          for (let i = 0; i < 160; i++) {
            const c: [number, number, number] = [[1, 0.3, 0.4], [1, 0.85, 0.2], [0.3, 0.8, 1], [0.5, 1, 0.5]][i % 4] as [number, number, number]
            particles.spawn({ x: runtime.player.pos.x, y: runtime.player.pos.y + 1, z: runtime.player.pos.z, vx: (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 6, vz: (Math.random() - 0.5) * 9, max: 2.6, size: 0.22, r: c[0], g: c[1], b: c[2], grav: 6, drag: 0.8 })
          }
          break
      }
    })
    return off
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const pos = geo.attributes.position.array as Float32Array
    const col = geo.attributes.color.array as Float32Array
    const siz = geo.attributes.size.array as Float32Array
    const ps = particles.ps
    let w = 0
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      p.life += dt
      if (p.life >= p.max) continue
      const dragK = Math.exp(-p.drag * dt)
      p.vx *= dragK; p.vz *= dragK; p.vy = p.vy * dragK - p.grav * dt
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
      ps[w++] = p
      const k = p.life / p.max
      const j = w - 1
      pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z
      col[j * 4] = p.r; col[j * 4 + 1] = p.g; col[j * 4 + 2] = p.b; col[j * 4 + 3] = Math.min(1, (1 - k) * 2) * Math.min(1, p.life * 12) * (p.r > 1 ? 1 : 0.7)
      siz[j] = p.size * (k < 0.15 ? k / 0.15 : 1)
    }
    ps.length = w
    geo.setDrawRange(0, w)
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    geo.attributes.size.needsUpdate = true
  })

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  return <primitive object={points} />
}

/** Motas de polen / luz flotando alrededor de la cámara (profundidad y vida en el aire). */
export function AmbientMotes({ count = 220, color = '#fff2b0', warm = true }: { count?: number; color?: string; warm?: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const p = new Float32Array(count * 3)
    const ph = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 40
      p[i * 3 + 1] = Math.random() * 10
      p[i * 3 + 2] = (Math.random() - 0.5) * 40
      ph[i] = Math.random() * 100
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uTex: { value: softDotTexture() }, uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        attribute float phase; uniform float uTime; uniform vec3 uCenter; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.3 + phase) * 1.5;
          p.y += sin(uTime * 0.2 + phase * 1.7) * 0.8 + uTime * 0.15;
          p.z += cos(uTime * 0.25 + phase) * 1.5;
          // envuelve el volumen alrededor del centro (la cámara)
          p = uCenter + mod(p - uCenter + vec3(20.0, 0.0, 20.0), vec3(40.0, 10.0, 40.0)) - vec3(20.0, 2.0, 20.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // nunca enormes junto a la cámara: tamaño limitado y desvanecidas de cerca
          vA = (0.5 + 0.5 * sin(uTime * 2.0 + phase * 3.0)) * smoothstep(2.0, 5.0, -mv.z);
          gl_PointSize = clamp(60.0 / max(0.5, -mv.z), 1.0, 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; varying float vA;
        void main() { float a = texture2D(uTex, gl_PointCoord).a * (0.25 + vA * 0.45); gl_FragColor = vec4(uColor, a); }`,
      transparent: true,
      depthWrite: false,
      blending: warm ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    return { geo, mat }
  }, [count, color, warm])
  useFrame(({ camera }, dt) => {
    mat.uniforms.uTime.value += dt
    mat.uniforms.uCenter.value.copy(camera.position)
  })
  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  if (LOW_FX) return null
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
}

/** Mariposas con aleteo, que revolotean alrededor de puntos de interés y huyen de Rocky. */
export function Butterflies({ spots, count = 24 }: { spots: [number, number, number][]; count?: number }) {
  const { mesh, data } = useMemo(() => {
    const wing = new THREE.PlaneGeometry(0.16, 0.12)
    wing.rotateX(-Math.PI / 2)
    wing.translate(0.08, 0, 0)
    const w2 = wing.clone().scale(-1, 1, 1)
    const geo = new THREE.BufferGeometry()
    const merged = [wing, w2]
    const positions: number[] = [], sides: number[] = [], uvs: number[] = []
    merged.forEach((g, gi) => {
      const ng = g.toNonIndexed()
      const pa = ng.attributes.position.array as Float32Array
      const ua = ng.attributes.uv.array as Float32Array
      positions.push(...pa)
      uvs.push(...ua)
      for (let i = 0; i < pa.length / 3; i++) sides.push(gi === 0 ? 1 : -1)
    })
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1))
    geo.computeVertexNormals()
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 }
      mat.userData.shader = sh
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float side; uniform float uTime; varying vec2 vUv2;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vUv2 = uv;
float flap = sin(uTime * 22.0 + float(gl_InstanceID) * 1.7) * 1.1;
float ang = flap * side;
float x = transformed.x;
transformed.x = x * cos(ang);
transformed.y += abs(x) * sin(abs(flap)) * 0.9;`)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vUv2;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
vec2 c = vUv2 - vec2(0.5);
float wingShape = smoothstep(0.52, 0.45, length(c * vec2(0.9, 1.25)));
vec4 diffuseColor = vec4(diffuse, opacity * wingShape);
if (diffuseColor.a < 0.3) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.65 + 0.5 * smoothstep(0.1, 0.4, length(c));`)
    }
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    const cols = ['#ffd23f', '#ff8fab', '#7bdff2', '#ffffff', '#ff9f1c', '#b388eb']
    const data = Array.from({ length: count }, (_, i) => {
      const s = spots[i % spots.length]
      mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]))
      return { home: new THREE.Vector3(...s), pos: new THREE.Vector3(...s), phase: Math.random() * 100, flee: 0 }
    })
    mesh.frustumCulled = false
    return { mesh, data }
  }, [spots, count])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const eul = useMemo(() => new THREE.Euler(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  useFrame((_, dt) => {
    const sh = (mesh.material as THREE.Material).userData.shader
    if (sh) sh.uniforms.uTime.value += dt
    const t = runtime.time
    const pp = runtime.player.pos
    data.forEach((b, i) => {
      const d = b.pos.distanceTo(pp)
      if (d < 1.6) b.flee = 1.5
      b.flee = Math.max(0, b.flee - dt * 0.5)
      const tx = b.home.x + Math.sin(t * 0.4 + b.phase) * 2.2 + (b.pos.x - pp.x) * b.flee
      const ty = b.home.y + 0.6 + Math.sin(t * 0.9 + b.phase * 2) * 0.4 + b.flee * 1.5
      const tz = b.home.z + Math.cos(t * 0.33 + b.phase) * 2.2 + (b.pos.z - pp.z) * b.flee
      const ox = b.pos.x, oz = b.pos.z
      b.pos.x += (tx - b.pos.x) * dt * 1.2
      b.pos.y += (ty - b.pos.y) * dt * 1.5 + Math.sin(t * 6 + b.phase) * dt * 0.4
      b.pos.z += (tz - b.pos.z) * dt * 1.2
      const yaw = Math.atan2(b.pos.x - ox, b.pos.z - oz)
      eul.set(-0.3, yaw, 0)
      q.setFromEuler(eul)
      mesh.setMatrixAt(i, m4.compose(b.pos, q, one))
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}
