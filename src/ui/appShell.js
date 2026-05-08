import { DEFAULT_LEVEL } from '../defaultLevel.js'
import { params } from '../config/runtimeParams.js'
import { resetPhysicsParamsToDefaults, savePhysicsConfigToStorage } from '../config/physicsStore.js'
import { clearStoredLevel, clone } from '../level/levelStore.js'
import { formatTime } from '../utils/time.js'

let appRoot = null

export function createAppShell(app) {
  appRoot = app
  appRoot.innerHTML = `
    <div class="game-shell">
      <div class="quick-controls">
        <button id="quick-serve-ball">Serve Ball</button>
        <button id="toggle-tuning">Tuning</button>
      </div>
      <div class="toolbar">
        <button id="mode-toggle">Edit Mode</button>
        <button id="reset-layout">Reset SVG Layout</button>
        <button id="reset-physics">Reset Physics</button>
        <button id="reset-score">Reset Score</button>
        <button id="serve-ball">Serve Ball</button>
        <button id="rotate-left">Rotate -5</button>
        <button id="rotate-right">Rotate +5</button>
        <span id="selected-name">No selection</span>
      </div>
      <div class="game-row">
        <div id="game-container"></div>
        <div class="editor-column">
          <section class="json-panel">
            <div class="json-panel-header">
              <strong>Layout JSON</strong>
              <span id="layout-json-state">ready</span>
            </div>
            <textarea id="layout-json" spellcheck="false" readonly></textarea>
          </section>
          <section class="json-panel">
            <div class="json-panel-header">
              <strong>Physics JSON</strong>
              <span id="physics-json-state">ready</span>
            </div>
            <textarea id="physics-json" spellcheck="false" readonly></textarea>
          </section>
        </div>
      </div>
      <div class="touch-controls">
        <button id="left-flip">Left Flipper</button>
        <button id="right-flip">Right Flipper</button>
      </div>
      <div id="status-line">Play Mode</div>
    </div>
  `
  appRoot.classList.remove('tuning-open')
}

export function setTuningOpen(isOpen) {
  appRoot?.classList.toggle('tuning-open', isOpen)
  const toggleButton = document.querySelector('#toggle-tuning')
  if (toggleButton) {
    toggleButton.textContent = isOpen ? 'Close Tuning' : 'Tuning'
  }
  if (window.physicsPane) {
    window.physicsPane.element.classList.toggle('is-hidden', !isOpen)
  }
}

export function isTuningOpen() {
  return Boolean(appRoot?.classList.contains('tuning-open'))
}

export function bindAppControls(scene) {
  document.querySelector('#quick-serve-ball').onclick = () => {
    scene.serveBall()
  }
  document.querySelector('#toggle-tuning').onclick = () => {
    setTuningOpen(!isTuningOpen())
  }
  document.querySelector('#mode-toggle').onclick = () => {
    scene.setMode(scene.mode === 'play' ? 'edit' : 'play')
  }
  document.querySelector('#reset-layout').onclick = () => {
    scene.level = clone(DEFAULT_LEVEL)
    scene.indexLevelObjects()
    clearStoredLevel()
    scene.selectedName = null
    scene.rebuildForMode()
    scene.syncTextarea()
    scene.updateSelectionUi()
    scene.setStatus('Reset to SVG layout')
  }
  document.querySelector('#reset-physics').onclick = () => {
    resetPhysicsParamsToDefaults(params)
    savePhysicsConfigToStorage(params)
    window.physicsPane?.refresh()
    scene.syncPhysicsTextarea()
    scene.setJsonState('physics', `defaults ${formatTime()}`)
    scene.setStatus('Physics reset to defaults')
    scene.onTuningChanged()
    if (scene.mode === 'play') {
      scene.rebuildPlayBodies()
    }
  }
  document.querySelector('#serve-ball').onclick = () => {
    scene.serveBall()
  }
  document.querySelector('#reset-score').onclick = () => {
    scene.sessionGoals = 0
    scene.updateSessionScoreStatus()
  }
  document.querySelector('#rotate-left').onclick = () => scene.rotateSelected(-5)
  document.querySelector('#rotate-right').onclick = () => scene.rotateSelected(5)
}
