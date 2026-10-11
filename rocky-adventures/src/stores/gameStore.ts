// Estado global del juego (Zustand): pantallas, partida en curso, progreso persistente y ajustes.
import { create } from 'zustand'
import { defaultSave, emptyWorld, loadSave, writeSave, type SaveData, type Settings, type WorldId } from '../systems/save'
import { LEVEL_META } from '../worlds/levelMeta'
import { emit } from '../systems/events'
import { useLevel } from './levelStore'

export type Screen = 'menu' | 'worldSelect' | 'controls' | 'options' | 'loading' | 'playing' | 'paused' | 'victory' | 'gameover'

export interface Toast {
  id: number
  text: string
  kind: 'bone' | 'cookie' | 'mission' | 'secret' | 'info' | 'checkpoint' | 'warning'
}

export interface GameState {
  screen: Screen
  /** Pantalla a la que volver desde Controles/Opciones. */
  returnTo: Screen
  world: WorldId
  /** Mundo montado en la escena 3D (también se usa de fondo en el menú). */
  mountedWorld: WorldId
  sceneReady: boolean
  save: SaveData
  saveRecovered: boolean
  runId: number
  health: number
  maxHealth: number
  enemiesDefeated: number
  objective: string
  hint: string | null
  toasts: Toast[]
  missionProgress: Record<string, number>
  loadingProgress: number
  loadingLabel: string
  fps: number
  /** Ajustes y progreso */
  setScreen: (s: Screen) => void
  openSubmenu: (s: 'controls' | 'options') => void
  closeSubmenu: () => void
  startWorld: (w: WorldId, fresh?: boolean) => void
  restartFromCheckpoint: () => void
  restartWorld: () => void
  setLoading: (p: number, label?: string) => void
  finishLoading: () => void
  collectBone: (id: string) => boolean
  collectCookie: (id: string) => boolean
  discoverSecret: (id: string) => boolean
  completeMission: (id: string) => boolean
  setMissionProgress: (id: string, v: number) => void
  reachCheckpoint: (id: string) => boolean
  damage: (amount?: number) => void
  heal: () => void
  enemyDefeated: () => void
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  setHint: (h: string | null) => void
  setObjective: (o: string) => void
  winWorld: () => void
  updateSettings: (p: Partial<Settings>) => void
  resetProgress: () => void
  setFps: (f: number) => void
  setSceneReady: (r: boolean) => void
  continueWorld: () => WorldId
}

let toastSeq = 1

/** Se asigna desde el jugador para evitar dependencias circulares. */
let teleportToCheckpoint: () => void = () => {}
export function setTeleportHandler(f: () => void) { teleportToCheckpoint = f }
const initial = loadSave()

export function scoreOf(save: SaveData, world: WorldId, enemies: number) {
  const w = save.worlds[world]
  return w.bones.length * 1000 + w.cookies.length * 250 + w.missions.length * 1500 + w.secrets.length * 500 + enemies * 200
}

function persist(get: () => GameState) {
  writeSave(get().save)
}

