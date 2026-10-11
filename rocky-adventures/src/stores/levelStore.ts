// Estado de sesión del nivel activo (no persistente): cajas rotas, agujeros excavados,
// enemigos derrotados, puzles resueltos. Se reinicia al entrar o reiniciar un mundo.
import { create } from 'zustand'

interface LevelState {
  broken: Set<string>
  dug: Set<string>
  revealed: Set<string>
  defeated: Set<string>
  flags: Record<string, boolean | number>
  breakCrate: (id: string) => void
  dig: (id: string) => void
  reveal: (id: string) => void
  defeat: (id: string) => void
  setFlag: (k: string, v: boolean | number) => void
  reset: () => void
}

export const useLevel = create<LevelState>((set, get) => ({
  broken: new Set(),
  dug: new Set(),
  revealed: new Set(),
  defeated: new Set(),
  flags: {},
  breakCrate: (id) => set({ broken: new Set(get().broken).add(id) }),
  dig: (id) => set({ dug: new Set(get().dug).add(id) }),
  reveal: (id) => { if (!get().revealed.has(id)) set({ revealed: new Set(get().revealed).add(id) }) },
  defeat: (id) => set({ defeated: new Set(get().defeated).add(id) }),
  setFlag: (k, v) => set({ flags: { ...get().flags, [k]: v } }),
  reset: () => set({ broken: new Set(), dug: new Set(), revealed: new Set(), defeated: new Set(), flags: {} }),
}))
