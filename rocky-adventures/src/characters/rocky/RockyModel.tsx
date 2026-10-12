// Componente de Rocky: genera (o recupera de la caché) la malla esculpida, monta el esqueleto
// y aplica cada fotograma la pose calculada por el animador procedural.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildRocky, type RockyParts } from './buildRocky.ts'
import { cellSizeForQuality, loadRockyMesh } from './rockyMeshCache.ts'
import type { RockyMeshData } from './mesher.ts'
import { RockyAnimator, BONE_COUNT, ROOT_OFFSET_INDEX, type AnimInput } from '../../animations/rockyAnimator.ts'
import { BONES } from './anatomy.ts'
import { ROCKY_COAT, type CoatPalette } from '../../shaders/furMaterial'
import { CustomRockyModel, loadCustomRocky } from './CustomRockyModel'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type Quality = 'low' | 'medium' | 'high'

export interface RockyHandle {
  animator: RockyAnimator
  parts: RockyParts | null
  input: AnimInput
}

export function createAnimInput(): AnimInput {
  return { speed: 0, vy: 0, grounded: true, turnRate: 0, accel: 0, sprinting: false, skidding: false, crouching: false, look: null }
}

interface Props {
  quality: Quality
  palette?: CoatPalette
  handle?: React.MutableRefObject<RockyHandle | null>
  /** Escala del modelo en el mundo. */
  scale?: number
  legendary?: boolean
  /** Si se indica, el animador se controla desde fuera (no se crea uno propio). */
  input?: AnimInput
  onReady?: () => void
  /** Fuerza el número de capas de pelo (los NPC usan menos). */
  shellCount?: number
  mode?: 'auto' | 'sit' | 'stand'
  /** Permite sustituir el modelo por public/models/rocky.glb si existe (solo el jugador). */
  allowCustom?: boolean
}

export function useRockyMesh(quality: Quality) {
  const [data, setData] = useState<RockyMeshData | null>(null)
  useEffect(() => {
    let alive = true
    loadRockyMesh(cellSizeForQuality(quality)).then((d) => alive && setData(d))
    return () => { alive = false }
  }, [quality])
  return data
}

export function RockyModel({ quality, palette = ROCKY_COAT, handle, scale = 1, legendary = false, input, onReady, shellCount, mode = 'auto', allowCustom = false }: Props) {
  const [custom, setCustom] = useState<GLTF | null>(null)
  useEffect(() => {
    if (!allowCustom) return
    let alive = true
    loadCustomRocky().then((g) => { if (alive) setCustom(g) })
    return () => { alive = false }
  }, [allowCustom])
  const data = useRockyMesh(quality)
  const animator = useMemo(() => new RockyAnimator(), [])
  animator.mode = mode
  const localInput = useMemo(() => input ?? createAnimInput(), [input])
  const shells = shellCount ?? (quality === 'high' ? 5 : quality === 'medium' ? 3 : 0)
  const parts = useMemo(() => {
    if (!data) return null
    // copia de los buffers: los atributos de la caché deben poder reutilizarse en varios modelos
    const copy: RockyMeshData = {
      ...data,
      positions: data.positions.slice(), normals: data.normals.slice(), indices: data.indices.slice(),
      skinIndex: data.skinIndex.slice(), skinWeight: data.skinWeight.slice(), mask: data.mask.slice(), mask2: data.mask2.slice(),
    }
    return buildRocky(copy, palette, shells)
  }, [data, palette, shells])

  useEffect(() => {
    if (!custom) return
    if (handle) handle.current = { animator, parts: null, input: localInput }
    onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom])

  useEffect(() => {
    if (!parts || custom) return
    if (handle) handle.current = { animator, parts, input: localInput }
    onReady?.()
    return () => parts.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, custom])

  useEffect(() => {
    if (!parts) return
    parts.legendaryCollar.visible = legendary
    parts.collar.visible = false // el Rocky real no lleva collar; el Legendario se gana en la playa
  }, [parts, legendary])

  const boneList = useMemo(() => (parts ? BONES.map((b) => parts.bones[b.name]) : []), [parts])
  const restPos = useMemo(() => (parts ? boneList.map((b) => b.position.clone()) : []), [parts, boneList])
  const chestScale = useRef(1)

  useFrame((_, dt) => {
    if (!parts || custom) return
    const pose = animator.update(dt, localInput)
    for (let i = 0; i < BONE_COUNT; i++) {
      boneList[i].rotation.set(pose[i * 3], pose[i * 3 + 1], pose[i * 3 + 2])
    }
    const root = boneList[0]
    root.position.set(
      restPos[0].x + pose[ROOT_OFFSET_INDEX],
      restPos[0].y + pose[ROOT_OFFSET_INDEX + 1],
      restPos[0].z + pose[ROOT_OFFSET_INDEX + 2],
    )
    // respiración visible en el pecho
    chestScale.current = 1 + Math.sin(performance.now() * 0.003) * 0.006
    parts.bones.chest.scale.set(chestScale.current, chestScale.current, 1)
    // párpados y lengua
    const lid = -0.35 + animator.lidClose * 1.75
    parts.lids[0].rotation.x = lid
    parts.lids[1].rotation.x = lid
    const tg = animator.tongueOut
    parts.tongue.scale.setScalar(Math.max(0.001, tg))
    parts.tongue.position.z = 0.33 - 0.27 + tg * 0.022
    parts.tongue.rotation.x = 0.35 * tg + Math.sin(performance.now() * 0.014) * 0.05 * tg
    // mirada de los ojos hacia el objeto de interés
    const look = localInput.look
    const yaw = look ? THREE.MathUtils.clamp(Math.atan2(look.x, look.z) * 0.3, -0.35, 0.35) : 0
    parts.eyes[0].rotation.y = yaw
    parts.eyes[1].rotation.y = yaw
  })

  if (custom) return (
    <group scale={scale}>
      <CustomRockyModel gltf={custom} animator={animator} input={localInput} />
    </group>
  )
  if (!parts) return null
  return (
    <group scale={scale}>
      <primitive object={parts.group} />
    </group>
  )
}
