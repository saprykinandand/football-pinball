import './style.css'
import Phaser from 'phaser'
import { Pane } from 'tweakpane'
import { DEFAULT_LEVEL } from './defaultLevel.js'
import { DEFAULT_PHYSICS_CONFIG, ENGINE_PHYSICS_DEFAULTS, createDefaultParams } from './config/physicsTuning.js'
import {
  clearStoredLevel,
  clone,
  defaultBallSpawn,
  readStoredLevel,
  saveStoredLevelJson,
  serializeLevel,
} from './level/levelStore.js'
import {
  boundsCenter,
  cleanPoints,
  mirrorPoints,
  pointNearPolygon,
  pointsBounds,
  polygonCenter,
  rotatePoint,
  translatePoints,
} from './level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body
const MatterVertices = Phaser.Physics.Matter.Matter.Vertices
const EDIT_HANDLE_RADIUS = 7
const LAUNCH_BUTTON_IMPULSE_Y = 0.012
const GAME_VIEW_WIDTH = 375
const GAME_VIEW_HEIGHT = 540

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="game-shell">
    <div class="quick-controls">
      <button id="quick-serve-ball">Serve Ball</button>
      <button id="toggle-tuning">Tuning</button>
    </div>
    <div class="toolbar">
      <button id="mode-toggle">Edit Mode</button>
      <button id="save-all">Save All</button>
      <button id="reset-layout">Reset SVG Layout</button>
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
app.classList.remove('tuning-open')

const PHYSICS_STORAGE_KEY = 'football-pinball.physics-config.v1'
const PHYSICS_PARAM_TYPES = Object.fromEntries(
  Object.entries(DEFAULT_PHYSICS_CONFIG).map(([key, value]) => [key, typeof value]),
)

function applyPhysicsConfig(target, source) {
  if (!source || typeof source !== 'object') {
    return false
  }
  let changed = false
  for (const [key, expectedType] of Object.entries(PHYSICS_PARAM_TYPES)) {
    const value = source[key]
    if (typeof value === expectedType) {
      target[key] = value
      changed = true
    }
  }
  return changed
}

