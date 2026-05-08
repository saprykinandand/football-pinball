import './style.css'
import Phaser from 'phaser'
import { Pane } from 'tweakpane'
import { DEFAULT_LEVEL } from './defaultLevel.js'
import { PHYSICS_TUNING, createDefaultParams } from './config/physicsTuning.js'
import {
  clearStoredLevel,
  clone,
  defaultBallSpawn,
  parseLevelJson,
  readStoredLevel,
  saveStoredLevelJson,
  serializeLevel,
} from './level/levelStore.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body
const MatterVertices = Phaser.Physics.Matter.Matter.Vertices
const EDIT_HANDLE_RADIUS = 7

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="game-shell">
    <div class="toolbar">
      <button id="mode-toggle">Edit Mode</button>
      <button id="save-layout">Save Layout</button>
      <button id="export-layout">Export JSON</button>
      <button id="import-layout">Import JSON</button>
      <button id="reset-layout">Reset SVG Layout</button>
      <button id="reset-ball">Reset Ball</button>
      <button id="serve-ball">Serve Ball</button>
      <button id="rotate-left">Rotate -5</button>
      <button id="rotate-right">Rotate +5</button>
      <span id="selected-name">No selection</span>
    </div>
    <div class="game-row">
      <div id="game-container"></div>
      <textarea id="layout-json" spellcheck="false"></textarea>
    </div>
    <div class="touch-controls">
      <button id="left-flip">Left Flipper</button>
      <button id="right-flip">Right Flipper</button>
    </div>
    <div id="status-line">Play Mode</div>
  </div>
