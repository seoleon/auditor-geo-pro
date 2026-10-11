// Interfaz durante la partida: huesos, galletas, vidas, objetivo, barra de progreso, misiones,
// indicaciones contextuales y mensajes.
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../stores/gameStore'
import { LEVEL_META } from '../worlds/levelMeta'
import { input } from '../systems/input'
import { BoneIcon, CookieIcon, HeartIcon, ShellIcon } from './icons'

function usePop(value: number) {
  const [pop, setPop] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (value > prev.current) { setPop(true); const t = setTimeout(() => setPop(false), 450); prev.current = value; return () => clearTimeout(t) }
    prev.current = value
  }, [value])
  return pop
}

export function HUD() {
  const g = useGame()
  const meta = LEVEL_META[g.world]
  const p = g.save.worlds[g.world]
  const bonePop = usePop(p.bones.length)
  const cookiePop = usePop(p.cookies.length)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const f = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', f)
    return () => document.removeEventListener('pointerlockchange', f)
  }, [])
  const progress = Math.min(1, p.bones.length / meta.bonesRequired)
  return (
    <div className="hud">
      <div className="hud-tl">
        <div className={'chip' + (bonePop ? ' pop' : '')} data-testid="hud-bones"><span className="icon"><BoneIcon /></span>{p.bones.length}/{meta.totalBones}</div>
        <div className={'chip' + (cookiePop ? ' pop' : '')} data-testid="hud-cookies"><span className="icon">{g.world === 'beach' ? <ShellIcon /> : <CookieIcon />}</span>{p.cookies.length}/{meta.totalCookies}</div>
        <div className="hearts">{Array.from({ length: g.maxHealth }, (_, i) => <HeartIcon key={i} className={'heart' + (i < g.health ? '' : ' off')} />)}</div>
      </div>
      <div className="hud-top">
        <div className="objective" data-testid="hud-objective"><b>{meta.name}</b> · {g.objective}</div>
        <div className="progress" title="Progreso de huesos"><div style={{ width: `${progress * 100}%` }} /></div>
      </div>
      <div className="hud-tr">
        {meta.missions.map((m) => {
          const done = p.missions.includes(m.id)
          const prog = m.id === 'beach-shells' ? p.cookies.length : g.missionProgress[m.id]
          return (
            <div key={m.id} className={'mission' + (done ? ' done' : '')}>
              <div className="m-title"><span>{done ? '✔ ' : '◆ '}{m.title}</span>{!done && typeof prog === 'number' && m.count && <span>{prog}/{m.count}</span>}</div>
              {!done && <div className="m-desc">{m.description}</div>}
            </div>
          )
        })}
      </div>
      {g.hint && <div className="hud-hint" data-testid="hud-hint">{g.hint}</div>}
      <div className="toasts">{g.toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
      {!locked && !input.usingGamepad && <div className="lock-hint">Haz clic en la escena para controlar la cámara con el ratón</div>}
      <div className="hud-bl">WASD mover · ESPACIO saltar · SHIFT correr · F ladrar · C olfatear · E interactuar · ESC pausa</div>
      {g.save.settings.showFps && <div className="hud-fps">{g.fps} FPS</div>}
    </div>
  )
}