function readStoredPhysicsConfig() {
  const raw = localStorage.getItem(PHYSICS_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function exportPhysicsConfigJson(sourceParams) {
  const clean = {}
  for (const key of Object.keys(DEFAULT_PHYSICS_CONFIG)) {
    clean[key] = sourceParams[key]
  }
  return JSON.stringify(clean, null, 2)
}

function savePhysicsConfigToStorage(sourceParams) {
  localStorage.setItem(PHYSICS_STORAGE_KEY, exportPhysicsConfigJson(sourceParams))
}

function resetPhysicsParamsToDefaults() {
  const defaults = createDefaultParams()
  for (const key of Object.keys(DEFAULT_PHYSICS_CONFIG)) {
    params[key] = defaults[key]
  }
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function setTuningOpen(isOpen) {
  app.classList.toggle('tuning-open', isOpen)
  const toggleButton = document.querySelector('#toggle-tuning')
  if (toggleButton) {
    toggleButton.textContent = isOpen ? 'Close Tuning' : 'Tuning'
  }
  if (window.physicsPane) {
    window.physicsPane.element.classList.toggle('is-hidden', !isOpen)
  }
}

const params = createDefaultParams()
applyPhysicsConfig(params, readStoredPhysicsConfig())

function colorToNumber(color) {
  return Number.parseInt(String(color || '#FFFFFF').replace('#', ''), 16)
}

function matterCentroid(points) {
  const center = MatterVertices.centre(cleanPoints(points))
  return { x: center.x, y: center.y }
}

class PinballScene extends Phaser.Scene {
  constructor() {
    super('pinball')
    this.level = readStoredLevel()
    this.mode = 'play'
    this.leftPressed = false
    this.rightPressed = false
    this.screenLeftPressed = false
    this.screenRightPressed = false
    this.selectedName = null
    this.dragState = null
    this.playBodies = []
    this.safetyBodies = []
    this.objectBodies = new Map()
    this.flipperState = new Map()
    this.playerMovementState = new Map()
    this.activeFlipperContacts = new Set()
    this.lastAntiStallKickAt = new Map()
    this.lastContactKickAt = new Map()
    this.lastFlipperKickAt = new Map()
    this.bumperHitEffects = new Map()
    this.characterHitEffects = new Map()
    this.goalkeeperState = null
    this.serveTimer = null
    this.levelSaveTimer = null
    this.servePending = false
    this.ballVisualAngle = 0
    this.launchArrow = null
    this.lastLaunch = null
  }

  create() {
    window.pinballScene = this
    this.cameras.main.setBackgroundColor(0x103e23)
    this.matter.world.setGravity(0, params.gravityY)
    this.applySolverTuning()

    this.layoutGraphics = this.add.graphics()
    this.editGraphics = this.add.graphics()
    this.bindControls()
    this.bindUi()
    this.bindEditInput()
    this.bindPhysicsEvents()
    this.applyGameViewport()
    this.rebuildPlayBodies()
    this.syncTextarea()
    this.syncPhysicsTextarea()
    this.updateModeUi()
  }

  update(_time, delta) {
    if (this.mode === 'play') {
      this.matter.world.engine.gravity.y = params.gravityY
      this.applySolverTuning()
      this.applyBodyTuning()
      this.updateDebugVisibility()
      this.applyFreezeState()
      if (params.freezePhysics) {
        this.freezeBall()
      } else {
        this.updateFlippers()
        this.updatePlayers()
        this.updateGoalkeeper(delta)
        this.updateBall(delta)
      }
    }

    this.drawLevel()
  }

  applySolverTuning() {
    const engine = this.matter.world.engine
    engine.positionIterations = ENGINE_PHYSICS_DEFAULTS.positionIterations
    engine.velocityIterations = ENGINE_PHYSICS_DEFAULTS.velocityIterations
    engine.constraintIterations = ENGINE_PHYSICS_DEFAULTS.constraintIterations
  }

  applyBodyTuning() {
    for (const body of this.playBodies) {
      const kind = body.plugin?.kind
      if (body.plugin?.safety) {
        this.setBodyRestitution(body, this.safetyRestitutionFor(kind))
        continue
      }
      if (kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') {
        this.setBodyRestitution(body, params.bumperRestitution)
      } else if (kind === 'field_base' || kind === 'field_collision' || kind === 'goal_collision') {
        this.setBodyRestitution(body, params.wallRestitution)
      }
    }
  }

  applyFreezeState() {
    if (!this.ballBody || this.ballFrozen === params.freezePhysics) {
      return
    }

    this.ballFrozen = params.freezePhysics
    MatterBody.setStatic(this.ballBody, params.freezePhysics)
    if (!params.freezePhysics) {
      this.applyBallMaterialTuning()
    }
  }

  applyBallMaterialTuning() {
    if (!this.ballBody) {
      return
    }
    this.ballBody.restitution = params.ballRestitution
    this.ballBody.friction = params.ballFriction
    this.ballBody.frictionAir = params.ballFrictionAir
    if (Number.isFinite(params.ballDensity) && params.ballDensity > 0 && this.ballBody.density !== params.ballDensity) {
      MatterBody.setDensity(this.ballBody, params.ballDensity)
    }
  }

  freezeBall() {
    this.applyFreezeState()
    if (!this.ballBody) {
      return
    }
    MatterBody.setVelocity(this.ballBody, { x: 0, y: 0 })
    MatterBody.setAngularVelocity(this.ballBody, 0)
  }

  setBodyRestitution(body, restitution) {
    const parts = body.parts?.length ? body.parts : [body]
    for (const part of parts) {
      part.restitution = restitution
    }
    body.restitution = restitution
  }

  safetyRestitutionFor(kind) {
    if (kind === 'field_base' || kind === 'field_collision' || kind === 'goal_collision') {
      return params.wallRestitution
    }
    return Math.min(params.wallRestitution, 0.5)
  }

  updateDebugVisibility() {
    const shouldDrawDebug = params.showMatterBodies || params.showSafetyBodies
    this.matter.world.drawDebug = shouldDrawDebug
    if (this.matter.world.debugGraphic) {
      this.matter.world.debugGraphic.visible = shouldDrawDebug
    }

    for (const body of this.playBodies) {
      const isSafety = Boolean(body.plugin?.safety)
      this.setBodyDebugVisible(body, isSafety ? params.showSafetyBodies : params.showMatterBodies)
    }
  }

  setBodyDebugVisible(body, visible) {
    const parts = body.parts?.length ? body.parts : [body]
    for (const part of parts) {
      part.render.visible = visible
    }
    body.render.visible = visible
  }

  bindControls() {
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
    })

    const leftButton = document.querySelector('#left-flip')
    const rightButton = document.querySelector('#right-flip')
    leftButton.onpointerdown = () => {
      this.leftPressed = true
    }
    leftButton.onpointerup = () => {
      this.leftPressed = false
    }
    leftButton.onpointerleave = () => {
      this.leftPressed = false
    }
    rightButton.onpointerdown = () => {
      this.rightPressed = true
    }
    rightButton.onpointerup = () => {
      this.rightPressed = false
    }
    rightButton.onpointerleave = () => {
      this.rightPressed = false
    }

    const pointerSides = new Map()
    const clearPointerSide = (pointerId) => {
      const side = pointerSides.get(pointerId)
      if (!side) {
        return
      }
      pointerSides.delete(pointerId)
      this.screenLeftPressed = Array.from(pointerSides.values()).includes('left')
      this.screenRightPressed = Array.from(pointerSides.values()).includes('right')
    }
    this.input.on('pointerdown', (pointer) => {
      if (this.mode !== 'play') {
        return
      }
      const side = pointer.worldX < this.level.width / 2 ? 'left' : 'right'
      pointerSides.set(pointer.id, side)
      if (side === 'left') {
        this.screenLeftPressed = true
      } else {
        this.screenRightPressed = true
      }
    })
    this.input.on('pointerup', (pointer) => {
      clearPointerSide(pointer.id)
    })
    this.input.on('pointerupoutside', (pointer) => {
      clearPointerSide(pointer.id)
    })

    this.input.keyboard.on('keydown-Q', () => this.rotateSelected(-5))
    this.input.keyboard.on('keydown-E', () => this.rotateSelected(5))
    this.input.keyboard.on('keydown-R', () => this.serveBall())
  }

  bindUi() {
    document.querySelector('#quick-serve-ball').onclick = () => {
      this.serveBall()
    }
    document.querySelector('#toggle-tuning').onclick = () => {
      setTuningOpen(!app.classList.contains('tuning-open'))
    }
    document.querySelector('#mode-toggle').onclick = () => {
      this.setMode(this.mode === 'play' ? 'edit' : 'play')
    }
    document.querySelector('#save-all').onclick = () => {
      this.saveAllJson()
    }
    document.querySelector('#reset-layout').onclick = () => {
      this.level = clone(DEFAULT_LEVEL)
      clearStoredLevel()
      this.selectedName = null
      this.rebuildForMode()
      this.syncTextarea()
      this.updateSelectionUi()
      this.setStatus('Reset to SVG layout')
    }
    document.querySelector('#serve-ball').onclick = () => {
      this.serveBall()
    }
    document.querySelector('#rotate-left').onclick = () => this.rotateSelected(-5)
    document.querySelector('#rotate-right').onclick = () => this.rotateSelected(5)
  }

  saveAllJson() {
    const layoutJson = this.exportLevelJson()
    this.cancelPendingLevelSave()
    saveStoredLevelJson(layoutJson)
    savePhysicsConfigToStorage(params)
    this.syncTextarea()
    this.syncPhysicsTextarea()
    this.setJsonState('layout', `saved ${formatTime()}`)
    this.setJsonState('physics', `saved ${formatTime()}`)
    this.setStatus('Layout and physics saved')
  }

  cancelPendingLevelSave() {
    if (!this.levelSaveTimer) {
      return
    }
    this.levelSaveTimer.remove(false)
    this.levelSaveTimer = null
  }

  autosaveLevelSoon() {
    this.syncTextarea()
    this.cancelPendingLevelSave()
    this.levelSaveTimer = this.time.delayedCall(300, () => {
      saveStoredLevelJson(this.exportLevelJson())
      this.setJsonState('layout', `autosaved ${formatTime()}`)
      this.levelSaveTimer = null
    })
  }

  bindEditInput() {
    this.input.on('pointerdown', (pointer) => {
      if (this.mode !== 'edit') {
        return
      }

      const point = { x: pointer.worldX, y: pointer.worldY }
      const selected = this.getSelectedObject()
      const vertexHit = selected?.points ? this.findVertexHit(selected, point) : -1
      if (vertexHit >= 0) {
        this.dragState = { type: 'vertex', name: selected.name, index: vertexHit, last: point }
        return
      }

      const hit = this.findObjectAt(point)
      this.selectedName = hit?.name || null
      this.updateSelectionUi()
      if (!hit) {
        return
      }

      this.dragState = { type: hit.point ? 'point' : 'object', name: hit.name, last: point }
    })

    this.input.on('pointermove', (pointer) => {
      if (this.mode !== 'edit' || !this.dragState || !pointer.isDown) {
        return
      }

      const point = { x: pointer.worldX, y: pointer.worldY }
      const object = this.findObject(this.dragState.name)
      if (!object) {
        return
      }

      if (this.dragState.type === 'vertex') {
        object.points[this.dragState.index] = point
      } else {
        const dx = point.x - this.dragState.last.x
        const dy = point.y - this.dragState.last.y
        this.translateObject(object, dx, dy)
        this.dragState.last = point
      }

      this.afterObjectEdit(object)
    })

    this.input.on('pointerup', () => {
      this.dragState = null
    })
  }

  bindPhysicsEvents() {
    this.matter.world.on('afterupdate', () => {
      if (this.ballBody) {
        this.clampBallVelocity()
      }
    })

    this.matter.world.on('collisionstart', (event) => {
      if (!this.ballBody) {
        return
      }

      for (const pair of event.pairs) {
        const other = this.getOtherBallBody(pair)
        if (!other) {
          continue
        }

        const kind = other.plugin?.kind
        if (kind === 'flipper' && !other.plugin?.safety) {
          this.activeFlipperContacts.add(other.plugin.levelName)
          this.tryKickMovingFlipper(other.plugin.levelName)
        }
        if (kind === 'sensor_goal') {
          this.setStatus('Goal detected')
          this.serveBall()
        } else if (kind === 'sensor_lose') {
          this.setStatus('Lose area detected')
          this.serveBall()
        } else if ((kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') && !other.plugin?.safety) {
          if (this.tryKickContactBody(other)) {
            if (kind === 'bumper') {
              this.markBumperHit(other.plugin?.levelName)
            } else if (kind === 'player' || kind === 'goalkeeper') {
              this.markCharacterHit(other.plugin?.levelName, kind)
            }
          }
        }
      }
    })

    this.matter.world.on('collisionactive', (event) => {
      if (!this.ballBody) {
        return
      }

      for (const pair of event.pairs) {
        const other = this.getOtherBallBody(pair)
        if (other?.plugin?.kind === 'flipper' && !other.plugin?.safety) {
          this.activeFlipperContacts.add(other.plugin.levelName)
          this.tryKickMovingFlipper(other.plugin.levelName)
        } else if (this.shouldApplyAntiStallKick(other)) {
          this.applyAntiStallKick(other)
        }
      }
    })

    this.matter.world.on('collisionend', (event) => {
      if (!this.ballBody) {
        return
      }

      for (const pair of event.pairs) {
        const other = this.getOtherBallBody(pair)
        if (other?.plugin?.kind === 'flipper' && !other.plugin?.safety) {
          this.activeFlipperContacts.delete(other.plugin.levelName)
        }
      }
    })
  }

  getRootBody(body) {
    return body.parent && body.parent !== body ? body.parent : body
  }

  getOtherBallBody(pair) {
    const bodyA = this.getRootBody(pair.bodyA)
    const bodyB = this.getRootBody(pair.bodyB)
    return bodyA === this.ballBody ? bodyB : bodyB === this.ballBody ? bodyA : null
  }

  applyGameViewport() {
    const fieldBase = this.level.objects.find((object) => object.name === 'field_base_symmetrical' && object.points)
      || this.level.objects.find((object) => object.kind === 'field_base' && object.points)
    const bounds = fieldBase?.points ? pointsBounds(fieldBase.points) : { minY: 0, maxY: this.level.height }
    const maxScrollY = Math.max(0, this.level.height - GAME_VIEW_HEIGHT)
    const centeredTop = (bounds.minY + bounds.maxY - GAME_VIEW_HEIGHT) / 2
    const scrollY = Phaser.Math.Clamp(centeredTop, 0, maxScrollY)
    this.cameras.main.setScroll(0, scrollY)
  }

  setMode(mode) {
    this.mode = mode
    if (mode !== 'play') {
      this.screenLeftPressed = false
      this.screenRightPressed = false
    }
    this.selectedName = null
    this.rebuildForMode()
    this.updateModeUi()
    this.updateSelectionUi()
    this.setStatus(mode === 'play' ? 'Play Mode' : 'Edit Mode')
  }

  rebuildForMode() {
    this.applyGameViewport()
    if (this.mode === 'play') {
      this.rebuildPlayBodies()
    } else {
      this.clearPlayBodies()
    }
  }

  rebuildPlayBodies() {
    this.clearPlayBodies()
    this.matter.world.setGravity(0, params.gravityY)
    this.applySolverTuning()
    this.flipperState.clear()
    this.playerMovementState.clear()
    this.objectBodies.clear()
    this.safetyBodies = []
    this.activeFlipperContacts.clear()
    this.lastAntiStallKickAt.clear()
    this.lastContactKickAt.clear()
    this.lastFlipperKickAt.clear()
    this.goalkeeperState = null

    for (const object of this.level.objects) {
      if (!object.points) {
        continue
      }

      if (object.kind === 'field_base') {
        this.objectBodies.set(object.name, this.createEdgeLoop(object, params.wallPadding, {
          restitution: params.wallRestitution,
          safety: true,
        }))
      } else if (object.kind === 'goalkeeper_path') {
        continue
      } else if (object.kind === 'flipper') {
        const body = this.createPolygonBody(object, {
          isStatic: true,
          restitution: 0.36,
          friction: 0.02,
          slop: 0.01,
          removeCollinear: 0.001,
          minimumArea: 1,
        })
        this.alignBodyToSourceBounds(body, object.points)
        const flipperSafetyBodies = this.createOptionalSafetyLoop(object, params.flipperPadding, {
          restitution: 0.28,
          friction: 0.02,
        })
        const anchor = this.findObject(object.anchor)?.point || polygonCenter(object.points)
        this.flipperState.set(object.name, {
          body,
          anchor: clone(anchor),
          length: Math.max(...object.points.map((point) => Phaser.Math.Distance.Between(anchor.x, anchor.y, point.x, point.y))),
          basePosition: clone(body.position),
          baseAngle: body.angle,
          currentAngle: 0,
          lastAngleStep: 0,
          activeAngle: object.side === 'left' ? -0.85 : 0.85,
          swingKicked: false,
          safetyBodies: flipperSafetyBodies.map((safetyBody) => ({
            body: safetyBody,
            basePosition: clone(safetyBody.position),
            baseAngle: safetyBody.angle,
          })),
        })
      } else if (object.kind === 'sensor_goal' || object.kind === 'sensor_lose') {
        this.createPolygonBody(object, {
          isStatic: true,
          isSensor: true,
          restitution: 0,
          friction: 0,
        })
        this.createEdgeLoop(object, Math.max(params.goalPadding, 2), {
          isSensor: true,
          restitution: 0,
          safety: true,
        })
      } else {
        const body = this.createPolygonBody(object, {
          isStatic: true,
          restitution: object.kind === 'bumper' ? params.bumperRestitution : params.wallRestitution,
          friction: 0.02,
        })
        const padding = this.paddingForObject(object)
        let safetyBodies = []
        if (padding > 0) {
          safetyBodies = this.createEdgeLoop(object, padding, {
            restitution: this.safetyRestitutionFor(object.kind),
            friction: 0.02,
            safety: true,
          })
        }
        if (object.kind === 'goalkeeper') {
          this.goalkeeperState = {
            body,
            baseCenter: matterCentroid(object.points),
            direction: 1,
            safetyBodies: safetyBodies.map((safetyBody) => ({
              body: safetyBody,
              basePosition: clone(safetyBody.position),
            })),
          }
        } else if (object.kind === 'player') {
          this.playerMovementState.set(object.name, {
            body,
            baseCenter: matterCentroid(object.points),
            direction: object.side === 'right' ? -1 : 1,
            safetyBodies: safetyBodies.map((safetyBody) => ({
              body: safetyBody,
              basePosition: clone(safetyBody.position),
            })),
          })
        }
      }
    }

    this.createBallBody(this.getBallSpawn())
    this.ballFrozen = null
    this.applyFreezeState()
    this.serveBall()
  }

  clearPlayBodies() {
    this.cancelPendingServe()
    if (this.playBodies.length) {
      this.matter.world.remove(this.playBodies, true)
    }
    this.playBodies = []
    this.safetyBodies = []
    this.objectBodies.clear()
    this.playerMovementState.clear()
    this.activeFlipperContacts.clear()
    this.lastAntiStallKickAt.clear()
    this.bumperHitEffects.clear()
    this.characterHitEffects.clear()
    this.ballFrozen = null
    this.ballBody = null
    this.launchArrow = null
  }

  createPolygonBody(object, options) {
    const {
      removeCollinear = 0.01,
      minimumArea = 10,
      ...bodyOptions
    } = options
    const points = cleanPoints(object.points)
    const center = matterCentroid(points)
    const body = this.matter.add.fromVertices(center.x, center.y, points, {
      label: object.name,
      restitution: params.wallRestitution,
      slop: 0.03,
      ...bodyOptions,
    }, true, removeCollinear, minimumArea)
    this.tagBody(body, object)
    this.playBodies.push(body)
    this.objectBodies.set(object.name, body)
    return body
  }

  alignBodyToSourceBounds(body, sourcePoints) {
    const sourceCenter = boundsCenter(pointsBounds(sourcePoints))
    const bodyCenter = boundsCenter(this.getBodyBounds(body))
    MatterBody.translate(body, {
      x: sourceCenter.x - bodyCenter.x,
      y: sourceCenter.y - bodyCenter.y,
    })
  }

  getBodyBounds(body) {
    const parts = body.parts?.length > 1 ? body.parts.slice(1) : [body]
    const vertices = parts.flatMap((part) => part.vertices)
    return pointsBounds(vertices)
  }

  getBallRadius() {
    return Math.max(this.level.ball.radius || 0, params.ballRadius)
  }

  createBallBody(spawn) {
    const ballRadius = this.getBallRadius()
    this.ballBody = this.matter.add.circle(spawn.x, spawn.y, ballRadius, {
      label: 'ball',
      restitution: params.ballRestitution,
      friction: params.ballFriction,
      frictionAir: params.ballFrictionAir,
      density: params.ballDensity,
      slop: 0.02,
    })
    this.ballBody.circleRadius = ballRadius
    this.playBodies.push(this.ballBody)
    this.applyBallMaterialTuning()
  }

  rebuildBallBody() {
    if (!this.ballBody) {
      return
    }
    this.cancelPendingServe()
    this.matter.world.remove(this.ballBody, true)
    this.playBodies = this.playBodies.filter((body) => body !== this.ballBody)
    this.ballBody = null
    this.ballFrozen = null
    this.createBallBody(this.getBallSpawn())
    this.applyFreezeState()
    this.serveBall()
  }

  paddingForObject(object) {
    if (object.kind === 'field_base' || object.kind === 'field_collision') {
      return params.wallPadding
    }
    if (object.kind === 'goal_collision') {
      return params.goalPadding
    }
    if (object.kind === 'player' || object.kind === 'goalkeeper') {
      return params.playerPadding
    }
    if (object.kind === 'bumper') {
      return params.bumperPadding
    }
    if (object.kind === 'flipper') {
      return params.flipperPadding
    }
    return 0
  }

  createOptionalSafetyLoop(object, padding, options = {}) {
    if (padding <= 0) {
      return []
    }
    return this.createEdgeLoop(object, padding, {
      ...options,
      safety: true,
    })
  }

  createEdgeLoop(object, thickness, options = {}) {
    const { safety = false, ...bodyOptions } = options
    const points = cleanPoints(object.points)
    const bodies = []
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index]
      const end = points[(index + 1) % points.length]
      const length = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y)
      if (length < 1) {
        continue
      }

      const body = this.matter.add.rectangle(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        length,
        thickness,
        {
          label: object.name,
          isStatic: true,
          restitution: params.wallRestitution,
          friction: 0,
          slop: 0.03,
          angle: Math.atan2(end.y - start.y, end.x - start.x),
          ...bodyOptions,
        },
      )
      this.tagBody(body, object, { safety })
      this.playBodies.push(body)
      if (safety) {
        this.safetyBodies.push(body)
      }
      bodies.push(body)
    }
    return bodies
  }

  tagBody(body, object, options = {}) {
    const parts = body.parts?.length ? body.parts : [body]
    for (const part of parts) {
      part.label = object.name
      part.plugin = { levelName: object.name, kind: object.kind, safety: Boolean(options.safety) }
      part.render.lineColor = options.safety ? 0xffb000 : 0x36a3ff
      part.render.lineOpacity = options.safety ? 0.95 : 0.75
      part.render.lineThickness = options.safety ? 1 : 1
      part.render.fillOpacity = 0
    }
    body.plugin = { levelName: object.name, kind: object.kind, safety: Boolean(options.safety) }
    body.render.lineColor = options.safety ? 0xffb000 : 0x36a3ff
    body.render.lineOpacity = options.safety ? 0.95 : 0.75
    body.render.lineThickness = options.safety ? 1 : 1
    body.render.fillOpacity = 0
  }

  updateFlippers() {
    for (const [name, state] of this.flipperState) {
      const held = this.isFlipperHeld(name)
      if (!held) {
        state.swingKicked = false
      }
      const targetAngle = held ? state.activeAngle : 0
      const delta = Phaser.Math.Angle.Wrap(targetAngle - state.currentAngle)
      const angleStep = Phaser.Math.Clamp(delta, -params.flipperSpeed, params.flipperSpeed)
      state.lastAngleStep = angleStep
      state.currentAngle += angleStep
      const nextPosition = rotatePoint(state.basePosition, state.anchor, state.currentAngle)
      MatterBody.setPosition(state.body, nextPosition)
      MatterBody.setAngle(state.body, state.baseAngle + state.currentAngle)
      for (const safety of state.safetyBodies) {
        MatterBody.setPosition(safety.body, rotatePoint(safety.basePosition, state.anchor, state.currentAngle))
        MatterBody.setAngle(safety.body, safety.baseAngle + state.currentAngle)
      }

      const movingIntoBall = held && Math.abs(angleStep) >= params.flipperKickMinAngleStep
      if (movingIntoBall && this.activeFlipperContacts.has(name)) {
        this.tryKickMovingFlipper(name)
      }
    }
  }

  updatePlayers() {
    for (const state of this.playerMovementState.values()) {
      const movement = this.playerMovementOffset(state)
      const nextPosition = {
        x: state.baseCenter.x + movement.x,
        y: state.baseCenter.y + movement.y,
      }

      MatterBody.setPosition(state.body, nextPosition)
      for (const safety of state.safetyBodies) {
        MatterBody.setPosition(safety.body, {
          x: safety.basePosition.x + movement.x,
          y: safety.basePosition.y + movement.y,
        })
      }
    }
  }

  playerMovementOffset(state) {
    if (!params.playerMovementEnabled) {
      return { x: 0, y: 0 }
    }

    const distance = Math.max(0, params.playerMovementDistance)
    const phase = Math.sin(this.time.now * 0.001 * Math.max(0, params.playerMovementSpeed))
    const direction = params.playerMovementParallel ? 1 : state.direction
    const x = phase * distance * direction
    const y = this.playerMovementArcY(phase)
    return { x, y }
  }

  playerMovementArcY(phase) {
    const height = params.playerMovementArcHeight
    if (height === 0) {
      return 0
    }

    return -height * (1 - phase * phase)
  }

  updateGoalkeeper(delta) {
    if (!this.goalkeeperState) {
      return
    }

    const path = this.findObject('path_of_goal_keeper')
    if (!path?.points) {
      return
    }

    const bounds = pointsBounds(path.points)
    const body = this.goalkeeperState.body
    const goalieBounds = pointsBounds(body.vertices)
    const halfWidth = (goalieBounds.maxX - goalieBounds.minX) / 2
    const minX = bounds.minX + halfWidth
    const maxX = bounds.maxX - halfWidth
    const seconds = delta / 1000
    let nextX = body.position.x + this.goalkeeperState.direction * params.goalkeeperSpeed * seconds

    if (nextX > maxX) {
      nextX = maxX
      this.goalkeeperState.direction = -1
    } else if (nextX < minX) {
      nextX = minX
      this.goalkeeperState.direction = 1
    }

    MatterBody.setPosition(body, { x: nextX, y: this.goalkeeperState.baseCenter.y })
    const dx = nextX - this.goalkeeperState.baseCenter.x
    for (const safety of this.goalkeeperState.safetyBodies) {
      MatterBody.setPosition(safety.body, {
        x: safety.basePosition.x + dx,
        y: safety.basePosition.y,
      })
    }
  }

  updateBall(delta) {
    if (!this.ballBody) {
      return
    }

    if (this.servePending) {
      this.resetBallToSpawn()
      return
    }

    this.applyBallMaterialTuning()
    this.updateBallVisualSpin(delta)

    if (this.keys.space.isDown && this.ballBody.position.y > this.level.height - 190) {
      this.ballBody.force.y -= LAUNCH_BUTTON_IMPULSE_Y
    }

    this.clampBallVelocity()

    const margin = this.getBallRadius() * 5
    if (
      this.ballBody.position.x < -margin
      || this.ballBody.position.x > this.level.width + margin
      || this.ballBody.position.y < -margin
      || this.ballBody.position.y > this.level.height + margin
    ) {
      this.serveBall()
    }
  }

  updateBallVisualSpin(delta) {
    const velocity = this.ballBody.velocity
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed < 0.02) {
      return
    }

    const spinDirection = Math.abs(velocity.x) > 0.2 ? Math.sign(velocity.x) : Math.sign(velocity.y || 1)
    const visualSpinRate = 0.01
    this.ballVisualAngle = Phaser.Math.Angle.Wrap(
      this.ballVisualAngle + spinDirection * delta * visualSpinRate,
    )
  }

  clampBallVelocity() {
    const velocity = this.ballBody.velocity
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed <= params.maxBallSpeed) {
      return
    }

    const scale = params.maxBallSpeed / speed
    MatterBody.setVelocity(this.ballBody, {
      x: velocity.x * scale,
      y: velocity.y * scale,
    })
  }

  resetBall() {
    this.serveBall()
  }

  getBallSpawn() {
    const marker = this.findObject('ball_spawn')
    const source = marker?.point || this.level.ball?.spawn || defaultBallSpawn(this.level)
    const spawn = {
      x: Number(source.x),
      y: Number(source.y),
    }

    this.level.ball = this.level.ball || {}
    this.level.ball.spawn = spawn
    if (marker) {
      marker.point = { ...spawn }
    }

    return spawn
  }

  resetBallToSpawn() {
    if (!this.ballBody) {
      return
    }
    const spawn = this.getBallSpawn()
    this.activeFlipperContacts.clear()
    MatterBody.setPosition(this.ballBody, spawn)
    MatterBody.setVelocity(this.ballBody, { x: 0, y: 0 })
    MatterBody.setAngularVelocity(this.ballBody, 0)
    this.ballVisualAngle = 0
  }

  chooseLaunchVector() {
    const minX = Math.min(params.launchXMin, params.launchXMax)
    const maxX = Math.max(params.launchXMin, params.launchXMax)
    const deadZone = Math.max(0, Math.abs(params.launchXDeadZone))
    const canAvoidDeadZone = minX < -deadZone || maxX > deadZone
    let launchX = 0

    for (let attempt = 0; attempt < 24; attempt += 1) {
      launchX = Phaser.Math.FloatBetween(minX, maxX)
      if (!canAvoidDeadZone || Math.abs(launchX) >= deadZone) {
        break
      }
    }

    if (canAvoidDeadZone && Math.abs(launchX) < deadZone) {
      launchX = maxX > deadZone ? deadZone : -deadZone
    }

    const length = Math.hypot(launchX, -1)
    const vector = {
      x: launchX / length,
      y: -1 / length,
    }
    const minForce = Math.min(params.launchForceMin, params.launchForceMax)
    const maxForce = Math.max(params.launchForceMin, params.launchForceMax)

    return {
      vector,
      force: Phaser.Math.FloatBetween(minForce, maxForce),
      launchX,
    }
  }

  serveBall() {
    if (!this.ballBody) {
      return
    }

    this.cancelPendingServe()
    this.resetBallToSpawn()

    const launch = this.chooseLaunchVector()
    this.lastLaunch = launch
    this.servePending = true
    this.launchArrow = params.showLaunchArrow ? this.createLaunchArrow(launch, params.launchDelayMs + 900) : null
    this.setStatus(`Serving: force ${launch.force.toFixed(3)}, x ${launch.launchX.toFixed(3)}`)
    console.info('Serve Ball', {
      force: Number(launch.force.toFixed(4)),
      launchX: Number(launch.launchX.toFixed(4)),
    })

    this.serveTimer = this.time.delayedCall(params.launchDelayMs, () => {
      this.serveTimer = null
      this.servePending = false
      this.applyLaunchImpulse(launch)
    })
  }

  cancelPendingServe() {
    if (this.serveTimer) {
      this.serveTimer.remove(false)
      this.serveTimer = null
    }
    this.servePending = false
  }

  applyLaunchImpulse(launch) {
    if (!this.ballBody) {
      return
    }

    this.resetBallToSpawn()
    if (params.freezePhysics) {
      this.setStatus(`Serve ready: force ${launch.force.toFixed(3)}, x ${launch.launchX.toFixed(3)}`)
      return
    }

    MatterBody.applyForce(this.ballBody, this.ballBody.position, {
      x: launch.vector.x * launch.force,
      y: launch.vector.y * launch.force,
    })
    this.clampBallVelocity()
    this.setStatus(`Launched: force ${launch.force.toFixed(3)}, x ${launch.launchX.toFixed(3)}`)
  }

  createLaunchArrow(launch, lifetimeMs) {
    const start = this.getBallSpawn()
    const length = 78 + launch.force * 1800
    return {
      start,
      end: {
        x: start.x + launch.vector.x * length,
        y: start.y + launch.vector.y * length,
      },
      expiresAt: this.time.now + lifetimeMs,
    }
  }

  contactKickKey(body) {
    return `${body.plugin?.kind || 'body'}:${body.plugin?.levelName || body.id}`
  }

  canKickContactBody(body) {
    const key = this.contactKickKey(body)
    const lastKickAt = this.lastContactKickAt.get(key) || -Infinity
    return this.time.now - lastKickAt >= params.contactKickCooldownMs
  }

  tryKickContactBody(body) {
    if (!this.canKickContactBody(body)) {
      return false
    }

    const impulse = this.impulseForKind(body.plugin?.kind)
    this.lastContactKickAt.set(this.contactKickKey(body), this.time.now)
    this.kickBallFromBody(body, impulse, impulse)
    return true
  }

  canKickFlipper(name) {
    const lastKickAt = this.lastFlipperKickAt.get(name) || -Infinity
    return this.time.now - lastKickAt >= params.flipperKickCooldownMs
  }

  isFlipperHeld(name) {
    if (name.includes('_left_')) {
      return this.leftPressed || this.screenLeftPressed || this.keys.left.isDown || this.keys.a.isDown
    }
    return this.rightPressed || this.screenRightPressed || this.keys.right.isDown || this.keys.d.isDown
  }

  tryKickMovingFlipper(name) {
    if (!this.isFlipperHeld(name) || !this.canKickFlipper(name)) {
      return false
    }

    const state = this.flipperState.get(name)
    if (!state || state.swingKicked) {
      return false
    }

    const motion = Math.abs(state.lastAngleStep || 0)
    if (motion < params.flipperKickMinAngleStep) {
      return false
    }

    const motionScale = Phaser.Math.Clamp(motion / Math.max(params.flipperSpeed, 0.001), 0.2, 1)
    state.swingKicked = true
    this.lastFlipperKickAt.set(name, this.time.now)
    this.kickBallFromFlipper(state, motionScale)
    return true
  }

  kickBallFromFlipper(state, motionScale) {
    if (!this.ballBody) {
      return
    }

    const rx = this.ballBody.position.x - state.anchor.x
    const ry = this.ballBody.position.y - state.anchor.y
    const distanceFromAnchor = Math.max(Math.hypot(rx, ry), 1)
    const swingSign = Math.sign(state.lastAngleStep || 0)
    if (swingSign === 0) {
      return
    }

    let nx = (-ry / distanceFromAnchor) * swingSign
    let ny = (rx / distanceFromAnchor) * swingSign

    if (ny > -0.2) {
      ny = -0.2
    }

    const goalCenter = { x: this.level.width * 0.5, y: this.level.height * 0.2 }
    const gx = goalCenter.x - this.ballBody.position.x
    const gy = goalCenter.y - this.ballBody.position.y
    const goalLength = Math.max(Math.hypot(gx, gy), 1)
    const bias = Phaser.Math.Clamp(params.flipperGoalBias, 0, 0.95)
    nx = nx * (1 - bias) + (gx / goalLength) * bias
    ny = ny * (1 - bias) + (gy / goalLength) * bias

    const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
    nx /= normalizedLength
    ny /= normalizedLength

    const rawTipScale = distanceFromAnchor / Math.max(state.length, 1)
    const tipScale = Phaser.Math.Clamp(
      params.flipperMinTipScale + rawTipScale * params.flipperTipBoost,
      params.flipperMinTipScale,
      1 + params.flipperTipBoost,
    )
    const velocityKick = Math.max(0, params.flipperVelocityKick) * motionScale * tipScale
    const forceKick = Math.max(0, params.flipperKick) * motionScale * tipScale

    this.ballBody.force.x += nx * forceKick
    this.ballBody.force.y += ny * forceKick
    MatterBody.setVelocity(this.ballBody, {
      x: this.ballBody.velocity.x + nx * velocityKick,
      y: this.ballBody.velocity.y + ny * velocityKick,
    })
    this.clampBallVelocity()
  }

  impulseForKind(kind) {
    if (kind === 'player') {
      return params.playerImpulse
    }
    if (kind === 'goalkeeper') {
      return params.goalkeeperImpulse
    }
    return params.bumperImpulse
  }

  lowSpeedThresholdForKind(kind) {
    if (kind === 'player') {
      return params.playerLowSpeedThreshold
    }
    if (kind === 'goalkeeper') {
      return params.goalkeeperLowSpeedThreshold
    }
    return params.bumperLowSpeedThreshold
  }

  shouldApplyAntiStallKick(body) {
    if (!this.ballBody || !body || body.plugin?.safety) {
      return false
    }

    const kind = body.plugin?.kind
    if (kind !== 'bumper' && kind !== 'player' && kind !== 'goalkeeper') {
      return false
    }

    const speed = Math.hypot(this.ballBody.velocity.x, this.ballBody.velocity.y)
    if (speed >= this.lowSpeedThresholdForKind(kind)) {
      return false
    }

    const key = body.plugin?.levelName || body.id
    if (!this.canKickContactBody(body)) {
      return false
    }

    const lastKickAt = this.lastAntiStallKickAt.get(key) || -Infinity
    return this.time.now - lastKickAt >= params.contactAntiStallCooldownMs
  }

  applyAntiStallKick(body) {
    const kind = body.plugin?.kind
    const key = body.plugin?.levelName || body.id
    const impulse = this.impulseForKind(kind) * Math.max(0, params.contactAntiStallKickScale)
    this.lastAntiStallKickAt.set(key, this.time.now)
    this.lastContactKickAt.set(this.contactKickKey(body), this.time.now)
    this.kickBallFromBody(body, impulse, impulse)
  }

  kickBallFromBody(body, force, maxForce, options = {}) {
    if (!this.ballBody) {
      return
    }
    const dx = this.ballBody.position.x - body.position.x
    const dy = this.ballBody.position.y - body.position.y
    const distance = Math.max(Math.hypot(dx, dy), 1)
    if (distance > 100) {
      return
    }

    const cappedForce = Math.min(force, maxForce)
    let nx = dx / distance
    let ny = dy / distance

    const kind = body.plugin?.kind
    if (kind === 'bumper' && params.bumperGoalBias > 0) {
      const goalCenter = { x: this.level.width * 0.5, y: this.level.height * 0.26 }
      const gx = goalCenter.x - this.ballBody.position.x
      const gy = goalCenter.y - this.ballBody.position.y
      const goalLength = Math.max(Math.hypot(gx, gy), 1)
      const bias = Phaser.Math.Clamp(params.bumperGoalBias, 0, 0.95)
      nx = nx * (1 - bias) + (gx / goalLength) * bias
      ny = ny * (1 - bias) + (gy / goalLength) * bias
      const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
      nx /= normalizedLength
      ny /= normalizedLength
    }

    if (kind === 'flipper' && params.flipperGoalBias > 0) {
      const goalCenter = { x: this.level.width * 0.5, y: this.level.height * 0.26 }
      const gx = goalCenter.x - this.ballBody.position.x
      const gy = goalCenter.y - this.ballBody.position.y
      const goalLength = Math.max(Math.hypot(gx, gy), 1)
      const bias = Phaser.Math.Clamp(params.flipperGoalBias, 0, 0.95)
      nx = nx * (1 - bias) + (gx / goalLength) * bias
      ny = ny * (1 - bias) + (gy / goalLength) * bias
      const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
      nx /= normalizedLength
      ny /= normalizedLength
    }

    if (kind === 'goalkeeper' && params.goalkeeperGoalAvoidBias > 0) {
      const goalCenter = { x: this.level.width * 0.5, y: this.level.height * 0.26 }
      const awayX = this.ballBody.position.x - goalCenter.x
      const awayY = this.ballBody.position.y - goalCenter.y
      const awayLength = Math.max(Math.hypot(awayX, awayY), 1)
      const bias = Phaser.Math.Clamp(params.goalkeeperGoalAvoidBias, 0, 0.95)
      nx = nx * (1 - bias) + (awayX / awayLength) * bias
      ny = ny * (1 - bias) + (awayY / awayLength) * bias
      const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
      nx /= normalizedLength
      ny /= normalizedLength
    }

    if (kind === 'flipper') {
      const velocityKick = Math.max(0, params.flipperVelocityKick) * (options.motionScale ?? 1)
      this.ballBody.force.x += nx * cappedForce
      this.ballBody.force.y += ny * cappedForce
      MatterBody.setVelocity(this.ballBody, {
        x: this.ballBody.velocity.x + nx * velocityKick,
        y: this.ballBody.velocity.y + ny * velocityKick,
      })
    } else if (kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') {
      const speed = Math.hypot(this.ballBody.velocity.x, this.ballBody.velocity.y)
      const lowSpeedThreshold = Math.max(
        0.5,
        this.lowSpeedThresholdForKind(kind),
      )
      const lowSpeedBoost = Phaser.Math.Clamp((lowSpeedThreshold - speed) / lowSpeedThreshold, 0, 1)
      const weakHitBoost = Math.max(
        0,
        kind === 'player'
          ? params.playerWeakHitBoost
          : kind === 'goalkeeper'
            ? params.goalkeeperWeakHitBoost
            : params.bumperWeakHitBoost,
      )
      const velocityKickScale = Math.max(
        0,
        kind === 'player'
          ? params.playerVelocityKick
          : kind === 'goalkeeper'
            ? params.goalkeeperVelocityKick
            : params.bumperVelocityKick,
      )
      const baseImpulse = Math.max(0.001, force)
      const boostedForce = cappedForce * (1 + lowSpeedBoost * weakHitBoost)
      const velocityKick = (boostedForce / baseImpulse) * velocityKickScale
      this.ballBody.force.x += nx * boostedForce
      this.ballBody.force.y += ny * boostedForce
      MatterBody.setVelocity(this.ballBody, {
        x: this.ballBody.velocity.x + nx * velocityKick,
        y: this.ballBody.velocity.y + ny * velocityKick,
      })
    } else {
      this.ballBody.force.x += nx * cappedForce
      this.ballBody.force.y += ny * cappedForce
    }
    this.clampBallVelocity()
  }

  drawLevel() {
    this.layoutGraphics.clear()
    this.editGraphics.clear()
    this.layoutGraphics.fillStyle(0x103e23, 1)
    this.layoutGraphics.fillRect(0, 0, this.level.width, this.level.height)

    const drawOrder = [
      'field_base',
      'field_collision',
      'goal_collision',
      'sensor_goal',
      'goalkeeper_path',
      'sensor_lose',
      'bumper',
      'player',
      'goalkeeper',
      'flipper',
      'anchor',
      'ball_spawn',
    ]

    if (params.showVisualShapes) {
      for (const kind of drawOrder) {
        for (const object of this.level.objects.filter((item) => item.kind === kind)) {
          this.drawObject(object)
        }
      }
    } else {
      const spawn = this.findObject('ball_spawn')
      if (spawn) {
        this.drawObject(spawn)
      }
    }

    if (params.showAlignmentCompare && this.mode === 'play') {
      this.drawAlignmentComparison()
    }

    if (this.ballBody) {
      this.drawBall()
    }

    this.drawLaunchArrow()
    this.drawEditOverlay()
  }

  drawBall() {
    const ballRadius = this.getBallRadius()
    const x = this.ballBody.position.x
    const y = this.ballBody.position.y
    const angle = this.ballVisualAngle
    const ovalRadiusX = ballRadius * 0.55
    const ovalRadiusY = ballRadius * 0.85
    const cosAngle = Math.cos(angle)
    const sinAngle = Math.sin(angle)

    this.layoutGraphics.fillStyle(0xffffff, 1)
    this.layoutGraphics.fillCircle(x, y, ballRadius)

    const points = []
    const segments = 28
    for (let i = 0; i < segments; i += 1) {
      const t = (i / segments) * Math.PI * 2
      const localX = Math.cos(t) * ovalRadiusX
      const localY = Math.sin(t) * ovalRadiusY
      points.push({
        x: x + localX * cosAngle - localY * sinAngle,
        y: y + localX * sinAngle + localY * cosAngle,
      })
    }

    this.layoutGraphics.fillStyle(0x3a2416, 1)
    this.layoutGraphics.fillPoints(points, true)
  }

  drawAlignmentComparison() {
    for (const object of this.level.objects) {
      if (!object.points || object.kind === 'goalkeeper_path') {
        continue
      }

      this.layoutGraphics.lineStyle(1, 0xffffff, 0.95)
      this.strokeOutline(this.getRuntimeSourcePoints(object), this.layoutGraphics)

      const body = this.objectBodies.get(object.name)
      if (!body) {
        continue
      }

      this.layoutGraphics.lineStyle(2, 0xff9d00, 0.95)
      if (Array.isArray(body)) {
        for (const part of body) {
          this.strokeOutline(part.vertices, this.layoutGraphics)
        }
      } else {
        const parts = body.parts?.length > 1 ? body.parts.slice(1) : [body]
        for (const part of parts) {
          this.strokeOutline(part.vertices, this.layoutGraphics)
        }
      }
    }
  }

  drawObject(object) {
    if (object.point) {
      if (object.kind === 'ball_spawn') {
        const radius = Math.max(object.radius || 6, 6)
        this.layoutGraphics.lineStyle(2, 0xffffff, 0.95)
        this.layoutGraphics.strokeCircle(object.point.x, object.point.y, radius + 4)
        this.layoutGraphics.lineStyle(2, 0x72e8ff, 0.95)
        this.layoutGraphics.beginPath()
        this.layoutGraphics.moveTo(object.point.x - radius - 3, object.point.y)
        this.layoutGraphics.lineTo(object.point.x + radius + 3, object.point.y)
        this.layoutGraphics.moveTo(object.point.x, object.point.y - radius - 3)
        this.layoutGraphics.lineTo(object.point.x, object.point.y + radius + 3)
        this.layoutGraphics.strokePath()
        this.layoutGraphics.fillStyle(0x72e8ff, 0.65)
        this.layoutGraphics.fillCircle(object.point.x, object.point.y, 3)
        return
      }
      const radius = object.kind === 'anchor' ? 5 : Math.max(object.radius || 4, 4)
      this.layoutGraphics.fillStyle(colorToNumber(object.fill), object.alpha ?? 1)
      this.layoutGraphics.fillCircle(object.point.x, object.point.y, radius)
      this.layoutGraphics.lineStyle(1, 0xffffff, 0.9)
      this.layoutGraphics.strokeCircle(object.point.x, object.point.y, radius + 2)
      return
    }

    const points = object.kind === 'bumper' ? this.getBumperRenderPoints(object) : this.getRenderPoints(object)
    if (!points?.length) {
      return
    }

    const alpha = object.alpha ?? 1
    if (object.kind === 'goalkeeper_path') {
      if (!params.showGoalkeeperPath) {
        return
      }
      this.layoutGraphics.lineStyle(3, colorToNumber(object.fill), 0.8)
      this.strokePolygon(points)
      return
    }

    this.layoutGraphics.fillStyle(colorToNumber(object.fill), alpha)
    this.layoutGraphics.lineStyle(2, this.strokeColorFor(object), 0.85)
    this.fillPolygon(points)
    this.layoutGraphics.strokePath()
  }

  drawLaunchArrow() {
    if (!params.showLaunchArrow) {
      this.launchArrow = null
      return
    }

    if (!this.launchArrow) {
      return
    }

    if (this.time.now > this.launchArrow.expiresAt) {
      this.launchArrow = null
      return
    }

    const { start, end } = this.launchArrow
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const headLength = 12
    this.layoutGraphics.lineStyle(3, 0x72e8ff, 0.95)
    this.layoutGraphics.beginPath()
    this.layoutGraphics.moveTo(start.x, start.y)
    this.layoutGraphics.lineTo(end.x, end.y)
    this.layoutGraphics.strokePath()
    this.layoutGraphics.beginPath()
    this.layoutGraphics.moveTo(end.x, end.y)
    this.layoutGraphics.lineTo(
      end.x - Math.cos(angle - Math.PI / 6) * headLength,
      end.y - Math.sin(angle - Math.PI / 6) * headLength,
    )
    this.layoutGraphics.moveTo(end.x, end.y)
    this.layoutGraphics.lineTo(
      end.x - Math.cos(angle + Math.PI / 6) * headLength,
      end.y - Math.sin(angle + Math.PI / 6) * headLength,
    )
    this.layoutGraphics.strokePath()
  }

  getRenderPoints(object) {
    if (this.mode === 'play' && (object.kind === 'flipper' || object.kind === 'goalkeeper')) {
      const runtimePoints = this.getRuntimeSourcePoints(object)
      if (object.kind === 'goalkeeper') {
        return this.applyCharacterHitOffset(object, runtimePoints)
      }
      return runtimePoints
    }
    if (this.mode === 'play' && object.kind === 'player') {
      return this.applyCharacterHitOffset(object, this.getRuntimeSourcePoints(object))
    }
    return object.points
  }

  getBumperRenderPoints(object) {
    const points = this.getRenderPoints(object)
    if (!points?.length || this.mode !== 'play') {
      return points
    }
    const hit = this.bumperHitEffects.get(object.name)
    if (!hit) {
      return points
    }
    const remaining = hit.endsAt - this.time.now
    if (remaining <= 0) {
      this.bumperHitEffects.delete(object.name)
      return points
    }
    const t = remaining / hit.durationMs
    const squash = hit.scale * t
    const center = polygonCenter(points)
    const factor = Math.max(0.75, 1 - squash)
    return points.map((point) => ({
      x: center.x + (point.x - center.x) * factor,
      y: center.y + (point.y - center.y) * factor,
    }))
  }

  markBumperHit(levelName) {
    if (!levelName) {
      return
    }
    const durationMs = Math.max(16, params.bumperHitDurationMs)
    this.bumperHitEffects.set(levelName, {
      endsAt: this.time.now + durationMs,
      durationMs,
      scale: Phaser.Math.Clamp(params.bumperHitScale, 0, 0.4),
    })
  }

  applyCharacterHitOffset(object, points) {
    if (!points?.length) {
      return points
    }
    const hit = this.characterHitEffects.get(object.name)
    if (!hit) {
      return points
    }
    const remaining = hit.endsAt - this.time.now
    if (remaining <= 0) {
      this.characterHitEffects.delete(object.name)
      return points
    }
    const progress = Phaser.Math.Clamp(1 - remaining / hit.durationMs, 0, 1)
    const pulse = progress < 0.5 ? progress * 2 : (1 - progress) * 2
    const offset = hit.offsetPx * pulse
    return points.map((point) => ({
      x: point.x + hit.dirX * offset,
      y: point.y + hit.dirY * offset,
    }))
  }

  markCharacterHit(levelName, kind) {
    if (!levelName || !this.ballBody) {
      return
    }
    const velocity = this.ballBody.velocity
    const length = Math.max(Math.hypot(velocity.x, velocity.y), 0.0001)
    const dirX = velocity.x / length
    const dirY = velocity.y / length
    const durationMs = Math.max(20, kind === 'goalkeeper' ? params.goalkeeperHitDurationMs : params.playerHitDurationMs)
    const offsetPx = Math.max(0, kind === 'goalkeeper' ? params.goalkeeperHitOffsetPx : params.playerHitOffsetPx)
    this.characterHitEffects.set(levelName, {
      endsAt: this.time.now + durationMs,
      durationMs,
      dirX,
      dirY,
      offsetPx,
    })
  }

  getRuntimeSourcePoints(object) {
    if (object.kind === 'flipper') {
      const state = this.flipperState.get(object.name)
      if (!state) {
        return object.points
      }
      return object.points.map((point) => rotatePoint(point, state.anchor, state.currentAngle))
    }

    if (object.kind === 'goalkeeper') {
      const body = this.objectBodies.get(object.name)
      if (!body || Array.isArray(body) || !this.goalkeeperState) {
        return object.points
      }
      const dx = body.position.x - this.goalkeeperState.baseCenter.x
      const dy = body.position.y - this.goalkeeperState.baseCenter.y
      return translatePoints(object.points, dx, dy)
    }

    if (object.kind === 'player') {
      const body = this.objectBodies.get(object.name)
      const state = this.playerMovementState.get(object.name)
      if (!body || Array.isArray(body) || !state) {
        return object.points
      }
      const dx = body.position.x - state.baseCenter.x
      const dy = body.position.y - state.baseCenter.y
      return translatePoints(object.points, dx, dy)
    }

    return object.points
  }

  strokeColorFor(object) {
    if (object.kind === 'flipper') {
      return 0x6f4e00
    }
    if (object.kind === 'bumper') {
      return 0xffc1c1
    }
    if (object.kind === 'sensor_goal' || object.kind === 'sensor_lose') {
      return 0xcaffda
    }
    return 0xffffff
  }

  fillPolygon(points) {
    const clean = cleanPoints(points)
    this.layoutGraphics.beginPath()
    this.layoutGraphics.moveTo(clean[0].x, clean[0].y)
    for (let index = 1; index < clean.length; index += 1) {
      this.layoutGraphics.lineTo(clean[index].x, clean[index].y)
    }
    this.layoutGraphics.closePath()
    this.layoutGraphics.fillPath()
  }

  strokePolygon(points) {
    const clean = cleanPoints(points)
    this.layoutGraphics.beginPath()
    this.layoutGraphics.moveTo(clean[0].x, clean[0].y)
    for (let index = 1; index < clean.length; index += 1) {
      this.layoutGraphics.lineTo(clean[index].x, clean[index].y)
    }
    this.layoutGraphics.closePath()
    this.layoutGraphics.strokePath()
  }

  strokeOutline(points, graphics) {
    const clean = cleanPoints(points)
    if (!clean.length) {
      return
    }

    graphics.beginPath()
    graphics.moveTo(clean[0].x, clean[0].y)
    for (let index = 1; index < clean.length; index += 1) {
      graphics.lineTo(clean[index].x, clean[index].y)
    }
    graphics.closePath()
    graphics.strokePath()
  }

  drawEditOverlay() {
    if (this.mode !== 'edit') {
      return
    }

    const selected = this.getSelectedObject()
    if (!selected) {
      return
    }

    this.editGraphics.lineStyle(3, 0xffffff, 1)
    if (selected.points) {
      this.strokeSelection(selected.points)
      for (const point of cleanPoints(selected.points)) {
        this.editGraphics.fillStyle(0xffffff, 1)
        this.editGraphics.fillCircle(point.x, point.y, EDIT_HANDLE_RADIUS)
        this.editGraphics.fillStyle(0x111111, 1)
        this.editGraphics.fillCircle(point.x, point.y, 3)
      }
    } else if (selected.point) {
      this.editGraphics.strokeCircle(selected.point.x, selected.point.y, 12)
      this.editGraphics.fillStyle(0xffffff, 1)
      this.editGraphics.fillCircle(selected.point.x, selected.point.y, EDIT_HANDLE_RADIUS)
    }
  }

  strokeSelection(points) {
    const clean = cleanPoints(points)
    this.editGraphics.beginPath()
    this.editGraphics.moveTo(clean[0].x, clean[0].y)
    for (let index = 1; index < clean.length; index += 1) {
      this.editGraphics.lineTo(clean[index].x, clean[index].y)
    }
    this.editGraphics.closePath()
    this.editGraphics.strokePath()
  }

  findObjectAt(point) {
    for (let index = this.level.objects.length - 1; index >= 0; index -= 1) {
      const object = this.level.objects[index]
      if (object.point) {
        const radius = object.kind === 'anchor' ? 12 : Math.max(object.radius || 4, 8)
        if (Phaser.Math.Distance.Between(point.x, point.y, object.point.x, object.point.y) <= radius) {
          return object
        }
      } else if (object.points && pointNearPolygon(point, object.points, 8)) {
        return object
      }
    }
    return null
  }

  findVertexHit(object, point) {
    const points = cleanPoints(object.points)
    return points.findIndex((vertex) => Phaser.Math.Distance.Between(point.x, point.y, vertex.x, vertex.y) <= EDIT_HANDLE_RADIUS + 2)
  }

  translateObject(object, dx, dy) {
    if (object.point) {
      object.point.x += dx
      object.point.y += dy
    } else {
      object.points = translatePoints(object.points, dx, dy)
    }
  }

  rotateSelected(degrees) {
    if (this.mode !== 'edit') {
      return
    }

    const object = this.getSelectedObject()
    if (!object?.points) {
      return
    }

    const center = object.kind === 'flipper'
      ? this.findObject(object.anchor)?.point || polygonCenter(object.points)
      : polygonCenter(object.points)
    const radians = Phaser.Math.DegToRad(degrees)
    object.points = object.points.map((point) => rotatePoint(point, center, radians))
    this.afterObjectEdit(object)
  }

  afterObjectEdit(object) {
    if (object.kind === 'ball_spawn' && object.point) {
      this.level.ball = this.level.ball || {}
      this.level.ball.spawn = { ...object.point }
    }
    this.syncSharedSource(object)
    this.syncMirrorPair(object)
    this.updateSelectionUi()
    this.autosaveLevelSoon()
  }

  syncSharedSource(object) {
    if (object.sourceIndex === undefined) {
      return
    }

    for (const other of this.level.objects) {
      if (other === object || other.sourceIndex !== object.sourceIndex) {
        continue
      }
      if (object.points && other.points) {
        other.points = clone(object.points)
      }
      if (object.point && other.point) {
        other.point = clone(object.point)
      }
    }
  }

  syncMirrorPair(object) {
    if (!object.pair) {
      return
    }

    const paired = this.findObject(object.pair)
    if (!paired) {
      return
    }

    const axis = this.level.width / 2
    object.mirrorAxis = axis
    paired.mirrorAxis = axis
    if (object.points && paired.points) {
      paired.points = mirrorPoints(object.points, axis)
    } else if (object.point && paired.point) {
      paired.point = { x: axis * 2 - object.point.x, y: object.point.y }
    }
  }

  findObject(name) {
    return this.level.objects.find((object) => object.name === name)
  }

  getSelectedObject() {
    return this.selectedName ? this.findObject(this.selectedName) : null
  }

  updateSelectionUi() {
    document.querySelector('#selected-name').textContent = this.selectedName || 'No selection'
  }

  updateModeUi() {
    document.querySelector('#mode-toggle').textContent = this.mode === 'play' ? 'Edit Mode' : 'Play Mode'
    document.querySelector('#layout-json').classList.toggle('is-editing', this.mode === 'edit')
  }

  setStatus(message) {
    document.querySelector('#status-line').textContent = message
  }

  setJsonState(type, message) {
    const target = document.querySelector(`#${type}-json-state`)
    if (target) {
      target.textContent = message
    }
  }

  exportLevelJson() {
    this.getBallSpawn()
    return serializeLevel(this.level)
  }

  syncTextarea() {
    document.querySelector('#layout-json').value = this.exportLevelJson()
    this.setJsonState('layout', `${this.level.objects.length} objects`)
  }

  syncPhysicsTextarea() {
    document.querySelector('#physics-json').value = exportPhysicsConfigJson(params)
    this.setJsonState('physics', `${Object.keys(DEFAULT_PHYSICS_CONFIG).length} params`)
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_VIEW_WIDTH,
  height: GAME_VIEW_HEIGHT,
  backgroundColor: '#103e23',
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
      debug: true,
    },
  },
  scene: PinballScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    orientation: Phaser.Scale.PORTRAIT,
  },
})