`

const params = createDefaultParams()

function colorToNumber(color) {
  return Number.parseInt(String(color || '#FFFFFF').replace('#', ''), 16)
}

function cleanPoints(points) {
  const next = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
  if (next.length > 2) {
    const first = next[0]
    const last = next[next.length - 1]
    if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
      next.pop()
    }
  }
  return next
}

function polygonCenter(points) {
  const clean = cleanPoints(points)
  const total = clean.reduce((sum, point) => {
    sum.x += point.x
    sum.y += point.y
    return sum
  }, { x: 0, y: 0 })
  return { x: total.x / clean.length, y: total.y / clean.length }
}

function matterCentroid(points) {
  const center = MatterVertices.centre(cleanPoints(points))
  return { x: center.x, y: center.y }
}

function pointsBounds(points) {
  const clean = cleanPoints(points)
  return clean.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

function boundsCenter(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

function translatePoints(points, dx, dy) {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
}

function rotatePoint(point, center, radians) {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  }
}

function mirrorPoints(points, axis) {
  return points.map((point) => ({ x: axis * 2 - point.x, y: point.y })).reverse()
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) {
    return Phaser.Math.Distance.Between(point.x, point.y, start.x, start.y)
  }
  const t = Phaser.Math.Clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1)
  const x = start.x + t * dx
  const y = start.y + t * dy
  return Phaser.Math.Distance.Between(point.x, point.y, x, y)
}

function pointInPolygon(point, points) {
  const clean = cleanPoints(points)
  let inside = false
  for (let index = 0, previous = clean.length - 1; index < clean.length; previous = index, index += 1) {
    const currentPoint = clean[index]
    const previousPoint = clean[previous]
    const intersects = currentPoint.y > point.y !== previousPoint.y > point.y
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

function pointNearPolygon(point, points, threshold) {
  const clean = cleanPoints(points)
  if (pointInPolygon(point, clean)) {
    return true
  }
  return clean.some((start, index) => distanceToSegment(point, start, clean[(index + 1) % clean.length]) <= threshold)
}

class PinballScene extends Phaser.Scene {
  constructor() {
    super('pinball')
    this.level = readStoredLevel()
    this.mode = 'play'
    this.leftPressed = false
    this.rightPressed = false
    this.selectedName = null
    this.dragState = null
    this.playBodies = []
    this.safetyBodies = []
    this.objectBodies = new Map()
    this.flipperState = new Map()
    this.activeFlipperContacts = new Set()
    this.goalkeeperState = null
    this.serveTimer = null
    this.servePending = false
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
    this.rebuildPlayBodies()
    this.syncTextarea()
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
        this.updateGoalkeeper(delta)
        this.updateBall()
      }
    }

    this.drawLevel()
  }

  applySolverTuning() {
    const engine = this.matter.world.engine
    engine.positionIterations = PHYSICS_TUNING.positionIterations
    engine.velocityIterations = PHYSICS_TUNING.velocityIterations
    engine.constraintIterations = PHYSICS_TUNING.constraintIterations
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
      this.ballBody.restitution = params.ballRestitution
      this.ballBody.friction = PHYSICS_TUNING.ballFriction
      this.ballBody.frictionAir = PHYSICS_TUNING.ballFrictionAir
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

    this.input.keyboard.on('keydown-Q', () => this.rotateSelected(-5))
    this.input.keyboard.on('keydown-E', () => this.rotateSelected(5))
    this.input.keyboard.on('keydown-R', () => this.serveBall())
  }

  bindUi() {
    document.querySelector('#mode-toggle').onclick = () => {
      this.setMode(this.mode === 'play' ? 'edit' : 'play')
    }
    document.querySelector('#save-layout').onclick = () => {
      saveStoredLevelJson(this.exportLevelJson())
      this.setStatus('Layout saved')
    }
    document.querySelector('#export-layout').onclick = async () => {
      const json = this.exportLevelJson()
      document.querySelector('#layout-json').value = json
      try {
        await navigator.clipboard.writeText(json)
        this.setStatus('JSON copied to clipboard')
      } catch {
        this.setStatus('JSON exported to textarea')
      }
    }
    document.querySelector('#import-layout').onclick = () => {
      try {
        this.level = parseLevelJson(document.querySelector('#layout-json').value)
        this.selectedName = null
        this.rebuildForMode()
        this.updateSelectionUi()
        this.setStatus('JSON imported')
      } catch {
        this.setStatus('Import failed: invalid JSON')
      }
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
    document.querySelector('#reset-ball').onclick = () => {
      this.serveBall()
    }
    document.querySelector('#serve-ball').onclick = () => {
      this.serveBall()
    }
    document.querySelector('#rotate-left').onclick = () => this.rotateSelected(-5)
    document.querySelector('#rotate-right').onclick = () => this.rotateSelected(5)
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
        }
        if (kind === 'sensor_goal') {
          this.setStatus('Goal detected')
          this.serveBall()
        } else if (kind === 'sensor_lose') {
          this.setStatus('Lose area detected')
          this.serveBall()
        } else if ((kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') && !other.plugin?.safety) {
          this.kickBallFromBody(other, params.bumperImpulse, params.bumperImpulse)
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

  setMode(mode) {
    this.mode = mode
    this.selectedName = null
    this.rebuildForMode()
    this.updateModeUi()
    this.updateSelectionUi()
    this.setStatus(mode === 'play' ? 'Play Mode' : 'Edit Mode')
  }

  rebuildForMode() {
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
    this.objectBodies.clear()
    this.safetyBodies = []
    this.activeFlipperContacts.clear()
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
          basePosition: clone(body.position),
          baseAngle: body.angle,
          currentAngle: 0,
          activeAngle: object.side === 'left' ? -0.85 : 0.85,
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
        }
      }
    }

    const ballRadius = this.getBallRadius()
    const spawn = this.getBallSpawn()
    this.ballBody = this.matter.add.circle(spawn.x, spawn.y, ballRadius, {
      label: 'ball',
      restitution: params.ballRestitution,
      friction: PHYSICS_TUNING.ballFriction,
      frictionAir: PHYSICS_TUNING.ballFrictionAir,
      density: PHYSICS_TUNING.ballDensity,
      slop: 0.02,
    })
    this.ballBody.circleRadius = ballRadius
    this.playBodies.push(this.ballBody)
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
    this.activeFlipperContacts.clear()
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
    return Math.max(this.level.ball.radius || 0, PHYSICS_TUNING.ballRadius)
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
    const leftHeld = this.leftPressed || this.keys.left.isDown || this.keys.a.isDown
    const rightHeld = this.rightPressed || this.keys.right.isDown || this.keys.d.isDown
    for (const [name, state] of this.flipperState) {
      const held = name.includes('_left_') ? leftHeld : rightHeld
      const targetAngle = held ? state.activeAngle : 0
      const delta = Phaser.Math.Angle.Wrap(targetAngle - state.currentAngle)
      state.currentAngle += Phaser.Math.Clamp(delta, -params.flipperSpeed, params.flipperSpeed)
      const nextPosition = rotatePoint(state.basePosition, state.anchor, state.currentAngle)
      MatterBody.setPosition(state.body, nextPosition)
      MatterBody.setAngle(state.body, state.baseAngle + state.currentAngle)
      for (const safety of state.safetyBodies) {
        MatterBody.setPosition(safety.body, rotatePoint(safety.basePosition, state.anchor, state.currentAngle))
        MatterBody.setAngle(safety.body, safety.baseAngle + state.currentAngle)
      }

      if (held && this.activeFlipperContacts.has(name)) {
        this.kickBallFromBody(state.body, params.flipperKick, params.flipperKick)
      }
    }
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

  updateBall() {
    if (!this.ballBody) {
      return
    }

    if (this.servePending) {
      this.resetBallToSpawn()
      return
    }

    this.ballBody.restitution = params.ballRestitution
    this.ballBody.friction = PHYSICS_TUNING.ballFriction
    this.ballBody.frictionAir = PHYSICS_TUNING.ballFrictionAir

    if (this.keys.space.isDown && this.ballBody.position.y > this.level.height - 190) {
      this.ballBody.force.y -= PHYSICS_TUNING.launchImpulse
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
    this.launchArrow = this.createLaunchArrow(launch, params.launchDelayMs + 900)
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

  kickBallFromBody(body, force, maxForce) {
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
    this.ballBody.force.x += (dx / distance) * cappedForce
    this.ballBody.force.y += (dy / distance) * cappedForce
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
      const ballRadius = this.getBallRadius()
      this.layoutGraphics.fillStyle(0xffffff, 1)
      this.layoutGraphics.fillCircle(this.ballBody.position.x, this.ballBody.position.y, ballRadius)
      this.layoutGraphics.fillStyle(0x3a2416, 1)
      this.layoutGraphics.fillEllipse(this.ballBody.position.x, this.ballBody.position.y, ballRadius * 1.1, ballRadius * 1.7)
    }

    this.drawLaunchArrow()
    this.drawEditOverlay()
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

    const points = this.getRenderPoints(object)
    if (!points?.length) {
      return
    }

    const alpha = object.alpha ?? 1
    if (object.kind === 'goalkeeper_path') {
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
      return this.getRuntimeSourcePoints(object)
    }
    return object.points
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

    if (object.points && paired.points) {
      paired.points = mirrorPoints(object.points, object.mirrorAxis ?? this.level.width / 2)
    } else if (object.point && paired.point) {
      const axis = object.mirrorAxis ?? this.level.width / 2
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

  exportLevelJson() {
    this.getBallSpawn()
    return serializeLevel(this.level)
  }

  syncTextarea() {
    document.querySelector('#layout-json').value = this.exportLevelJson()
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: DEFAULT_LEVEL.width,
  height: DEFAULT_LEVEL.height,
  backgroundColor: '#103e23',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: params.gravityY },
      positionIterations: PHYSICS_TUNING.positionIterations,
      velocityIterations: PHYSICS_TUNING.velocityIterations,
      constraintIterations: PHYSICS_TUNING.constraintIterations,
      runner: {
        fps: PHYSICS_TUNING.runnerFps,
        maxUpdates: PHYSICS_TUNING.maxSubsteps,
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
pane.addBinding(params, 'gravityY', { min: 0.2, max: 2.2, step: 0.01, label: 'Gravity Y' })
pane.addBinding(params, 'maxBallSpeed', { min: 6, max: 24, step: 0.5, label: 'Max Ball Speed' })
pane.addBinding(params, 'ballRestitution', { min: 0.2, max: 0.95, step: 0.01, label: 'Ball Rest.' })
pane.addBinding(params, 'bumperRestitution', { min: 0.5, max: 1, step: 0.01, label: 'Bumper Rest.' })
pane.addBinding(params, 'wallRestitution', { min: 0.1, max: 0.85, step: 0.01, label: 'Wall Rest.' })
pane.addBinding(params, 'bumperImpulse', { min: 0.002, max: 0.018, step: 0.001, label: 'Bumper Impulse' })
pane.addBinding(params, 'flipperSpeed', { min: 0.03, max: 0.4, step: 0.01, label: 'Flipper Speed' })
pane.addBinding(params, 'flipperKick', { min: 0.004, max: 0.05, step: 0.001, label: 'Flipper Kick' })
pane.addBinding(params, 'goalkeeperSpeed', { min: 20, max: 180, step: 1, label: 'Keeper Speed' })
pane.addBinding(params, 'launchForceMin', { min: 0.002, max: 0.05, step: 0.001, label: 'Serve Force Min' })
pane.addBinding(params, 'launchForceMax', { min: 0.002, max: 0.05, step: 0.001, label: 'Serve Force Max' })
pane.addBinding(params, 'launchDelayMs', { min: 0, max: 1200, step: 25, label: 'Serve Delay' })
pane.addBinding(params, 'launchXMin', { min: -1, max: 0, step: 0.01, label: 'Serve X Min' })
pane.addBinding(params, 'launchXMax', { min: 0, max: 1, step: 0.01, label: 'Serve X Max' })
pane.addBinding(params, 'launchXDeadZone', { min: 0, max: 0.25, step: 0.005, label: 'Serve X Dead' })
for (const binding of [
  pane.addBinding(params, 'wallPadding', { min: 4, max: 20, step: 1, label: 'Wall Padding' }),
  pane.addBinding(params, 'goalPadding', { min: 2, max: 16, step: 1, label: 'Goal Padding' }),
  pane.addBinding(params, 'playerPadding', { min: 0, max: 8, step: 1, label: 'Player Padding' }),
  pane.addBinding(params, 'bumperPadding', { min: 0, max: 8, step: 1, label: 'Bumper Padding' }),
  pane.addBinding(params, 'flipperPadding', { min: 0, max: 3, step: 0.5, label: 'Flipper Padding' }),
]) {
  binding.on('change', () => {
    if (window.pinballScene?.mode === 'play') {
      window.pinballScene.rebuildPlayBodies()
    }
  })
}
pane.addBinding(params, 'showVisualShapes', { label: 'Visual SVG' })
pane.addBinding(params, 'showMatterBodies', { label: 'Matter Bodies' })
pane.addBinding(params, 'showSafetyBodies', { label: 'Safety Bodies' })
pane.addBinding(params, 'showAlignmentCompare', { label: 'Compare Align' })
pane.addBinding(params, 'freezePhysics', { label: 'Freeze Physics' })

window.addEventListener('beforeunload', () => {
  game.destroy(true)
  pane.dispose()
})
