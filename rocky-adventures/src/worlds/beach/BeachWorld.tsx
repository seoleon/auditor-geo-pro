// MUNDO 3 — LA PLAYA DEL TESORO
import { useEffect, useMemo } from 'react'
import { useGame } from '../../stores/gameStore'
import { WorldScene, type WorldDef } from '../WorldScene'
import { Terrain } from '../common/Terrain'
import { Water } from '../common/Water'
import { Grass } from '../common/Grass'
import { Forest, Rocks, Bushes } from '../common/Vegetation'
import { Block, BoundaryWalls, Ramp, SecretZone } from '../common/Props'
import { grassTexture, rockTexture, sandTexture } from '../common/textures'
import { AmbientMotes } from '../../components/Particles'
import { GoalGate, Signpost, onEnemyStomped } from '../../gameplay/Mechanics'
import { Boat, Crystals, Lighthouse, Pier, Shipwreck, Umbrella } from './BeachProps'
import * as L from './beachLayout'
import { LOW_FX } from '../../utils/flags'
import type { V3 } from '../../gameplay/levelTypes'

const H = L.beachHeight

export default function BeachWorld() {
  const quality = useGame((s) => s.save.settings.quality)
  const missions = useGame((s) => s.save.worlds.beach.missions)
  const shells = useGame((s) => s.save.worlds.beach.cookies.length)

  const def: WorldDef = useMemo(() => ({
    heightAt: L.beachHeight,
    surfaceAt: L.beachSurface,
    waterY: L.BEACH.waterY,
    isDeepWater: L.beachDeepWater,
    killY: -8,
    spawn: L.SPAWN,
    spawnYaw: L.SPAWN_YAW,
    bones: L.BONES,
    cookies: L.COOKIES,
    crates: L.CRATES,
    checkpoints: L.CHECKPOINTS,
    enemies: L.ENEMIES,
    platforms: L.PLATFORMS,
    cookieKind: 'shell',
    atmosphere: {
      sunElevation: 11, sunAzimuth: 300, cycleAmplitude: 7, cyclePeriod: 520,
      turbidity: 7.5, rayleigh: 2.6, fog: '#f0cfae', fogDensity: 0.0042,
      hemiSky: '#ffd9b8', hemiGround: '#c9a46a', sunColor: '#ffd2a0', sunIntensity: 3.0, exposure: 1.05, clouds: 20,
    },
  }), [])

  // misiones: cangrejos y conchas
  useEffect(() => {
    let count = 0
    return onEnemyStomped((d) => {
      if (d.kind !== 'crab') return
      count++
      useGame.getState().setMissionProgress('beach-crabs', Math.min(4, count))
      if (count >= 4) useGame.getState().completeMission('beach-crabs')
    })
  }, [])
  useEffect(() => {
    if (shells >= L.COOKIES.length && !missions.includes('beach-shells')) useGame.getState().completeMission('beach-shells')
  }, [shells, missions])

  const layers = useMemo(() => {
    const sand = sandTexture()
    return [sand, sand, rockTexture(), grassTexture()] as const
  }, [])
  const palms = useMemo(() => L.generatePalms(), [])
  const rocks = useMemo(() => L.generateBeachRocks(), [])
  const dunesBushes = useMemo(() => Array.from({ length: 40 }, (_, i) => {
    const x = -36 + ((i * 37) % 96), z = 18 + ((i * 13) % 30)
    return { x, y: H(x, z) - 0.1, z, s: 0.7 + (i % 3) * 0.2 }
  }).filter((b) => H(b.x, b.z) > 2.2), [])
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__layout = {
      world: 'beach', bones: L.BONES, cookies: L.COOKIES, crates: L.CRATES, crabs: L.ENEMIES.map((e) => e.id).slice(0, 4),
      lighthouseTop: [L.LIGHTHOUSE.x + 3.4, L.LIGHTHOUSE.base + L.LIGHTHOUSE.height + 0.1, L.LIGHTHOUSE.z],
      chest: [L.CAVE.x + 0.4, L.beachHeight(L.CAVE.x, L.CAVE.z), L.CAVE.z],
    }
  }, [])
  const cave = L.CAVE
  const caveY = H(cave.x, cave.z)
  const lh = L.LIGHTHOUSE
  const steps: { pos: V3; size: V3 }[] = useMemo(() => {
    const base = (x: number, z: number) => H(x, z) - 0.3
    return [
      { pos: [-35.5, base(-35.5, 22), 22], size: [2.2, 1.3, 2.2] },
      { pos: [-37.6, base(-37.6, 20.5), 20.5], size: [2, 2.5, 2] },
      { pos: [-39.8, base(-39.8, 19), 19], size: [2, 3.7, 2] },
      { pos: [-42, base(-42, 17.5), 17.5], size: [2.8, 4.7, 2.8] },
    ]
  }, [])

  return (
    <WorldScene def={def}>
      <Terrain size={L.BEACH.half * 2} segments={quality === 'low' ? 110 : 150} heightAt={L.beachHeight} splat={L.beachSplat}
        layers={[layers[0], layers[1], layers[2], layers[3]]} scales={[3, 3, 5, 3]} tints={['#ffffff', '#b8a07c', '#e8d8c4', '#d8e0a0']} />
      <Water y={L.BEACH.waterY} size={400} center={[0, -60]} heightAt={L.beachHeight} shallow="#6fd6c8" deep="#1b6f9a" waves={0.12} segments={quality === 'low' ? 60 : 120} />
      {!LOW_FX && <Grass area={[-40, 10, 60, 60]} heightAt={L.beachHeight} density={(x, z) => (H(x, z) > 2.6 && x > -38 ? 0.55 : 0)} perChunk={quality === 'low' ? 120 : 260} colors={['#8a9a4a', '#c9c27a']} maxDist={40} />}
      <Forest trees={palms} shadows={quality !== 'low'} />
      <Rocks items={rocks} />
      <Bushes items={dunesBushes} tint="#a8b86a" />
      <BoundaryWalls half={L.BEACH.half - 6} />

      {/* muelle, barcas y puentes a los islotes */}
      <Ramp from={[0, H(0, 5) + 0.02, 5]} to={L.PIER.from} width={3} rails={false} />
      <Pier from={L.PIER.from} to={L.PIER.to} />
      <Boat pos={[3.2, -0.05, -12]} rot={0.1} color="#e8343f" />
      <Boat pos={[-3.3, -0.05, -18]} rot={-0.2} color="#2b8fd6" />
      <Boat pos={[3.4, -0.05, -23]} rot={0.3} color="#ffcb3d" />
      {L.BRIDGES.map((b, i) => <Ramp key={i} from={b.from} to={b.to} width={2} />)}
      <Signpost pos={[2.4, H(2.4, 7), 7]} rot={-0.3} title="Muelle" text="Desde el final del muelle, un puente y unas balsas llevan a los islotes. ¡En el grande está el faro!" />

      {/* faro */}
      <Lighthouse x={lh.x} z={lh.z} base={lh.base} height={lh.height} lit={missions.includes('beach-lighthouse')}
        onLight={() => { useGame.getState().completeMission('beach-lighthouse') }} />

      {/* barco naufragado */}
      <Shipwreck pos={[L.SHIP.x, H(L.SHIP.x, L.SHIP.z), L.SHIP.z]} rot={L.SHIP.rot} />

      {/* acantilado: peldaños de roca hasta la cornisa */}
      {steps.map((s, i) => <Block key={i} pos={s.pos} size={s.size} kind="rock" />)}

      {/* cueva del tesoro */}
      <GoalGate pos={[cave.x - 1.5, caveY, cave.z]} rot={Math.PI / 2} label="Abrir el cofre del tesoro" required={8} style="chest" />
      <Crystals pos={[cave.x - 2, caveY, cave.z - 3]} />
      <Crystals pos={[cave.x - 1, caveY, cave.z + 3.5]} />
      <SecretZone pos={[cave.x, caveY + 0.5, cave.z]} radius={4.5} onEnter={() => useGame.getState().discoverSecret('sec-cave')} />
      <Signpost pos={[-34, H(-34, 4), 4]} rot={Math.PI / 2} title="Cueva del Tesoro" text="Dicen que el Collar Legendario espera en un cofre que solo se abre con 8 huesos dorados." />

      {/* ambiente de playa */}
      {([[10, 18, '#ff6b9a'], [-6, 16, '#4fb8ff'], [20, 22, '#ffd23f'], [-20, 20, '#3ddc84']] as [number, number, string][]).map(([x, z, c], i) => <Umbrella key={i} pos={[x, H(x, z), z]} color={c} />)}
      <SecretZone pos={[L.SHIP.x, H(L.SHIP.x, L.SHIP.z) + 1, L.SHIP.z]} radius={3} onEnter={() => useGame.getState().discoverSecret('sec-ship')} />
      <AmbientMotes count={quality === 'low' ? 80 : 180} color="#ffe2b8" />
    </WorldScene>
  )
}
