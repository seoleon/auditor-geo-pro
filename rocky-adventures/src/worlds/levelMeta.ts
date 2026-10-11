// Metadatos de cada mundo: nombres, objetivos y misiones (sin dependencias de Three.js).
import type { WorldId } from '../systems/save'

export interface MissionMeta {
  id: string
  title: string
  description: string
  reward: string
  /** Objetivo numérico (si la misión tiene contador). */
  count?: number
}

export interface LevelMeta {
  id: WorldId
  name: string
  subtitle: string
  bonesRequired: number
  totalBones: number
  totalCookies: number
  collectibleName: string
  collectibleNamePlural: string
  goal: string
  intro: string
  missions: MissionMeta[]
  next: WorldId | null
  color: string
}

export const LEVEL_META: Record<WorldId, LevelMeta> = {
  park: {
    id: 'park',
    name: 'El Parque Encantado',
    subtitle: 'Mundo 1',
    bonesRequired: 10,
    totalBones: 10,
    totalCookies: 16,
    collectibleName: 'galleta',
    collectibleNamePlural: 'galletas',
    goal: 'Encuentra 10 huesos dorados y abre la Puerta de las Huellas en lo alto de la colina.',
    intro: '¡Diez huesos dorados se han esparcido por el parque! Encuéntralos y abre la Puerta de las Huellas.',
    missions: [
      { id: 'park-squirrels', title: 'Ardillas traviesas', description: 'Ladra (F) a las 3 ardillas que han robado las bellotas.', reward: 'Galleta dorada + 1500 pts', count: 3 },
      { id: 'park-ball', title: '¡Gol de Rocky!', description: 'Empuja la pelota roja hasta la portería del parque infantil.', reward: 'Hueso dorado' },
      { id: 'park-bells', title: 'Las campanas del jardín', description: 'Ladra junto a las campanas de la más pequeña a la más grande.', reward: 'Abre el jardín secreto', count: 3 },
    ],
    next: 'city',
    color: '#7bd36b',
  },
  city: {
    id: 'city',
    name: 'La Ciudad de los Perros',
    subtitle: 'Mundo 2',
    bonesRequired: 8,
    totalBones: 8,
    totalCookies: 14,
    collectibleName: 'galleta',
    collectibleNamePlural: 'galletas',
    goal: 'Reúne 8 huesos dorados y recoge la Medalla de la Ciudad en la plaza de la estatua.',
    intro: 'La ciudad de los perros te espera: ayuda a los vecinos, sube a las azoteas y encuentra 8 huesos.',
    missions: [
      { id: 'city-puppies', title: 'Cachorros perdidos', description: 'Encuentra a los 3 cachorros perdidos y habla con ellos (E).', reward: 'Hueso dorado', count: 3 },
      { id: 'city-rooftops', title: 'Rey de las azoteas', description: 'Llega a la bandera de la azotea más alta.', reward: 'Hueso dorado' },
      { id: 'city-delivery', title: 'El periódico de Lola', description: 'Recoge el periódico (E) y llévaselo a Lola en la panadería.', reward: 'Hueso dorado' },
    ],
    next: 'beach',
    color: '#ff9f43',
  },
  beach: {
    id: 'beach',
    name: 'La Playa del Tesoro',
    subtitle: 'Mundo 3',
    bonesRequired: 8,
    totalBones: 8,
    totalCookies: 12,
    collectibleName: 'concha',
    collectibleNamePlural: 'conchas',
    goal: 'Consigue 8 huesos dorados y abre el cofre de la cueva: dentro está el Collar Legendario.',
    intro: 'Dicen que el Collar Legendario de Rocky descansa en un cofre escondido en la cueva de la playa…',
    missions: [
      { id: 'beach-crabs', title: 'Cangrejos gruñones', description: 'Salta sobre 4 cangrejos gruñones.', reward: 'Hueso dorado', count: 4 },
      { id: 'beach-lighthouse', title: 'Enciende el faro', description: 'Cruza los islotes y enciende el faro (E).', reward: 'Hueso dorado' },
      { id: 'beach-shells', title: 'Coleccionista de conchas', description: 'Recoge las 12 conchas de la playa.', reward: '2000 pts', count: 12 },
    ],
    next: null,
    color: '#4fc3f7',
  },
}
