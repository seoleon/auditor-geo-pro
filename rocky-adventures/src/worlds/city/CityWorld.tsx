// MUNDO 2 — LA CIUDAD DE LOS PERROS
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useGame } from '../../stores/gameStore'
import { useLevel } from '../../stores/levelStore'
import { WorldScene, type WorldDef } from '../WorldScene'
import { Terrain } from '../common/Terrain'
import { Forest, Bushes, type TreeInstance, type ScatterItem } from '../common/Vegetation'
import { Bench, Block, BoundaryWalls, Lamp, Ramp, SecretZone, Fence } from '../common/Props'
import { asphaltTexture, cobbleTexture, grassTexture, tileTexture } from '../common/textures'
import { AmbientMotes, Butterflies } from '../../components/Particles'
import { GoalGate, Signpost } from '../../gameplay/Mechanics'
import { DogNPC, COATS } from '../../characters/DogNPC'
import { RockyModel, createAnimInput } from '../../characters/rocky/RockyModel'
import { Building, BusStop, Car, Hydrant, Kiosk, Planter, RoofFlag, Scaffold } from './CityProps'
import * as L from './cityLayout'
import type { V3 } from '../../gameplay/levelTypes'

const C = L.CITY.curb
const STONE = { base: '#a8a49c', stripe: '#8f8b84', white: '#b8b4ac', mask: '#7e7a73', brindle: 0.15, whiteAmount: 0.2, pied: 0 }