const pane = new Pane({ title: 'Physics Debug' })
pane.element.classList.add('debug-pane')
pane.element.classList.add('is-hidden')
window.physicsPane = pane

const defaultsFolder = pane.addFolder({ title: 'Defaults' })
defaultsFolder.addButton({ title: 'Reset Physics Defaults' }).on('click', () => {
  resetPhysicsParamsToDefaults()
  savePhysicsConfigToStorage(params)
  pane.refresh()
  if (window.pinballScene) {
    window.pinballScene.syncPhysicsTextarea()
    window.pinballScene.setJsonState('physics', `defaults ${formatTime()}`)
    window.pinballScene.setStatus('Physics reset to defaults')
    if (window.pinballScene.mode === 'play') {
      window.pinballScene.rebuildPlayBodies()
    }
  }
})

const worldFolder = pane.addFolder({ title: 'World' })
worldFolder.addBinding(params, 'gravityY', { min: 0.2, max: 2.2, step: 0.01, label: 'Gravity Y' })
worldFolder.addBinding(params, 'maxBallSpeed', { min: 4, max: 40, step: 0.5, label: 'Max Ball Speed' })
worldFolder.addBinding(params, 'goalkeeperSpeed', { min: 20, max: 180, step: 1, label: 'Keeper Speed' })