export const useGame = create<GameState>((set, get) => {
  const updateWorld = (fn: (w: SaveData['worlds'][WorldId]) => void) => {
    const s = get().save
    const world = get().world
    const nw = { ...s.worlds[world], bones: [...s.worlds[world].bones], cookies: [...s.worlds[world].cookies], missions: [...s.worlds[world].missions], secrets: [...s.worlds[world].secrets] }
    fn(nw)
    const save: SaveData = { ...s, worlds: { ...s.worlds, [world]: nw } }
    const score = scoreOf(save, world, get().enemiesDefeated)
    if (score > nw.bestScore) nw.bestScore = score
    set({ save })
    persist(get)
  }

  const objectiveFor = (world: WorldId, save: SaveData) => {
    const meta = LEVEL_META[world]
    const got = save.worlds[world].bones.length
    if (got >= meta.bonesRequired) {
      return world === 'park' ? '¡Tienes los 10 huesos! Ve a la Puerta de las Huellas en lo alto de la colina.'
        : world === 'city' ? '¡Huesos completos! Recoge la Medalla en la plaza de la estatua.'
        : '¡Huesos completos! Abre el cofre del tesoro en la cueva.'
    }
    return `Encuentra huesos dorados (${got}/${meta.bonesRequired})`
  }

  return {
    screen: 'menu',
    returnTo: 'menu',
    world: 'park',
    mountedWorld: 'park',
    sceneReady: false,
    save: initial.data,
    saveRecovered: initial.recovered,
    runId: 0,
    health: 3,
    maxHealth: 3,
    enemiesDefeated: 0,
    objective: '',
    hint: null,
    toasts: [],
    missionProgress: {},
    loadingProgress: 0,
    loadingLabel: '',
    fps: 0,

    setScreen: (screen) => set({ screen }),
    openSubmenu: (s) => set({ returnTo: get().screen === 'paused' ? 'paused' : 'menu', screen: s }),
    closeSubmenu: () => set({ screen: get().returnTo }),

    startWorld: (world, fresh = false) => {
      const s = get().save
      let save = s
      if (fresh) {
        save = { ...s, worlds: { ...s.worlds, [world]: { ...emptyWorld(), bestScore: s.worlds[world].bestScore } } }
        writeSave(save, true)
      }
      const reuse = !fresh && get().mountedWorld === world && get().sceneReady
      if (!reuse) useLevel.getState().reset()
      set({
        world, save, screen: reuse ? 'playing' : 'loading', loadingProgress: 0, loadingLabel: 'Preparando el mundo…',
        runId: reuse ? get().runId : get().runId + 1, mountedWorld: world, sceneReady: reuse,
        health: 3, enemiesDefeated: 0, hint: null, toasts: [], missionProgress: {},
        objective: objectiveFor(world, save),
      })
      if (reuse) {
        get().toast(LEVEL_META[world].intro, 'info')
        teleportToCheckpoint()
      }
    },
    restartFromCheckpoint: () => { set({ health: 3, screen: 'playing', hint: null }); teleportToCheckpoint() },
    restartWorld: () => get().startWorld(get().world, true),
    setLoading: (p, label) => set({ loadingProgress: p, loadingLabel: label ?? get().loadingLabel }),
    finishLoading: () => {
      if (get().screen !== 'loading') return
      set({ screen: 'playing', loadingProgress: 1 })
      const meta = LEVEL_META[get().world]
      get().toast(meta.intro, 'info')
    },

    collectBone: (id) => {
      const w = get().save.worlds[get().world]
      if (w.bones.includes(id)) return false
      updateWorld((nw) => nw.bones.push(id))
      const meta = LEVEL_META[get().world]
      const n = get().save.worlds[get().world].bones.length
      get().toast(n >= meta.bonesRequired ? `¡Hueso dorado ${n}/${meta.totalBones}! ¡Ya puedes abrir la puerta!` : `¡Hueso dorado! ${n}/${meta.totalBones}`, 'bone')
      set({ objective: objectiveFor(get().world, get().save) })
      return true
    },
    collectCookie: (id) => {
      const w = get().save.worlds[get().world]
      if (w.cookies.includes(id)) return false
      updateWorld((nw) => nw.cookies.push(id))
      return true
    },
    discoverSecret: (id) => {
      const w = get().save.worlds[get().world]
      if (w.secrets.includes(id)) return false
      updateWorld((nw) => nw.secrets.push(id))
      get().toast('¡Has descubierto un lugar secreto!', 'secret')
      emit({ type: 'secret' })
      return true
    },
    completeMission: (id) => {
      const w = get().save.worlds[get().world]
      if (w.missions.includes(id)) return false
      updateWorld((nw) => nw.missions.push(id))
      const m = LEVEL_META[get().world].missions.find((x) => x.id === id)
      get().toast(`Misión completada: ${m?.title ?? id} — ${m?.reward ?? ''}`, 'mission')
      emit({ type: 'mission' })
      return true
    },
    setMissionProgress: (id, v) => set({ missionProgress: { ...get().missionProgress, [id]: v } }),
    reachCheckpoint: (id) => {
      const w = get().save.worlds[get().world]
      if (w.checkpoint === id) return false
      updateWorld((nw) => { nw.checkpoint = id })
      get().toast('Punto de control activado', 'checkpoint')
      set({ health: get().maxHealth })
      return true
    },
    damage: (amount = 1) => {
      const h = Math.max(0, get().health - amount)
      set({ health: h })
      emit({ type: 'hurt' })
      if (h <= 0) set({ screen: 'gameover' })
    },
    heal: () => set({ health: Math.min(get().maxHealth, get().health + 1) }),
    enemyDefeated: () => {
      set({ enemiesDefeated: get().enemiesDefeated + 1 })
      updateWorld(() => {})
    },
    toast: (text, kind = 'info') => {
      const id = toastSeq++
      set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] })
      setTimeout(() => get().dismissToast(id), kind === 'info' ? 6500 : 4200)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    setHint: (hint) => { if (get().hint !== hint) set({ hint }) },
    setObjective: (objective) => set({ objective }),
    winWorld: () => {
      const world = get().world
      const s = get().save
      const next = LEVEL_META[world].next
      const unlocked = next && !s.unlocked.includes(next) ? [...s.unlocked, next] : s.unlocked
      const save: SaveData = {
        ...s,
        unlocked,
        legendaryCollar: s.legendaryCollar || world === 'beach',
        worlds: { ...s.worlds, [world]: { ...s.worlds[world], completed: true } },
      }
      set({ save, screen: 'victory', hint: null })
      writeSave(save, true)
      emit({ type: 'victory' })
    },
    updateSettings: (p) => {
      const save = { ...get().save, settings: { ...get().save.settings, ...p } }
      set({ save })
      writeSave(save)
    },
    resetProgress: () => {
      const d = defaultSave()
      d.settings = get().save.settings
      set({ save: d })
      writeSave(d, true)
    },
    setFps: (fps) => set({ fps }),
    setSceneReady: (sceneReady) => set({ sceneReady }),
    continueWorld: () => {
      const s = get().save
      const order: WorldId[] = ['park', 'city', 'beach']
      return order.find((w) => s.unlocked.includes(w) && !s.worlds[w].completed) ?? (order.filter((w) => s.unlocked.includes(w)).pop() as WorldId)
    },
  }
})

export function currentWorldProgress() {
  const s = useGame.getState()
  return s.save.worlds[s.world]
}
