// Pantallas de menú: inicio, mapa de mundos, controles, opciones, pausa, victoria, derrota y carga.
import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../stores/gameStore'
import { LEVEL_META } from '../worlds/levelMeta'
import { WORLD_IDS, type WorldId } from '../systems/save'
import { audio } from '../audio/audioEngine'
import { BoneIcon, CookieIcon, PawIcon, ShellIcon } from './icons'

const click = () => audio.unlock()

// ----------------------------------------------------------------------------- inicio
export function MainMenu() {
  const g = useGame()
  const anyProgress = WORLD_IDS.some((w) => g.save.worlds[w].bones.length > 0 || g.save.worlds[w].completed)
  useEffect(() => {
    const unlockOnce = () => { audio.unlock(); audio.menuMusic() }
    window.addEventListener('pointerdown', unlockOnce, { once: true })
    window.addEventListener('keydown', unlockOnce, { once: true })
    return () => { window.removeEventListener('pointerdown', unlockOnce); window.removeEventListener('keydown', unlockOnce) }
  }, [])
  return (
    <div className="screen menu">
      <div className="title-wrap">
        <h1 className="title-main">ROCKY<br />ADVENTURES</h1>
        <div className="title-sub">EL REINO DE LAS HUELLAS</div>
      </div>
      <div className="menu-buttons">
        <button className="btn" data-testid="btn-play" onClick={() => { click(); g.startWorld(g.continueWorld()) }}>{anyProgress ? 'CONTINUAR' : 'JUGAR'}</button>
        <button className="btn secondary" data-testid="btn-worlds" onClick={() => { click(); g.setScreen('worldSelect') }}>SELECCIONAR MUNDO</button>
        <button className="btn ghost" data-testid="btn-controls" onClick={() => { click(); g.openSubmenu('controls') }}>CONTROLES</button>
        <button className="btn ghost" data-testid="btn-options" onClick={() => { click(); g.openSubmenu('options') }}>OPCIONES</button>
      </div>
      <div className="menu-footer">
        {g.saveRecovered && <div style={{ color: '#ffb46b', marginBottom: 6 }}>Se encontró un guardado dañado y se recuperó la última copia válida.</div>}
        Un juego original con Rocky, el bulldog francés atigrado · Gráficos, música y sonidos generados por código
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- mapa de mundos
const MAP_POS: Record<WorldId, [number, number]> = { park: [20, 62], city: [52, 34], beach: [82, 64] }

export function WorldMap() {
  const g = useGame()
  return (
    <div className="screen dim">
      <div className="map">
        <svg viewBox="0 0 160 90" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fd7ff" /><stop offset="1" stopColor="#2f8fd6" /></linearGradient>
            <radialGradient id="isle"><stop offset="0" stopColor="#9be27a" /><stop offset="1" stopColor="#4fa04a" /></radialGradient>
          </defs>
          <rect width="160" height="90" fill="url(#sea)" />
          {Array.from({ length: 30 }, (_, i) => <path key={i} d={`M${(i * 37) % 160} ${(i * 23) % 90} q3 -2 6 0`} stroke="#ffffff55" strokeWidth=".6" fill="none" />)}
          <ellipse cx="34" cy="57" rx="30" ry="22" fill="#f3e3a6" /><ellipse cx="33" cy="55" rx="27" ry="19" fill="url(#isle)" />
          <ellipse cx="84" cy="32" rx="30" ry="18" fill="#e9dcc0" /><ellipse cx="83" cy="30" rx="27" ry="15" fill="#c8ccd6" />
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x={64 + (i % 7) * 6} y={20 + Math.floor(i / 7) * 10 - (i % 3) * 3} width="4.5" height={6 + (i % 3) * 3} fill={['#ff9f43', '#ffd23f', '#ff6b9a', '#5ec8ff'][i % 4]} rx=".6" />)}
          <ellipse cx="132" cy="58" rx="26" ry="20" fill="#ffe6a6" /><ellipse cx="134" cy="56" rx="18" ry="13" fill="#f7d58a" />
          {[[24, 50], [30, 60], [40, 52], [18, 58], [44, 62]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#2f7a35" />)}
          {[[126, 50], [140, 62], [132, 64]].map(([x, y], i) => <g key={i}><rect x={x} y={y - 6} width=".8" height="6" fill="#8a5a2b" /><circle cx={x + .4} cy={y - 6} r="2.5" fill="#3f9a3a" /></g>)}
          <path d="M34 57 C 50 50, 60 30, 84 32 S 120 55, 132 58" stroke="#fff" strokeWidth="1.4" strokeDasharray="0.1 3.2" strokeLinecap="round" fill="none" />
        </svg>
        {WORLD_IDS.map((w) => {
          const meta = LEVEL_META[w]
          const prog = g.save.worlds[w]
          const unlocked = g.save.unlocked.includes(w)
          const [x, y] = MAP_POS[w]
          return (
            <button key={w} className="world-card" data-testid={`world-${w}`} disabled={!unlocked} style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => { click(); g.startWorld(w) }}>
              {prog.completed && <div className="wc-badge">¡Completado!</div>}
              <div className="wc-sub">{meta.subtitle}</div>
              <div className="wc-name">{meta.name}</div>
              {unlocked ? (
                <div className="wc-stats">
                  <span><BoneIcon size={20} /> {prog.bones.length}/{meta.totalBones}</span>
                  <span>{w === 'beach' ? <ShellIcon size={20} /> : <CookieIcon size={20} />} {prog.cookies.length}/{meta.totalCookies}</span>
                  <span>★ {prog.bestScore}</span>
                </div>
              ) : <div className="wc-lock">🔒<div style={{ fontSize: 14 }}>Completa el mundo anterior</div></div>}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <button className="btn ghost" onClick={() => g.setScreen('menu')}>VOLVER</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- controles
export function ControlsScreen() {
  const g = useGame()
  const rows: [string, string][] = [
    ['W A S D', 'Mover a Rocky'], ['Ratón', 'Girar la cámara (clic para capturar)'], ['Rueda', 'Acercar / alejar cámara'],
    ['ESPACIO', 'Saltar (mantén para saltar más alto)'], ['SHIFT', 'Correr (acelera al mantenerlo)'], ['E', 'Interactuar / excavar / leer'],
    ['F', 'Ladrar (asusta, aturde enemigos, rompe cajas, toca campanas)'], ['C', 'Agacharse y olfatear pistas'], ['ESC', 'Pausa'],
  ]
  const pad: [string, string][] = [['Stick izq.', 'Mover'], ['Stick der.', 'Cámara'], ['A', 'Saltar'], ['B', 'Ladrar'], ['X', 'Interactuar'], ['Y', 'Olfatear'], ['RB / RT', 'Correr'], ['LB / LT', 'Zoom'], ['Start', 'Pausa']]
  return (
    <div className="screen dim">
      <div className="panel">
        <h2>Controles</h2>
        <h3>Teclado y ratón</h3>
        <div className="keys">{rows.map(([k, d]) => <div className="key-row" key={k}><span className="kbd">{k}</span>{d}</div>)}</div>
        <h3>Mando (compatible con Xbox / PlayStation)</h3>
        <div className="keys">{pad.map(([k, d]) => <div className="key-row" key={k}><span className="kbd">{k}</span>{d}</div>)}</div>
        <h3>Trucos de Rocky</h3>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          Salta encima de los enemigos para derrotarlos, o ládrales para aturdirlos. Si te quedas cerca de un borde al saltar, Rocky se impulsará para subirse.
          Olfatea (C) con frecuencia: el rastro dorado señala premios ocultos y huesos enterrados. Si Rocky se queda quieto un rato… ¡se sienta y acaba echándose una siesta!
        </p>
      </div>
      <button className="btn ghost" onClick={() => g.closeSubmenu()}>VOLVER</button>
    </div>
  )
}

// ----------------------------------------------------------------------------- opciones
export function OptionsScreen() {
  const g = useGame()
  const s = g.save.settings
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="screen dim">
      <div className="panel" style={{ width: 640 }}>
        <h2>Opciones</h2>
        <div className="opt-row"><span>Música</span><span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => g.updateSettings({ musicVolume: +e.target.value })} />
          <button className={'toggle' + (!s.musicMuted ? ' on' : '')} aria-label="Música activada" onClick={() => g.updateSettings({ musicMuted: !s.musicMuted })} /></span></div>
        <div className="opt-row"><span>Efectos de sonido</span><span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <input type="range" min={0} max={1} step={0.05} value={s.sfxVolume} onChange={(e) => g.updateSettings({ sfxVolume: +e.target.value })} />
          <button className={'toggle' + (!s.sfxMuted ? ' on' : '')} aria-label="Efectos activados" onClick={() => g.updateSettings({ sfxMuted: !s.sfxMuted })} /></span></div>
        <div className="opt-row"><span>Calidad gráfica</span>
          <span className="seg">{(['low', 'medium', 'high'] as const).map((q) => (
            <button key={q} className={s.quality === q ? 'on' : ''} data-testid={`q-${q}`} onClick={() => g.updateSettings({ quality: q })}>{q === 'low' ? 'BAJO' : q === 'medium' ? 'MEDIO' : 'ALTO'}</button>
          ))}</span></div>
        <div className="opt-row"><span>Sensibilidad de cámara</span><input type="range" min={0.3} max={2.5} step={0.1} value={s.sensitivity} onChange={(e) => g.updateSettings({ sensitivity: +e.target.value })} /></div>
        <div className="opt-row"><span>Invertir eje vertical</span><button className={'toggle' + (s.invertY ? ' on' : '')} onClick={() => g.updateSettings({ invertY: !s.invertY })} /></div>
        <div className="opt-row"><span>Mostrar FPS</span><button className={'toggle' + (s.showFps ? ' on' : '')} onClick={() => g.updateSettings({ showFps: !s.showFps })} /></div>
        <div className="opt-row"><span>Borrar todo el progreso</span>
          {confirm ? <span style={{ display: 'flex', gap: 10 }}><button className="btn danger small" onClick={() => { g.resetProgress(); setConfirm(false) }}>Sí, borrar</button><button className="btn ghost small" onClick={() => setConfirm(false)}>No</button></span>
            : <button className="btn danger small" onClick={() => setConfirm(true)}>Borrar</button>}
        </div>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 0 }}>BAJO: sin posprocesado, menos hierba y sombras más simples. MEDIO: equilibrado (recomendado). ALTO: oclusión ambiental, más vegetación y pelo con volumen. La resolución se adapta sola si bajan los FPS.</p>
      </div>
      <button className="btn ghost" onClick={() => g.closeSubmenu()}>VOLVER</button>
    </div>
  )
}

// ----------------------------------------------------------------------------- pausa
export function PauseMenu() {
  const g = useGame()
  return (
    <div className="screen dim">
      <h2 className="victory-title" style={{ fontSize: 72 }}>PAUSA</h2>
      <div className="menu-buttons">
        <button className="btn" data-testid="btn-resume" onClick={() => g.setScreen('playing')}>CONTINUAR</button>
        <button className="btn secondary" onClick={() => g.restartFromCheckpoint()}>VOLVER AL PUNTO DE CONTROL</button>
        <button className="btn secondary" data-testid="btn-restart" onClick={() => g.restartWorld()}>REINICIAR NIVEL</button>
        <button className="btn ghost" onClick={() => g.openSubmenu('controls')}>CONTROLES</button>
        <button className="btn ghost" onClick={() => g.openSubmenu('options')}>OPCIONES</button>
        <button className="btn ghost" onClick={() => g.setScreen('worldSelect')}>MAPA DE MUNDOS</button>
        <button className="btn ghost" data-testid="btn-mainmenu" onClick={() => { g.setScreen('menu'); audio.menuMusic() }}>MENÚ PRINCIPAL</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- victoria
export function VictoryScreen() {
  const g = useGame()
  const meta = LEVEL_META[g.world]
  const p = g.save.worlds[g.world]
  const score = p.bones.length * 1000 + p.cookies.length * 250 + p.missions.length * 1500 + p.secrets.length * 500 + g.enemiesDefeated * 200
  const confetti = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 3, dur: 3 + Math.random() * 3, color: ['#ffd23f', '#ff6b9a', '#4fb8ff', '#3ddc84', '#b388eb'][i % 5],
  })), [])
  const final = g.world === 'beach'
  return (
    <div className="screen dim">
      <div className="confetti">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />)}</div>
      <h1 className="victory-title">{final ? '¡EL COLLAR LEGENDARIO!' : '¡MUNDO COMPLETADO!'}</h1>
      <div className="panel" style={{ minWidth: 520 }}>
        <h2>{meta.name}</h2>
        {final && <p style={{ textAlign: 'center', fontSize: 19, marginTop: 0 }}>Rocky luce ahora su Collar Legendario en todos los mundos. ¡El Reino de las Huellas está a salvo!</p>}
        <div className="stats">
          <div>Huesos dorados <b>{p.bones.length}/{meta.totalBones}</b></div>
          <div>{meta.collectibleNamePlural[0].toUpperCase() + meta.collectibleNamePlural.slice(1)} <b>{p.cookies.length}/{meta.totalCookies}</b></div>
          <div>Misiones <b>{p.missions.length}/{meta.missions.length}</b></div>
          <div>Secretos <b>{p.secrets.length}</b></div>
          <div>Enemigos <b>{g.enemiesDefeated}</b></div>
          <div>Puntuación <b>{score}</b></div>
          <div>Mejor puntuación <b>{Math.max(score, p.bestScore)}</b></div>
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {meta.next && <button className="btn" data-testid="btn-next" onClick={() => g.startWorld(meta.next!)}>SIGUIENTE MUNDO</button>}
          <button className="btn secondary" onClick={() => g.setScreen('playing')}>SEGUIR EXPLORANDO</button>
          <button className="btn ghost" onClick={() => g.setScreen('worldSelect')}>MAPA</button>
        </div>
      </div>
    </div>
  )
}