const ballFolder = pane.addFolder({ title: 'Ball' })
const ballRadiusBinding = ballFolder.addBinding(params, 'ballRadius', { min: 4, max: 32, step: 0.5, label: 'Radius' })
ballFolder.addBinding(params, 'ballDensity', { min: 0.0001, max: 0.03, step: 0.0001, label: 'Density' })
ballFolder.addBinding(params, 'ballFriction', { min: 0, max: 0.15, step: 0.001, label: 'Friction' })
ballFolder.addBinding(params, 'ballFrictionAir', { min: 0, max: 0.08, step: 0.0005, label: 'Air Friction' })
ballFolder.addBinding(params, 'ballRestitution', { min: 0.1, max: 1.3, step: 0.01, label: 'Restitution' })

const bumpersFolder = pane.addFolder({ title: 'Bumpers' })
bumpersFolder.addBinding(params, 'bumperRestitution', { min: 0.3, max: 1.8, step: 0.01, label: 'Restitution' })
bumpersFolder.addBinding(params, 'bumperImpulse', { min: 0, max: 0.08, step: 0.001, label: 'Impulse' })
bumpersFolder.addBinding(params, 'bumperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' })
bumpersFolder.addBinding(params, 'bumperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
bumpersFolder.addBinding(params, 'bumperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
bumpersFolder.addBinding(params, 'bumperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
bumpersFolder.addBinding(params, 'contactAntiStallKickScale', { min: 0, max: 4, step: 0.05, label: 'Anti-Stall Kick' })
bumpersFolder.addBinding(params, 'contactAntiStallCooldownMs', { min: 30, max: 1000, step: 10, label: 'Anti-Stall Cooldown' })
bumpersFolder.addBinding(params, 'contactKickCooldownMs', { min: 0, max: 800, step: 10, label: 'Contact Cooldown' })
bumpersFolder.addBinding(params, 'bumperHitScale', { min: 0, max: 0.4, step: 0.01, label: 'Hit Squash' })
bumpersFolder.addBinding(params, 'bumperHitDurationMs', { min: 16, max: 240, step: 4, label: 'Hit Duration' })

const playersFolder = pane.addFolder({ title: 'Players' })
playersFolder.addBinding(params, 'playerImpulse', { min: 0, max: 0.08, step: 0.001, label: 'Impulse' })
playersFolder.addBinding(params, 'playerWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
playersFolder.addBinding(params, 'playerVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
playersFolder.addBinding(params, 'playerLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
playersFolder.addBinding(params, 'playerHitOffsetPx', { min: 0, max: 24, step: 1, label: 'Hit Offset Px' })
playersFolder.addBinding(params, 'playerHitDurationMs', { min: 20, max: 260, step: 5, label: 'Hit Duration' })
playersFolder.addBinding(params, 'playerMovementEnabled', { label: 'Move Players' })
playersFolder.addBinding(params, 'playerMovementParallel', { label: 'Parallel Move' })
playersFolder.addBinding(params, 'playerMovementDistance', { min: 0, max: 80, step: 1, label: 'Move Distance' })
playersFolder.addBinding(params, 'playerMovementSpeed', { min: 0, max: 6, step: 0.1, label: 'Move Speed' })
playersFolder.addBinding(params, 'playerMovementArcHeight', { min: -120, max: 120, step: 2, label: 'Arc Height' })

const goalkeeperFolder = pane.addFolder({ title: 'Goalkeeper' })
goalkeeperFolder.addBinding(params, 'goalkeeperImpulse', { min: 0, max: 0.1, step: 0.001, label: 'Impulse' })
goalkeeperFolder.addBinding(params, 'goalkeeperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
goalkeeperFolder.addBinding(params, 'goalkeeperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
goalkeeperFolder.addBinding(params, 'goalkeeperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
goalkeeperFolder.addBinding(params, 'goalkeeperGoalAvoidBias', { min: 0, max: 0.95, step: 0.01, label: 'Avoid Goal Bias' })
goalkeeperFolder.addBinding(params, 'goalkeeperHitOffsetPx', { min: 0, max: 28, step: 1, label: 'Hit Offset Px' })
goalkeeperFolder.addBinding(params, 'goalkeeperHitDurationMs', { min: 20, max: 280, step: 5, label: 'Hit Duration' })

const flippersFolder = pane.addFolder({ title: 'Flippers' })
flippersFolder.addBinding(params, 'flipperSpeed', { min: 0.02, max: 0.7, step: 0.01, label: 'Speed' })
flippersFolder.addBinding(params, 'flipperKick', { min: 0, max: 0.09, step: 0.001, label: 'Kick' })
flippersFolder.addBinding(params, 'flipperVelocityKick', { min: 0, max: 36, step: 0.5, label: 'Velocity Kick' })
flippersFolder.addBinding(params, 'flipperKickCooldownMs', { min: 0, max: 500, step: 10, label: 'Kick Cooldown' })
flippersFolder.addBinding(params, 'flipperKickMinAngleStep', { min: 0, max: 0.08, step: 0.002, label: 'Kick Motion Min' })
flippersFolder.addBinding(params, 'flipperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' })
flippersFolder.addBinding(params, 'flipperTipBoost', { min: 0, max: 2, step: 0.05, label: 'Tip Boost' })
flippersFolder.addBinding(params, 'flipperMinTipScale', { min: 0.1, max: 1, step: 0.05, label: 'Base Tip Scale' })

const collisionsFolder = pane.addFolder({ title: 'Collisions' })
collisionsFolder.addBinding(params, 'wallRestitution', { min: 0.05, max: 1.2, step: 0.01, label: 'Wall Rest.' })
for (const binding of [
  collisionsFolder.addBinding(params, 'wallPadding', { min: 4, max: 20, step: 1, label: 'Wall Padding' }),
  collisionsFolder.addBinding(params, 'goalPadding', { min: 2, max: 16, step: 1, label: 'Goal Padding' }),
  collisionsFolder.addBinding(params, 'playerPadding', { min: 0, max: 8, step: 1, label: 'Player Padding' }),
  collisionsFolder.addBinding(params, 'bumperPadding', { min: 0, max: 8, step: 1, label: 'Bumper Padding' }),
  collisionsFolder.addBinding(params, 'flipperPadding', { min: 0, max: 3, step: 0.5, label: 'Flipper Padding' }),
]) {
  binding.on('change', () => {
    if (window.pinballScene?.mode === 'play') {
      window.pinballScene.rebuildPlayBodies()
    }
  })
}

const serveFolder = pane.addFolder({ title: 'Serve' })
serveFolder.addBinding(params, 'launchForceMin', { min: 0, max: 0.12, step: 0.001, label: 'Force Min' })
serveFolder.addBinding(params, 'launchForceMax', { min: 0, max: 0.12, step: 0.001, label: 'Force Max' })
serveFolder.addBinding(params, 'launchDelayMs', { min: 0, max: 1200, step: 25, label: 'Delay' })
serveFolder.addBinding(params, 'launchXMin', { min: -1, max: 0.5, step: 0.01, label: 'X Min' })
serveFolder.addBinding(params, 'launchXMax', { min: -0.5, max: 1, step: 0.01, label: 'X Max' })
serveFolder.addBinding(params, 'launchXDeadZone', { min: 0, max: 0.5, step: 0.005, label: 'X Dead' })

const debugFolder = pane.addFolder({ title: 'Debug' })
debugFolder.addBinding(params, 'showVisualShapes', { label: 'Visual SVG' })
debugFolder.addBinding(params, 'showMatterBodies', { label: 'Matter Bodies' })
debugFolder.addBinding(params, 'showSafetyBodies', { label: 'Safety Bodies' })
debugFolder.addBinding(params, 'showAlignmentCompare', { label: 'Compare Align' })
debugFolder.addBinding(params, 'showGoalkeeperPath', { label: 'Goalkeeper Path' })
debugFolder.addBinding(params, 'showLaunchArrow', { label: 'Launch Arrow' })
debugFolder.addBinding(params, 'freezePhysics', { label: 'Freeze Physics' })

ballRadiusBinding.on('change', () => {
  if (window.pinballScene?.mode === 'play') {
    window.pinballScene.rebuildBallBody()
  }
})
pane.on('change', () => {
  savePhysicsConfigToStorage(params)
  if (window.pinballScene) {
    window.pinballScene.syncPhysicsTextarea()
    window.pinballScene.setJsonState('physics', `autosaved ${formatTime()}`)
  }
})

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
