import './style.css'
import Phaser from 'phaser'
import { ENGINE_PHYSICS_DEFAULTS } from './config/physicsTuning.js'
import { params } from './config/runtimeParams.js'
import { exportPhysicsConfigJson, savePhysicsConfigToStorage } from './config/physicsStore.js'
import { saveStoredLevelJson } from './level/levelStore.js'
import { PinballScene } from './scenes/PinballScene.js'
import { createAppShell, setTuningOpen } from './ui/appShell.js'
import { setupTuningPane } from './ui/tuningPane.js'

const GAME_VIEW_WIDTH = 375
const GAME_VIEW_HEIGHT = 540

const app = document.querySelector('#app')
createAppShell(app)

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_VIEW_WIDTH,
  height: GAME_VIEW_HEIGHT,
  backgroundColor: '#103e23',
  fps: {
    target: ENGINE_PHYSICS_DEFAULTS.targetFps,
    panicMax: ENGINE_PHYSICS_DEFAULTS.panicMax,
    smoothStep: ENGINE_PHYSICS_DEFAULTS.smoothStep,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: params.gravityY },
      positionIterations: ENGINE_PHYSICS_DEFAULTS.positionIterations,
      velocityIterations: ENGINE_PHYSICS_DEFAULTS.velocityIterations,
      constraintIterations: ENGINE_PHYSICS_DEFAULTS.constraintIterations,
      runner: {
        fps: ENGINE_PHYSICS_DEFAULTS.runnerFps,
        maxUpdates: ENGINE_PHYSICS_DEFAULTS.maxSubsteps,
      },
      debug: false,
    },
  },
  scene: PinballScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    orientation: Phaser.Scale.PORTRAIT,
  },
})

const pane = setupTuningPane(params, () => window.pinballScene)
window.physicsPane = pane

setTuningOpen(false)

if (window.pinballScene) {
  window.pinballScene.syncPhysicsTextarea()
} else {
  document.querySelector('#physics-json').value = exportPhysicsConfigJson(params)
}

window.addEventListener('beforeunload', () => {
  if (window.pinballScene) {
    saveStoredLevelJson(window.pinballScene.exportLevelJson())
    savePhysicsConfigToStorage(params)
  }
  game.destroy(true)
  pane.dispose()
})
