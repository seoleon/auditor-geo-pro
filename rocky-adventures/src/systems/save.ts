// Guardado automático en localStorage con versión de esquema, validación y recuperación
// ante datos corruptos (se conserva una copia de seguridad del último guardado válido).

export type WorldId = 'park' | 'city' | 'beach'
export type QualityLevel = 'low' | 'medium' | 'high'

export interface WorldProgress {
  bones: string[]
  cookies: string[]
  missions: string[]
  secrets: string[]
  checkpoint: string | null
  bestScore: number
  completed: boolean
}

export interface Settings {
  musicVolume: number
  sfxVolume: number
  musicMuted: boolean
  sfxMuted: boolean
  quality: QualityLevel
  sensitivity: number
  invertY: boolean
  showFps: boolean
}

export interface SaveData {
  version: number
  unlocked: WorldId[]
  worlds: Record<WorldId, WorldProgress>
  settings: Settings
  legendaryCollar: boolean
  updatedAt: number
}

export const SAVE_VERSION = 2
const KEY = 'rocky-adventures.save'
const BACKUP_KEY = 'rocky-adventures.save.backup'

export const WORLD_IDS: WorldId[] = ['park', 'city', 'beach']

export function emptyWorld(): WorldProgress {
  return { bones: [], cookies: [], missions: [], secrets: [], checkpoint: null, bestScore: 0, completed: false }
}

export function defaultSettings(): Settings {
  return { musicVolume: 0.55, sfxVolume: 0.8, musicMuted: false, sfxMuted: false, quality: 'medium', sensitivity: 1, invertY: false, showFps: false }
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlocked: ['park'],
    worlds: { park: emptyWorld(), city: emptyWorld(), beach: emptyWorld() },
    settings: defaultSettings(),
    legendaryCollar: false,
    updatedAt: Date.now(),
  }
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const num = (v: unknown, def: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)

function sanitizeWorld(v: unknown): WorldProgress {
  const w = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    bones: isStrArr(w.bones) ? [...new Set(w.bones)] : [],
    cookies: isStrArr(w.cookies) ? [...new Set(w.cookies)] : [],
    missions: isStrArr(w.missions) ? [...new Set(w.missions)] : [],
    secrets: isStrArr(w.secrets) ? [...new Set(w.secrets)] : [],
    checkpoint: typeof w.checkpoint === 'string' ? w.checkpoint : null,
    bestScore: num(w.bestScore, 0, 0, 1e9),
    completed: bool(w.completed, false),
  }
}

/** Valida y migra cualquier objeto a un SaveData correcto. Lanza si no es un objeto. */
export function sanitize(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('Guardado no válido')
  const r = raw as Record<string, unknown>
  const def = defaultSave()
  // Migración v1 -> v2: la v1 guardaba "bones" de forma plana para el parque
  if (r.version === 1 && isStrArr(r.bones)) {
    r.worlds = { park: { bones: r.bones } }
  }
  const s = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>
  const worldsRaw = (r.worlds && typeof r.worlds === 'object' ? r.worlds : {}) as Record<string, unknown>
  const unlocked = isStrArr(r.unlocked) ? (r.unlocked.filter((w) => (WORLD_IDS as string[]).includes(w)) as WorldId[]) : ['park' as WorldId]
  if (!unlocked.includes('park')) unlocked.unshift('park')
  const q = s.quality
  return {
    version: SAVE_VERSION,
    unlocked,
    worlds: {
      park: sanitizeWorld(worldsRaw.park),
      city: sanitizeWorld(worldsRaw.city),
      beach: sanitizeWorld(worldsRaw.beach),
    },
    settings: {
      musicVolume: num(s.musicVolume, def.settings.musicVolume, 0, 1),
      sfxVolume: num(s.sfxVolume, def.settings.sfxVolume, 0, 1),
      musicMuted: bool(s.musicMuted, false),
      sfxMuted: bool(s.sfxMuted, false),
      quality: q === 'low' || q === 'medium' || q === 'high' ? q : def.settings.quality,
      sensitivity: num(s.sensitivity, 1, 0.2, 3),
      invertY: bool(s.invertY, false),
      showFps: bool(s.showFps, false),
    },
    legendaryCollar: bool(r.legendaryCollar, false),
    updatedAt: num(r.updatedAt, Date.now(), 0, 9e15),
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export interface LoadResult {
  data: SaveData
  recovered: boolean
}

export function loadSave(): LoadResult {
  const st = storage()
  if (!st) return { data: defaultSave(), recovered: false }
  for (const [key, recovered] of [[KEY, false], [BACKUP_KEY, true]] as const) {
    try {
      const txt = st.getItem(key)
      if (!txt) continue
      return { data: sanitize(JSON.parse(txt)), recovered }
    } catch {
      // datos corruptos: probamos con la copia de seguridad
    }
  }
  const hadSomething = (() => { try { return !!st.getItem(KEY) } catch { return false } })()
  return { data: defaultSave(), recovered: hadSomething }
}

let pending: ReturnType<typeof setTimeout> | null = null

export function writeSave(data: SaveData, immediate = false) {
  const st = storage()
  if (!st) return
  const doWrite = () => {
    pending = null
    try {
      const prev = st.getItem(KEY)
      if (prev) {
        try { JSON.parse(prev); st.setItem(BACKUP_KEY, prev) } catch { /* el anterior estaba roto */ }
      }
      st.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION, updatedAt: Date.now() }))
    } catch {
      // cuota llena o almacenamiento bloqueado: el juego sigue funcionando sin guardar
    }
  }
  if (pending) clearTimeout(pending)
  if (immediate) doWrite()
  else pending = setTimeout(doWrite, 250)
}

export function clearSave() {
  const st = storage()
  try { st?.removeItem(KEY); st?.removeItem(BACKUP_KEY) } catch { /* nada */ }
}