export function GameOverScreen() {
  const g = useGame()
  return (
    <div className="screen dim">
      <h1 className="victory-title" style={{ fontSize: 64 }}>¡Uy! Rocky necesita una siesta</h1>
      <p style={{ fontSize: 20 }}>Tus huesos y galletas recogidos siguen guardados.</p>
      <div className="menu-buttons">
        <button className="btn" data-testid="btn-retry" onClick={() => g.restartFromCheckpoint()}>VOLVER AL PUNTO DE CONTROL</button>
        <button className="btn ghost" onClick={() => g.setScreen('menu')}>MENÚ PRINCIPAL</button>
      </div>
    </div>
  )
}

const TIPS = [
  'Pulsa C para olfatear: un rastro dorado te guía hacia premios y huesos enterrados.',
  'Ladra (F) cerca de una caja para romperla… o salta encima.',
  'Mantén SHIFT: Rocky acelera progresivamente hasta su máxima velocidad.',
  'Si cambias de dirección corriendo, Rocky derrapará. ¡Cuidado con los bordes!',
  'Los puntos de control con farolillo verde guardan tu posición y te curan.',
  'Si Rocky se queda quieto, se sienta… y si esperas, se echa una siesta.',
  'Mantén ESPACIO para saltar más alto; suéltalo pronto para un salto corto.',
]

export function LoadingScreen({ boot }: { boot?: boolean }) {
  const g = useGame()
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const meta = LEVEL_META[g.mountedWorld]
  return (
    <div className="loading">
      <div className="paws">{[0, 1, 2, 3].map((i) => <PawIcon key={i} />)}</div>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 40, color: '#ffcb3d' }}>{boot ? 'ROCKY ADVENTURES' : meta.name}</div>
      <div className="bar"><div style={{ width: `${Math.round(g.loadingProgress * 100)}%` }} /></div>
      <div style={{ opacity: 0.85 }}>{g.loadingLabel || 'Cargando…'}</div>
      <div className="tip">💡 {tip}</div>
    </div>
  )
}
