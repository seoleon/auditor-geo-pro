// Monta el modelo de Rocky en Three.js: malla con skinning, esqueleto, capas de pelo,
// ojos con córnea brillante, párpados, lengua y collar.

import * as THREE from 'three'
import { ANCHORS, BONES, type BoneDef } from './anatomy.ts'
import type { RockyMeshData } from './mesher.ts'
import { createFurMaterial, makeFurUniforms, type CoatPalette } from '../../shaders/furMaterial'

export interface RockyParts {
  group: THREE.Group
  mesh: THREE.SkinnedMesh
  shells: THREE.SkinnedMesh[]
  bones: Record<string, THREE.Bone>
  eyes: [THREE.Object3D, THREE.Object3D]
  lids: [THREE.Object3D, THREE.Object3D]
  tongue: THREE.Mesh
  collar: THREE.Group
  legendaryCollar: THREE.Group
  dispose: () => void
}

let irisTexture: THREE.CanvasTexture | null = null

/** Textura del ojo: pupila grande, iris marrón con estrías radiales y anillo límbico oscuro. */
function getIrisTexture(): THREE.CanvasTexture {
  if (irisTexture) return irisTexture
  const W = 256, H = 128
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  // v = 1 (arriba del lienzo) corresponde al polo frontal del ojo
  for (let y = 0; y < H; y++) {
    const t = y / H // 0 = centro de la pupila, 1 = parte trasera
    for (let x = 0; x < W; x++) {
      let r: number, gg: number, b: number
      const fib = Math.sin(x * 0.55 + Math.sin(x * 0.13) * 3) * 0.5 + 0.5
      const noise = Math.random() * 0.15
      if (t < 0.13) { r = 6; gg = 4; b = 4 } // pupila
      else if (t < 0.36) {
        const k = (t - 0.13) / 0.23
        const base = 0.55 + 0.45 * fib
        r = (150 - 70 * k) * base + 20 * noise
        gg = (82 - 40 * k) * base + 10 * noise
        b = (30 - 14 * k) * base
        if (k < 0.12) { r *= 0.5; gg *= 0.5; b *= 0.5 } // borde de la pupila
      } else if (t < 0.42) { r = 18; gg = 11; b = 8 } // anillo límbico
      else { const k = Math.min(1, (t - 0.42) * 3); r = 70 + 120 * k; gg = 52 + 105 * k; b = 45 + 95 * k } // esclerótica
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`
      g.fillRect(x, y, 1, 1)
    }
  }
  irisTexture = new THREE.CanvasTexture(c)
  irisTexture.colorSpace = THREE.SRGBColorSpace
  irisTexture.anisotropy = 4
  return irisTexture
}

function boneHead(name: string): THREE.Vector3 {
  const b = BONES.find((d) => d.name === name) as BoneDef
  return new THREE.Vector3(...b.head)
}

export function buildRocky(data: RockyMeshData, palette: CoatPalette, shellCount: number): RockyParts {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4))
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4))
  geo.setAttribute('aMask', new THREE.BufferAttribute(data.mask, 4))
  geo.setAttribute('aMask2', new THREE.BufferAttribute(data.mask2, 4))
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1))
  geo.computeBoundingSphere()

  // --- Esqueleto ---
  const bones: Record<string, THREE.Bone> = {}
  const list: THREE.Bone[] = []
  for (const def of BONES) {
    const b = new THREE.Bone()
    b.name = def.name
    const parent = def.parent ? BONES.find((d) => d.name === def.parent)! : null
    b.position.set(
      def.head[0] - (parent ? parent.head[0] : 0),
      def.head[1] - (parent ? parent.head[1] : 0),
      def.head[2] - (parent ? parent.head[2] : 0),
    )
    if (def.parent) bones[def.parent].add(b)
    bones[def.name] = b
    list.push(b)
  }
  const skeleton = new THREE.Skeleton(list)

  const uniforms = makeFurUniforms(palette)
  const mainMat = createFurMaterial(uniforms)
  const mesh = new THREE.SkinnedMesh(geo, mainMat)
  mesh.name = 'RockyBody'
  mesh.add(bones.root)
  mesh.bind(skeleton)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  const group = new THREE.Group()
  group.name = 'Rocky'
  group.add(mesh)

  // --- Capas de pelo (volumen del contorno) ---
  const shells: THREE.SkinnedMesh[] = []
  for (let i = 1; i <= shellCount; i++) {
    const t = i / shellCount
    const sm = new THREE.SkinnedMesh(geo, createFurMaterial(uniforms, t, 0.0026 * t))
    sm.bind(skeleton, mesh.bindMatrix)
    sm.frustumCulled = false
    sm.renderOrder = 1 + i
    group.add(sm)
    shells.push(sm)
  }

  // --- Ojos: globo con iris texturizado y córnea con barniz (clearcoat) ---
  const eyeGeo = new THREE.SphereGeometry(ANCHORS.eyeRadius, 32, 20)
  eyeGeo.rotateX(Math.PI / 2) // el polo +Y (pupila) pasa a mirar hacia +Z
  const eyeMat = new THREE.MeshPhysicalMaterial({
    map: getIrisTexture(),
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    ior: 1.38,
    specularIntensity: 0.9,
    envMapIntensity: 1.4,
  })
  const lidGeo = new THREE.SphereGeometry(ANCHORS.eyeRadius * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  const lidMat = new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.8 })
  const headPos = boneHead('head')
  const makeEye = (anchor: number[], side: number) => {
    const holder = new THREE.Group()
    holder.position.set(anchor[0] - headPos.x, anchor[1] - headPos.y, anchor[2] - headPos.z)
    holder.rotation.y = 0.28 * side // los ojos del bulldog miran ligeramente hacia fuera
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.name = 'eye'
    holder.add(eye)
    const lid = new THREE.Mesh(lidGeo, lidMat)
    lid.rotation.x = -0.35
    lid.castShadow = false
    holder.add(lid)
    bones.head.add(holder)
    return { eye, lid }
  }
  const L = makeEye(ANCHORS.eyeL, 1)
  const R = makeEye(ANCHORS.eyeR, -1)

  // --- Lengua húmeda ---
  const tongueGeo = new THREE.CapsuleGeometry(0.016, 0.03, 6, 12)
  tongueGeo.rotateX(Math.PI / 2)
  tongueGeo.scale(1, 0.28, 1)
  tongueGeo.translate(0, 0, 0.012)
  const tongue = new THREE.Mesh(
    tongueGeo,
    new THREE.MeshPhysicalMaterial({ color: '#d0656e', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  )
  const jawPos = boneHead('jaw')
  tongue.position.set(ANCHORS.tongue[0] - jawPos.x, ANCHORS.tongue[1] - jawPos.y, ANCHORS.tongue[2] - jawPos.z)
  tongue.scale.setScalar(0.001)
  bones.jaw.add(tongue)

  // --- Collares (de cuero, y el Collar Legendario dorado) ---
  const neckPos = boneHead('neck')
  const makeCollar = (legendary: boolean) => {
    const g = new THREE.Group()
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.104, legendary ? 0.0105 : 0.0085, 10, 48),
      legendary
        ? new THREE.MeshPhysicalMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.22, clearcoat: 0.5, emissive: '#5a3a00', emissiveIntensity: 0.4 })
        : new THREE.MeshStandardMaterial({ color: '#b3262e', roughness: 0.55 }),
    )
    band.scale.set(1.06, 0.94, 1)
    g.add(band)
    const tag = new THREE.Mesh(
      legendary ? new THREE.OctahedronGeometry(0.02, 0) : new THREE.CylinderGeometry(0.016, 0.016, 0.004, 20),
      legendary
        ? new THREE.MeshPhysicalMaterial({ color: '#4fd1ff', metalness: 0.2, roughness: 0.05, transmission: 0.4, emissive: '#1a6dff', emissiveIntensity: 1.2 })
        : new THREE.MeshStandardMaterial({ color: '#e8b04a', metalness: 1, roughness: 0.3 }),
    )
    if (!legendary) tag.rotation.x = Math.PI / 2
    tag.position.set(0, -0.104, 0.014)
    g.add(tag)
    if (legendary) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const stud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0065, 0), tag.material)
        stud.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0)
        g.add(stud)
      }
    }
    g.position.set(ANCHORS.collar[0] - neckPos.x, ANCHORS.collar[1] - neckPos.y, ANCHORS.collar[2] - neckPos.z)
    g.rotation.x = -0.84
    g.traverse((o) => { o.castShadow = true })
    bones.neck.add(g)
    return g
  }
  const collar = makeCollar(false)
  const legendaryCollar = makeCollar(true)
  legendaryCollar.visible = false

  const dispose = () => {
    geo.dispose()
    mainMat.dispose()
    shells.forEach((s) => (s.material as THREE.Material).dispose())
    eyeGeo.dispose()
    lidGeo.dispose()
    tongueGeo.dispose()
  }

  return {
    group, mesh, shells, bones,
    eyes: [L.eye, R.eye], lids: [L.lid, R.lid],
    tongue, collar, legendaryCollar, dispose,
  }
}