function RoadMarkings() {
  const dashes = useMemo(() => {
    const out: { pos: V3; rot: number; size: [number, number] }[] = []
    for (const line of [-15, 15, -45, 45]) {
      for (let t = -50; t < 50; t += 4) {
        if (Math.abs(t - 15) < 5 || Math.abs(t + 15) < 5) continue
        out.push({ pos: [line, 0.012, t], rot: 0, size: [0.18, 1.8] })
        out.push({ pos: [t, 0.012, line], rot: Math.PI / 2, size: [0.18, 1.8] })
      }
    }
    // pasos de cebra alrededor de la plaza
    for (const [cx, cz, horiz] of [[0, 15, true], [0, -15, true], [15, 0, false], [-15, 0, false]] as [number, number, boolean][]) {
      for (let k = -3; k <= 3; k++) out.push({ pos: [cx + (horiz ? k * 0.9 : 0), 0.013, cz + (horiz ? 0 : k * 0.9)], rot: horiz ? 0 : Math.PI / 2, size: [0.5, 5] })
    }
    return out
  }, [])
  return (
    <group>
      {dashes.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={[-Math.PI / 2, 0, d.rot]} receiveShadow>
          <planeGeometry args={d.size} />
          <meshStandardMaterial color="#f2f2ea" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

export default function CityWorld() {
  const quality = useGame((s) => s.save.settings.quality)
  const done = useGame((s) => s.save.worlds.city.missions)
  const carrying = useLevel((s) => !!s.flags.newspaper)
  const [found, setFound] = useState<Set<string>>(new Set())

  const def: WorldDef = useMemo(() => ({
    heightAt: L.cityHeight,
    surfaceAt: L.citySurface,
    waterY: -1e9,
    isDeepWater: () => false,
    killY: -10,
    spawn: L.SPAWN,
    spawnYaw: L.SPAWN_YAW,
    bones: L.BONES,
    cookies: L.COOKIES,
    crates: L.CRATES,
    checkpoints: L.CHECKPOINTS,
    enemies: L.ENEMIES,
    platforms: L.PLATFORMS,
    atmosphere: {
      sunElevation: 46, sunAzimuth: 210, cycleAmplitude: 14, cyclePeriod: 480,
      turbidity: 3.2, rayleigh: 1.2, fog: '#d3e0ee', fogDensity: 0.006,
      hemiSky: '#d8ecff', hemiGround: '#8a8070', sunColor: '#fff3df', sunIntensity: 3.3, exposure: 1.0, clouds: 18,
    },
  }), [])

  const asphalt = useMemo(() => asphaltTexture(), [])
  const layers = useMemo(() => [asphalt, asphalt, asphalt, asphalt] as const, [asphalt])
  const tiles = tileTexture()
  const grass = grassTexture()
  const cob = cobbleTexture()
  const sidewalkMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tiles.map, normalMap: tiles.normal, roughness: 0.85 }), [tiles])
  const plazaMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cob.map, normalMap: cob.normal, roughness: 0.9, color: '#f4ece0' }), [cob])
  const grassMat = useMemo(() => new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normal, roughness: 0.95 }), [grass])

  const trees: TreeInstance[] = useMemo(() => {
    const t: TreeInstance[] = []
    // árboles en alcorques a lo largo de las aceras
    for (const [cx, cz] of L.BLOCK_CENTERS) {
      if (cx === -30 && cz === 30) continue
      for (const [ox, oz] of [[-10, -4], [-10, 4], [10, -4], [10, 4], [-4, -10], [4, -10], [-4, 10], [4, 10]]) {
        if (cx === 0 && cz === 0) continue
        t.push({ x: cx + ox, y: C, z: cz + oz, rot: (ox * 7 + oz) % 6, scale: 0.62, kind: (ox + oz) % 3 === 0 ? 'birch' : 'oak' })
      }
    }
    // plaza y parque canino
    for (const [x, z] of [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]]) t.push({ x, y: C + 0.6, z, rot: x, scale: 0.75, kind: 'oak' })
    for (const [x, z, k] of [[-38, 22, 'oak'], [-38, 38, 'pine'], [-22, 38, 'oak'], [-30, 39, 'birch'], [-39, 30, 'oak']] as [number, number, 'oak' | 'pine' | 'birch'][]) t.push({ x, y: C, z, rot: x * 0.3, scale: 1.05, kind: k })
    // los edificios del fondo dejan ver alguna copa
    return t.filter((tr) => !L.BUILDINGS.some((b) => Math.abs(tr.x - b.pos[0]) < b.size[0] / 2 + 0.8 && Math.abs(tr.z - b.pos[2]) < b.size[2] / 2 + 0.8))
  }, [])
  const bushes: ScatterItem[] = useMemo(() => [[-40, 25], [-40, 34], [-20, 40], [-27, 20], [-33, 40], [-20, 30]].map(([x, z], i) => ({ x, y: C, z, s: 1.1 + (i % 3) * 0.2 })), [])

  const talkPuppy = (id: string) => () => {
    if (found.has(id)) return false
    const n = new Set(found).add(id)
    setFound(n)
    useGame.getState().setMissionProgress('city-puppies', n.size)
    useGame.getState().toast(`¡Cachorro encontrado! ${n.size}/3 — «¡Gracias, Rocky! Ya sé volver a casa.»`, 'mission')
    if (n.size >= 3) useGame.getState().completeMission('city-puppies')
    return true
  }
  const statueInput = useMemo(() => createAnimInput(), [])
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__layout = {
      world: 'city', bones: L.BONES, cookies: L.COOKIES, crates: L.CRATES, puppies: L.PUPPIES,
      kiosk: [8.5 - 2.0, C, 6], lola: [-5, C, 19.4], alley: [-20.6, C, 0], flag: [26.5, L.ROOF('e-tower'), -5.2], goal: [0, C, -0.6],
    }
  }, [C])

  return (
    <WorldScene def={def}>
      <Terrain size={L.CITY.half * 2 + 20} segments={24} heightAt={() => 0} splat={() => [1, 0, 0, 0]} layers={[layers[0], layers[1], layers[2], layers[3]]} scales={[6, 6, 6, 6]} surface="stone" />
      <RoadMarkings />
      <BoundaryWalls half={L.CITY.half - 3} />

      {/* aceras elevadas, plaza y parque canino */}
      {L.BLOCK_CENTERS.map(([x, z], i) => (
        <group key={i}>
          <Block pos={[x, 0, z]} size={[22, C, 22]} kind="stone" />
          <mesh position={[x, C + 0.002, z]} rotation-x={-Math.PI / 2} receiveShadow material={x === 0 && z === 0 ? plazaMat : sidewalkMat}>
            <planeGeometry args={[21.6, 21.6]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-30, C + 0.01, 30]} rotation-x={-Math.PI / 2} receiveShadow material={grassMat}><planeGeometry args={[18, 18]} /></mesh>
      <Fence points={[[-39, C, 21], [-39, C, 39], [-21, C, 39]]} />
      <Fence points={[[-21, C, 39], [-21, C, 33]]} />
      <Fence points={[[-21, C, 27], [-21, C, 21], [-27, C, 21]]} />
      {[[-32, 31, 1.2], [-28, 33, 0.8], [-25, 29, 0.5]].map(([x, z, h], i) => <Block key={i} pos={[x, C, z]} size={[1.8, h, 1.2]} kind="wood" />)}

      {/* edificios y tiendas */}
      {L.BUILDINGS.map((b) => <Building key={b.id} def={b} />)}
      {L.WALLS.map((w, i) => <Block key={i} pos={w.pos} size={w.size} kind="stone" />)}

      {/* ruta de azoteas */}
      <Ramp from={L.ROOF_RAMPS[0].from} to={L.ROOF_RAMPS[0].to} width={1.6} rails={false} />
      <Ramp from={L.ROOF_RAMPS[1].from} to={L.ROOF_RAMPS[1].to} width={2.2} />
      <Ramp from={L.ROOF_RAMPS[2].from} to={L.ROOF_RAMPS[2].to} width={2.0} />
      {L.ROOF_STEPS.map((s, i) => <Block key={i} pos={s.pos} size={s.size} kind="wood" />)}
      <RoofFlag pos={[26.5, L.ROOF('e-tower'), -6.5]} raised={done.includes('city-rooftops')} onRaise={() => useGame.getState().completeMission('city-rooftops')} />
      <Signpost pos={[18.6, C, 30.5]} rot={-Math.PI / 2} title="Escalera de incendios" text="Sube a las azoteas y llega a la bandera de la torre: ¡de azotea en azotea!" />

      {/* andamios */}
      <Scaffold pos={[24.5, C, -24.5]} levels={5} />
      <Scaffold pos={[-27, C, -24.5]} levels={3} rot={Math.PI} />
      <Fence points={[[20, C, -20], [29, C, -20]]} />

      {/* plaza: estatua de piedra de un bulldog, medalla, quiosco */}
      <Block pos={[0, C, -8]} size={[3.2, 1.6, 3.2]} kind="stone" />
      <group position={[0, C + 1.6, -8]}>
        <RockyModel quality="low" palette={STONE} input={statueInput} scale={3} shellCount={0} mode="sit" />
      </group>
      <GoalGate pos={[0, C, -2.5]} label="Recoger la Medalla de la Ciudad" required={8} style="medal" />
      <Kiosk pos={[8.5, C, 6]} rot={-Math.PI / 2} taken={carrying || done.includes('city-delivery')} onTake={() => {
        useLevel.getState().setFlag('newspaper', true)
        useGame.getState().toast('¡Tienes el periódico! Llévaselo a Lola, en la panadería.', 'info')
      }} />
      {[[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]].map(([x, z], i) => <Planter key={i} pos={[x, C, z]} size={[2.6, 0.6, 2.6]} />)}
      {[[-4, 9], [4, 9], [-9.5, 0], [9.5, -1]].map(([x, z], i) => <Bench key={i} pos={[x, C, z]} rot={Math.atan2(-x, -z)} />)}
      <Signpost pos={[-3, C, 12.5]} rot={0.2} title="Plaza Mayor" text="Ayuda a los vecinos y reúne 8 huesos dorados para recoger la Medalla de la Ciudad." />

      {/* calle de las tiendas */}
      <BusStop pos={[-9.5, C, 19.6]} rot={Math.PI} />
      <Block pos={[-7.2, C, 19.4]} size={[0.8, 1.1, 0.8]} kind="wood" />
      <Block pos={[-0.3, C, 21.2]} size={[1, 1, 1]} kind="wood" />
      {[[11.6, 21], [-11.6, -21], [21, -11.6], [-21, 11.6]].map(([x, z], i) => <Hydrant key={i} pos={[x, C, z]} />)}

      {/* coches y farolas */}
      {L.CARS.map((c, i) => <Car key={i} pos={c.pos} rot={c.rot} color={c.color} />)}
      {L.LAMPS.map((p, i) => <Lamp key={i} pos={p} />)}
      <Forest trees={trees} shadows={quality !== 'low'} />
      <Bushes items={bushes} />

      {/* vecinos */}
      <DogNPC id="lola" pos={[-5, C, 20.6]} yaw={Math.PI} coat="cream" name="Lola" scale={1.45}
        lines={['¡Hola, Rocky! Hoy el pan huele de maravilla.', '¿Has visto mi periódico? Siempre me lo dejan en el quiosco de la plaza.']}
        talkLabel={carrying ? 'Dar el periódico a Lola' : 'Hablar con Lola'}
        onTalk={() => {
          if (!carrying) return false
          useLevel.getState().setFlag('newspaper', false)
          useGame.getState().completeMission('city-delivery')
          useGame.getState().toast('Lola: «¡Mi periódico! Toma, un hueso dorado recién horneado.»', 'mission')
          return true
        }} />
      {L.PUPPIES.map((p) => (
        <DogNPC key={p.id} id={p.id} pos={p.pos} yaw={p.yaw} coat={p.coat} name="Cachorro" scale={1.0}
          lines={['¡Guau! Ya sé volver a casa.']} hidden={done.includes('city-puppies') || found.has(p.id)}
          talkLabel="Ayudar al cachorro" onTalk={talkPuppy(p.id)} />
      ))}
      <DogNPC id="max" pos={[-27, C, 26]} yaw={-2.4} coat="black" name="Max" lines={['Dicen que en el parque hay algo enterrado… ¡olfatea con C!', 'Los Escobots se aturden si les ladras.']} />
      <DogNPC id="kiko" pos={[4, C, -12]} yaw={0.3} coat="fawn" name="Kiko" lines={['Desde la torre se ve toda la ciudad.', 'Hay un callejón al oeste tapado con cajas… ¿qué habrá detrás?']} />
      <DogNPC id="nina" pos={[22, C, 15.8]} yaw={Math.PI} coat="red" name="Nina" lines={['¡Me encanta la peluquería canina!', 'El limpiacristales sube y baja por la fachada amarilla.']} />

      <SecretZone pos={[-37, C + 0.5, 0]} radius={4} onEnter={() => useGame.getState().discoverSecret('sec-courtyard')} />
      <SecretZone pos={[22.5, L.ROOF('e-tower') + 0.5, -4.5]} radius={4} onEnter={() => useGame.getState().discoverSecret('sec-tower')} />
      <Butterflies spots={[[-30, C + 0.5, 30], [0, C + 0.5, 0]]} count={quality === 'low' ? 6 : 12} />
      <AmbientMotes count={quality === 'low' ? 60 : 140} color="#ffffff" />
      <primitive object={new THREE.Object3D()} visible={false} userData={{ coats: Object.keys(COATS).length }} />
    </WorldScene>
  )
}
