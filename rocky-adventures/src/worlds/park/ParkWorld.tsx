// MUNDO 1 — EL PARQUE ENCANTADO
import { useEffect, useMemo } from 'react'
import { useGame } from '../../stores/gameStore'
import { WorldScene, type WorldDef } from '../WorldScene'
import { Terrain } from '../common/Terrain'
import { Water } from '../common/Water'
import { Grass } from '../common/Grass'
import { Bushes, Flowers, Forest, Rocks } from '../common/Vegetation'
import { Bench, Block, BoundaryWalls, EntranceArch, Fountain, Gazebo, Hedge, HollowLog, Lamp, Ramp, SecretZone, Slide, SoccerGoal, StoneTunnel } from '../common/Props'
import { cobbleTexture, dirtTexture, grassTexture, rockTexture } from '../common/textures'
import { AmbientMotes, Butterflies } from '../../components/Particles'
import { GoalGate, Signpost } from '../../gameplay/Mechanics'
import { BallGame, Bells, GardenGate, Squirrels } from './ParkMechanics'
import * as L from './parkLayout'
import { LOW_FX } from '../../utils/flags'
import type { V3 } from '../../gameplay/levelTypes'

const H = L.parkHeight

export default function ParkWorld() {
  const quality = useGame((s) => s.save.settings.quality)
  const def: WorldDef = useMemo(() => ({
    heightAt: L.parkHeight,
    surfaceAt: L.parkSurface,
    waterY: L.PARK.waterY,
    isDeepWater: L.parkDeepWater,
    killY: -8,
    spawn: L.SPAWN,
    spawnYaw: L.SPAWN_YAW,
    bones: L.BONES,
    cookies: L.COOKIES,
    crates: L.CRATES,
    checkpoints: L.CHECKPOINTS,
    enemies: L.ENEMIES,
    platforms: L.PLATFORMS,
    atmosphere: {
      sunElevation: 26, sunAzimuth: 150, cycleAmplitude: 16, cyclePeriod: 420,
      turbidity: 5, rayleigh: 1.6, fog: '#bfd8ea', fogDensity: 0.0052,
      hemiSky: '#cfe8ff', hemiGround: '#5b7a3a', sunColor: '#fff0d4', sunIntensity: 3.1, exposure: 1.0, clouds: 22,
    },
  }), [])

  const layers = useMemo(() => [grassTexture(), dirtTexture(), rockTexture(), cobbleTexture()] as const, [])
  const trees = useMemo(() => L.generateTrees(quality === 'low' ? 150 : quality === 'medium' ? 230 : 300), [quality])
  const rocks = useMemo(() => L.generateRocks(), [])
  const flowers = useMemo(() => L.generateFlowers(), [])
  const bushes = useMemo(() => L.generateBushes(), [])
  const butterflySpots = useMemo(() => [[15, H(15, 0) + 0.5, 0], [-15, H(-15, -26) + 0.5, -26], [57, H(57, -51) + 0.5, -51], [-6, L.PLATEAU_Y + 0.5, -58], [10, H(10, 30) + 0.5, 30], [-28, H(-28, 14) + 0.5, 14]] as [number, number, number][], [])

  const lampSpots: V3[] = useMemo(() => {
    const out: V3[] = []
    for (const z of [50, 37, 24]) for (const x of [-2.8, 2.8]) out.push([x, H(x, z), z])
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; out.push([Math.cos(a) * 11.6, H(Math.cos(a) * 11.6, Math.sin(a) * 11.6), Math.sin(a) * 11.6]) }
    out.push([-20, H(-20, 1), 1], [24, H(24, -3), -3], [-3, L.PLATEAU_Y, -55], [3, L.PLATEAU_Y, -63])
    return out
  }, [])

  const benches: { pos: V3; rot: number }[] = useMemo(() => [
    { pos: [3.6, H(3.6, 40), 40], rot: -Math.PI / 2 },
    { pos: [-3.6, H(-3.6, 30), 30], rot: Math.PI / 2 },
    ...[0.9, 2.5, 4.0, 5.5].map((a) => ({ pos: [Math.cos(a) * 9.8, H(Math.cos(a) * 9.8, Math.sin(a) * 9.8), Math.sin(a) * 9.8] as V3, rot: -a - Math.PI / 2 })),
    { pos: [-26, H(-26, 21), 21], rot: Math.PI },
    { pos: [-4, L.PLATEAU_Y, -57], rot: Math.PI / 2 },
    { pos: [4, L.PLATEAU_Y, -60], rot: -Math.PI / 2 },
    { pos: [16, H(16, 15), 15], rot: Math.PI * 0.8 },
  ], [])

  // datos del nivel accesibles para las pruebas automáticas
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__layout = {
      bones: L.BONES, cookies: L.COOKIES, crates: L.CRATES, checkpoints: L.CHECKPOINTS, squirrels: L.SQUIRRELS,
      bells: L.BELLS, goal: L.GOAL_POS, gate: L.GATE_POS, lake: L.PARK.lake, fountainY: L.FOUNTAIN_POS[1],
      gardenGateY: H(L.SECRET_GARDEN.max[0], -26.1),
    }
  }, [])

  const th = L.TREEHOUSE
  const top = L.TREEHOUSE_TOP
  const g = L.SECRET_GARDEN

  return (
    <WorldScene def={def}>
      <Terrain size={L.PARK.half * 2} segments={quality === 'low' ? 128 : 168} heightAt={L.parkHeight} splat={L.parkSplat} layers={[layers[0], layers[1], layers[2], layers[3]]} scales={[3.2, 2.5, 5, 2.2]} tints={['#ffffff', '#ffffff', '#f2eee6', '#ffffff']} />
      <Water y={L.PARK.waterY} size={44} center={[L.PARK.lake.cx, L.PARK.lake.cz]} heightAt={L.parkHeight} shallow="#5bbfb0" deep="#0f5a73" />
      {!LOW_FX && <Grass area={[-L.PARK.half, -L.PARK.half, L.PARK.half, L.PARK.half]} heightAt={L.parkHeight} density={L.parkGrassDensity}
        perChunk={quality === 'low' ? 240 : quality === 'medium' ? 480 : 820} maxDist={quality === 'low' ? 34 : quality === 'medium' ? 48 : 62} />}
      <Forest trees={trees} shadows={quality !== 'low'} />
      <Rocks items={rocks} />
      <Flowers items={flowers} />
      <Bushes items={bushes} />
      <BoundaryWalls half={L.PARK.half - 4} />

      {/* ------------------------------------------------ entrada y camino principal */}
      <EntranceArch pos={[0, H(0, 66), 66]} title="PARQUE ENCANTADO" />
      <Signpost pos={[2.6, H(2.6, 60), 60]} rot={-0.4} title="Bienvenida" text="Encuentra los 10 huesos dorados. Tres caminos llevan a la colina: el lago (oeste), los jardines (centro) y el bosque (este)." />
      {lampSpots.map((p, i) => <Lamp key={i} pos={p} />)}
      {benches.map((b, i) => <Bench key={i} pos={b.pos} rot={b.rot} />)}

      {/* ------------------------------------------------ plaza de la fuente */}
      <Fountain pos={L.FOUNTAIN_POS} />
      <Signpost pos={[-6.5, H(-6.5, 10), 10]} rot={0.6} title="Consejo" text="Mantén SHIFT para correr y acelerar. Pulsa C para olfatear: un rastro dorado te guiará hacia secretos cercanos." />

      {/* ------------------------------------------------ ruta oeste: lago, puente roto, isla, nenúfar, túnel, rampas */}
      <Ramp from={L.BRIDGE.a} to={L.BRIDGE.b} width={2.2} />
      <Ramp from={L.BRIDGE.c} to={L.BRIDGE.d} width={2.2} />
      <Block pos={[L.BRIDGE.b[0] + 0.3, -2.8, 4]} size={[0.5, L.BRIDGE.b[1] + 2.6, 0.5]} kind="wood" />
      <Block pos={[L.BRIDGE.c[0] - 0.3, -2.8, 4]} size={[0.5, L.BRIDGE.c[1] + 2.6, 0.5]} kind="wood" />
      <Signpost pos={[-19.5, H(-19.5, 6.5), 6.5]} rot={-1.2} title="Puente roto" text="¡Cuidado! Falta un trozo. Coge carrerilla (SHIFT) y salta con ESPACIO." />
      <StoneTunnel pos={L.TUNNEL.pos} rot={L.TUNNEL.rot} length={L.TUNNEL.length} />
      <SecretZone pos={[L.TUNNEL.pos[0], L.TUNNEL.pos[1] + 0.5, L.TUNNEL.pos[2]]} radius={3} onEnter={() => useGame.getState().discoverSecret('sec-tunnel')} />
      {L.WEST_RAMPS.map((r, i) => <Ramp key={i} from={r.from} to={r.to} width={2.2} />)}
      {L.WEST_DECKS.map((d, i) => <Block key={i} pos={d.pos} size={d.size} kind="wood" posts />)}

      {/* ------------------------------------------------ ruta central: jardín, campanas, terrazas */}
      <Bells pos={L.BELLS.pos} offsets={L.BELLS.offsets} />
      <Signpost pos={[-3.5, H(-3.5, -15.5), -15.5]} rot={0.3} title="Las campanas" text="Ladra (F) junto a cada campana, de la más pequeña a la más grande, y la verja del jardín se abrirá." />
      <Hedge from={[g.min[0], H(g.min[0], g.max[1]), g.max[1]]} to={[g.max[0], H(g.max[0], g.max[1]), g.max[1]]} />
      <Hedge from={[g.min[0], H(g.min[0], g.min[1]), g.min[1]]} to={[g.max[0], H(g.max[0], g.min[1]), g.min[1]]} />
      <Hedge from={[g.min[0], H(g.min[0], g.min[1]), g.min[1]]} to={[g.min[0], H(g.min[0], g.max[1]), g.max[1]]} />
      <Hedge from={[g.max[0], H(g.max[0], g.min[1]), g.min[1]]} to={[g.max[0], H(g.max[0], -27.6), -27.6]} />
      <Hedge from={[g.max[0], H(g.max[0], -24.6), -24.6]} to={[g.max[0], H(g.max[0], g.max[1]), g.max[1]]} />
      <GardenGate at={[g.max[0], H(g.max[0], -26.1), -26.1]} from={[g.max[0], H(g.max[0], -27.6), -27.6]} to={[g.max[0], H(g.max[0], -24.6), -24.6]} />
      <SecretZone pos={[-15.5, H(-15.5, -26.5) + 0.5, -26.5]} radius={3.5} onEnter={() => useGame.getState().discoverSecret('sec-garden')} />
      {L.TERRACES.map((t, i) => <Block key={i} pos={t.pos} size={t.size} kind="stone" />)}

      {/* ------------------------------------------------ ruta este: bosque, casa del árbol, pasarela */}
      {L.TREE_DECKS.map((d, i) => <Block key={i} pos={d.pos} size={d.size} kind="wood" posts />)}
      <Block pos={[th.x, top - 0.25, th.z - 2.25]} size={[6.4, 0.25, 1.9]} kind="wood" />
      <Block pos={[th.x, top - 0.25, th.z + 2.25]} size={[6.4, 0.25, 1.9]} kind="wood" />
      <Block pos={[th.x - 2.25, top - 0.25, th.z]} size={[1.9, 0.25, 2.6]} kind="wood" />
      <Block pos={[th.x + 2.25, top - 0.25, th.z]} size={[1.9, 0.25, 2.6]} kind="wood" />
      <Ramp from={L.WALKWAY.from} to={L.WALKWAY.to} width={2.2} />
      <Signpost pos={[th.x - 4.5, th.ground, th.z + 4]} rot={2.4} title="Casa del árbol" text="Sube saltando de plataforma en plataforma. Desde arriba, una pasarela lleva a la colina." />
      <HollowLog pos={L.GLADE.log} rot={0} length={5} radius={0.85} />
      <Hedge from={[43, H(43, -40), -40]} to={[52.8, H(52.8, -40), -40]} height={2.2} thick={1.2} />
      <Hedge from={[55.2, H(55.2, -40), -40]} to={[66, H(66, -40), -40]} height={2.2} thick={1.2} />
      <Hedge from={[43, H(43, -40), -40]} to={[43, H(43, -66), -66]} height={2.2} thick={1.2} />
      <SecretZone pos={[L.GLADE.center[0], L.GLADE.center[1] + 0.5, L.GLADE.center[2]]} radius={5} onEnter={() => useGame.getState().discoverSecret('sec-glade')} />

      {/* ------------------------------------------------ parque infantil */}
      <SoccerGoal pos={L.GOAL_POS} rot={0} />
      <BallGame start={L.BALL_START} goal={L.GOAL_POS} />
      <Slide pos={[21, H(21, 18), 18]} rot={Math.PI / 2} />
      <Signpost pos={[15, H(15, 8.5), 8.5]} rot={-0.8} title="¡Gol de Rocky!" text="Empuja la pelota roja con el cuerpo (o ládrale cerca) hasta meterla en la portería." />

      {/* ------------------------------------------------ misión de las ardillas */}
      <Squirrels list={L.SQUIRRELS} />

      {/* ------------------------------------------------ meseta y Puerta de las Huellas */}
      <Gazebo pos={L.GAZEBO_POS} />
      <GoalGate pos={L.GATE_POS} label="Abrir la Puerta de las Huellas" required={10} />

      {/* ------------------------------------------------ vida ambiental */}
      <Butterflies spots={butterflySpots} count={quality === 'low' ? 14 : 30} />
      <AmbientMotes count={quality === 'low' ? 120 : 260} />
    </WorldScene>
  )
}
