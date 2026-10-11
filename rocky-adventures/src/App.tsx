// Raíz de la aplicación: lienzo 3D + capa de interfaz según la pantalla actual.
import { useEffect } from 'react'
import { GameCanvas } from './components/GameCanvas'
import { useGame } from './stores/gameStore'
import { HUD } from './ui/HUD'
import { ControlsScreen, GameOverScreen, LoadingScreen, MainMenu, OptionsScreen, PauseMenu, VictoryScreen, WorldMap } from './ui/Screens'
import { audio } from './audio/audioEngine'
import { installDebugBridge } from './systems/debug'

export default function App() {
  const screen = useGame((s) => s.screen)
  const sceneReady = useGame((s) => s.sceneReady)
  const settings = useGame((s) => s.save.settings)

  useEffect(() => { audio.setVolumes(settings.musicVolume, settings.sfxVolume, settings.musicMuted, settings.sfxMuted) }, [settings])
  useEffect(() => { installDebugBridge() }, [])
  // salir del bloqueo del ratón al abrir menús; pausar si se pierde el foco jugando
  useEffect(() => {
    if (screen !== 'playing' && document.pointerLockElement) document.exitPointerLock()
    if (screen === 'playing') audio.setWorld(useGame.getState().world)
  }, [screen])
  useEffect(() => {
    const onBlur = () => { if (useGame.getState().screen === 'playing') useGame.getState().setScreen('paused') }
    window.addEventListener('blur', onBlur)
    let wasLocked = false
    const onLock = () => {
      const locked = !!document.pointerLockElement
      if (wasLocked && !locked && useGame.getState().screen === 'playing') useGame.getState().setScreen('paused')
      wasLocked = locked
    }
    document.addEventListener('pointerlockchange', onLock)
    return () => { window.removeEventListener('blur', onBlur); document.removeEventListener('pointerlockchange', onLock) }
  }, [])

  const boot = !sceneReady && screen === 'menu'
  return (
    <>
      <GameCanvas />
      <div className="ui-layer">
        {screen === 'playing' && <HUD />}
        {screen === 'menu' && sceneReady && <MainMenu />}
        {screen === 'worldSelect' && <WorldMap />}
        {screen === 'controls' && <ControlsScreen />}
        {screen === 'options' && <OptionsScreen />}
        {screen === 'paused' && <PauseMenu />}
        {screen === 'victory' && <VictoryScreen />}
        {screen === 'gameover' && <GameOverScreen />}
        {(screen === 'loading' || boot) && <LoadingScreen boot={boot} />}
      </div>
    </>
  )
}
