// Soporte para un modelo GLB propio de Rocky (p. ej. creado a partir de sus fotografías).
// Si existe public/models/rocky.glb, el juego lo usa en lugar del modelo procedural:
//  - Si sus huesos se llaman como los del esqueleto procedural (pelvis, spine, chest, neck, head,
//    jaw, earL, earR, tail, upperArmL, forearmL, handL, …), el animador procedural los mueve.
//  - Si no, se reproducen sus propias animaciones eligiéndolas por nombre
//    (idle, walk, run, jump, fall, sit, sleep, sniff, bark…), con fundidos suaves.
// El modelo se normaliza automáticamente: patas en y = 0, mirando hacia +Z y ~0,6 m de alto
// (antes de la escala del juego).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { BONES } from './anatomy.ts'
import { BONE_COUNT, ROOT_OFFSET_INDEX, type RockyAnimator, type AnimInput } from '../../animations/rockyAnimator.ts'

const URL_GLB = './models/rocky.glb'
let probe: Promise<GLTF | null> | null = null

/** Comprueba (una vez) si existe un modelo propio válido y lo carga. */
export function loadCustomRocky(): Promise<GLTF | null> {
  if (probe) return probe
  probe = (async () => {
    try {
      const res = await fetch(URL_GLB, { cache: 'no-cache' })
      if (!res.ok) return null
      const buf = await res.arrayBuffer()
      // el servidor de desarrollo devuelve index.html para rutas inexistentes: validar la cabecera "glTF"
      const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4))
      if (magic !== 'glTF') return null
      return await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(buf, './models/', resolve, reject))
    } catch {
      return null
    }
  })()
  return probe
}

const CLIP_KEYS: Record<string, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk'],
  run: ['run', 'gallop', 'trot', 'sprint'],
  jump: ['jump'],
  fall: ['fall', 'air'],
  sit: ['sit'],
  sleep: ['sleep', 'lie', 'lay'],
  sniff: ['sniff', 'smell', 'eat'],
  bark: ['bark', 'attack'],
}

function pickClip(clips: THREE.AnimationClip[], state: string) {
  const keys = CLIP_KEYS[state] ?? [state]
  return clips.find((c) => keys.some((k) => c.name.toLowerCase().includes(k)))
}

interface Props {
  gltf: GLTF
  animator: RockyAnimator
  input: AnimInput
}

export function CustomRockyModel({ gltf, animator, input }: Props) {
  const { root, boneMap, mixer, actions } = useMemo(() => {
    const scene = cloneSkinned(gltf.scene)
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false }
    })
    // normalizar tamaño y apoyo en el suelo
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const k = 0.6 / Math.max(1e-3, size.y)
    scene.scale.setScalar(k)
    scene.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k)
    const root = new THREE.Group()
    root.add(scene)
    // huesos con nombres compatibles
    const boneMap = new Map<number, { bone: THREE.Object3D; rest: THREE.Quaternion }>()
    BONES.forEach((b, i) => {
      let found: THREE.Object3D | undefined
      scene.traverse((o) => { if (!found && o.name.toLowerCase().replace(/[^a-z]/g, '') === b.name.toLowerCase()) found = o })
      if (found) boneMap.set(i, { bone: found, rest: found.quaternion.clone() })
    })
    const mixer = new THREE.AnimationMixer(scene)
    const actions = new Map<string, THREE.AnimationAction>()
    for (const st of Object.keys(CLIP_KEYS)) {
      const clip = pickClip(gltf.animations, st)
      if (clip) actions.set(st, mixer.clipAction(clip))
    }
    return { root, boneMap, mixer, actions }
  }, [gltf])

  const current = useRef<string>('')
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const procedural = boneMap.size >= 8

  useEffect(() => () => { mixer.stopAllAction() }, [mixer])

  useFrame((_, dt) => {
    const pose = animator.update(dt, input)
    if (procedural) {
      for (let i = 0; i < BONE_COUNT; i++) {
        const m = boneMap.get(i)
        if (!m) continue
        e.set(pose[i * 3], pose[i * 3 + 1], pose[i * 3 + 2])
        m.bone.quaternion.copy(m.rest).multiply(q.setFromEuler(e))
      }
      root.position.set(pose[ROOT_OFFSET_INDEX], pose[ROOT_OFFSET_INDEX + 1], pose[ROOT_OFFSET_INDEX + 2])
      return
    }
    // animaciones incluidas en el GLB
    const st = !input.grounded ? (input.vy > 0 ? 'jump' : 'fall')
      : input.crouching ? 'sniff'
      : animator.sleeping ? 'sleep'
      : animator.sitting ? 'sit'
      : input.speed > 1.4 ? 'run'
      : input.speed > 0.05 ? 'walk' : 'idle'
    const want = actions.has(st) ? st : actions.has('idle') ? 'idle' : [...actions.keys()][0]
    if (want && want !== current.current) {
      const next = actions.get(want)!
      next.reset().fadeIn(0.25).play()
      actions.get(current.current)?.fadeOut(0.25)
      current.current = want
    }
    const a = actions.get(current.current)
    if (a && (current.current === 'walk' || current.current === 'run')) a.timeScale = Math.max(0.5, input.speed / (current.current === 'run' ? 2 : 0.4))
    mixer.update(dt)
  })

  return <primitive object={root} />
}
