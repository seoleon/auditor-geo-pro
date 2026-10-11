// Perros vecinos (NPC): bulldogs franceses con otros mantos que reutilizan el modelo y el
// animador de Rocky. Miran a Rocky cuando se acerca, mueven el culete y celebran al hablar.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RockyModel, createAnimInput, type RockyHandle } from './rocky/RockyModel'
import { useGame } from '../stores/gameStore'
import { runtime } from '../systems/runtime'
import { useInteractable } from '../gameplay/Mechanics'
import type { CoatPalette } from '../shaders/furMaterial'
import type { V3 } from '../gameplay/levelTypes'
import { CuboidCollider, RigidBody } from '@react-three/rapier'

export const COATS: Record<string, CoatPalette> = {
  fawn: { base: '#c99257', stripe: '#6b4423', white: '#f2e8da', mask: '#1a120c', brindle: 0.05, whiteAmount: 0.4, pied: 0 },
  cream: { base: '#e8d3b0', stripe: '#a8835a', white: '#fbf6ee', mask: '#3a2a1c', brindle: 0.0, whiteAmount: 0.7, pied: 0 },
  pied: { base: '#f3ede4', stripe: '#1a1410', white: '#f6f1ea', mask: '#1a1410', brindle: 0.05, whiteAmount: 0.9, pied: 0.0 },
  black: { base: '#2a211c', stripe: '#0c0907', white: '#e8e0d4', mask: '#080605', brindle: 0.5, whiteAmount: 0.6, pied: 0 },
  blue: { base: '#7d8288', stripe: '#3c4046', white: '#eeeeee', mask: '#2a2c30', brindle: 0.1, whiteAmount: 0.5, pied: 0 },
  red: { base: '#b25e2e', stripe: '#5a2a10', white: '#f0e2d0', mask: '#2a160c', brindle: 0.15, whiteAmount: 0.3, pied: 0 },
}
// manchas grandes del "pied" (blanco con parches oscuros)
COATS.pied = { base: '#f3ede4', stripe: '#1a1410', white: '#211a15', mask: '#1a1410', brindle: 0.0, whiteAmount: 0.0, pied: 1 }

interface Props {
  id: string
  pos: V3
  yaw?: number
  coat: keyof typeof COATS
  scale?: number
  name: string
  lines: string[]
  /** Si se indica, hablar con él ejecuta esta acción (misiones). */
  onTalk?: () => boolean | void
  talkLabel?: string
  hidden?: boolean
}

export function DogNPC({ id, pos, yaw = 0, coat, scale = 1.4, name, lines, onTalk, talkLabel, hidden }: Props) {
  const quality = useGame((s) => s.save.settings.quality)
  const handle = useRef<RockyHandle | null>(null)
  const group = useRef<THREE.Group>(null)
  const anim = useMemo(() => createAnimInput(), [])
  const p = useMemo(() => new THREE.Vector3(...pos), [pos])
  const head = useMemo(() => new THREE.Vector3(pos[0], pos[1] + 0.6, pos[2]), [pos])
  const talkIdx = useRef(0)
  useEffect(() => {
    if (hidden) return
    runtime.lookTargets.set('npc-' + id, head)
    return () => { runtime.lookTargets.delete('npc-' + id) }
  }, [id, head, hidden])
  useInteractable('npc-' + id, p, 2.4, talkLabel ?? `Hablar con ${name}`, () => !hidden, () => {
    const special = onTalk?.()
    if (!special) {
      useGame.getState().toast(`${name}: «${lines[talkIdx.current % lines.length]}»`, 'info')
      talkIdx.current++
    }
    handle.current?.animator.trigger('celebrate')
  })
  useFrame(() => {
    const g = group.current
    if (!g || hidden) return
    // mira a Rocky cuando está cerca
    const pp = runtime.player.pos
    const d = pp.distanceTo(p)
    if (d < 7) {
      const lx = pp.x - p.x, lz = pp.z - p.z
      const c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y)
      anim.look = { x: lx * c + lz * s, y: pp.y - p.y - 0.3, z: -lx * s + lz * c }
    } else anim.look = null
  })
  if (hidden) return null
  return (
    <group ref={group} position={pos} rotation-y={yaw}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.25 * scale, 0.3 * scale, 0.35 * scale]} position={[0, 0.3 * scale, 0]} /></RigidBody>
      <RockyModel quality={quality === 'high' ? 'medium' : quality} palette={COATS[coat]} handle={handle} input={anim} scale={scale} shellCount={quality === 'high' ? 2 : 0} mode="sit" />
    </group>
  )
}
