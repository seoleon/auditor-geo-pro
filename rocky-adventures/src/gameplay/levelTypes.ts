// Tipos de datos de nivel (posiciones de premios, enemigos, plataformas…).
export type V3 = [number, number, number]

export interface BoneDef {
  id: string
  pos: V3
  /** 'buried': hay que olfatear (C) y excavar (E). 'reward': aparece al completar una misión. */
  mode?: 'visible' | 'buried' | 'reward'
  /** Misión que lo desbloquea (mode 'reward'). */
  mission?: string
  hint?: string
}

export interface CookieDef { id: string; pos: V3; mode?: 'visible' | 'buried' | 'reward'; mission?: string }

export interface CheckpointDef { id: string; pos: V3; yaw: number; label?: string }

export interface EnemyDef {
  id: string
  kind: 'chestnut' | 'crab' | 'broom'
  path: V3[]
  speed: number
}

export interface PlatformDef {
  id: string
  from: V3
  to: V3
  size: V3
  period: number
  kind?: 'wood' | 'lily' | 'stone' | 'log'
  phase?: number
}

export interface CrateDef { id: string; pos: V3; contains?: { type: 'bone' | 'cookie'; id: string }; look?: 'crate' | 'sandcastle' }

export interface SecretDef { id: string; pos: V3; radius: number }
