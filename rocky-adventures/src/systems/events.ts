// Bus de eventos ligero para desacoplar jugabilidad, audio, partículas e interfaz.

export type GameEvent =
  | { type: 'bark'; x: number; y: number; z: number }
  | { type: 'sniff'; x: number; y: number; z: number }
  | { type: 'jump' }
  | { type: 'land'; strength: number; surface: Surface }
  | { type: 'step'; surface: Surface; run: boolean }
  | { type: 'collect'; kind: 'bone' | 'cookie' | 'shell'; x: number; y: number; z: number }
  | { type: 'secret' }
  | { type: 'checkpoint'; x: number; y: number; z: number }
  | { type: 'hurt' }
  | { type: 'stomp'; x: number; y: number; z: number }
  | { type: 'break'; x: number; y: number; z: number }
  | { type: 'splash'; x: number; y: number; z: number }
  | { type: 'mission' }
  | { type: 'gate' }
  | { type: 'victory' }
  | { type: 'dig'; x: number; y: number; z: number }
  | { type: 'bell'; note: number }
  | { type: 'squirrel' }
  | { type: 'skid' }
  | { type: 'shake' }

export type Surface = 'grass' | 'wood' | 'sand' | 'stone' | 'water'

type Listener = (e: GameEvent) => void
const listeners = new Set<Listener>()

export function emit(e: GameEvent) {
  listeners.forEach((l) => l(e))
}

export function on(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
