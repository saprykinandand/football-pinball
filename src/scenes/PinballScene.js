import Phaser from 'phaser'
import { DEFAULT_PHYSICS_CONFIG, ENGINE_PHYSICS_DEFAULTS } from '../config/physicsTuning.js'
import { params } from '../config/runtimeParams.js'
import { exportPhysicsConfigJson, savePhysicsConfigToStorage } from '../config/physicsStore.js'
import { bindAppControls } from '../ui/appShell.js'
import { formatTime } from '../utils/time.js'
import { PerfOverlay } from '../render/perfOverlay.js'
import { drawLevel as drawRenderedLevel, markBumperHit as markRenderedBumperHit, markCharacterHit as markRenderedCharacterHit } from '../render/levelRenderer.js'
import { clone, readStoredLevel, saveStoredLevelJson, serializeLevel } from '../level/levelStore.js'
import { pointsBounds, polygonCenter } from '../level/geometry.js'
import {
  alignBodyToSourceBounds as alignMatterBodyToSourceBounds,
  createEdgeLoop as createMatterEdgeLoop,
  createPolygonBody as createMatterPolygonBody,
  getBodyBounds as getMatterBodyBounds,
  matterCentroid,
} from '../physics/bodyFactory.js'
import { updateFlippers as updateFlipperSystem } from '../systems/flipperSystem.js'
import {
  playerMovementArcY as getPlayerMovementArcY,
  playerMovementOffset as getPlayerMovementOffset,
  updatePlayers as updatePlayerSystem,
} from '../systems/playerSystem.js'
import { updateGoalkeeper as updateGoalkeeperSystem } from '../systems/goalkeeperSystem.js'
import {
  applyLaunchImpulse as applyServeLaunchImpulse,
  cancelPendingServe as cancelPendingServeSystem,
  chooseLaunchVector as chooseServeLaunchVector,
  createLaunchArrow as createServeLaunchArrow,
  getBallSpawn as getServeBallSpawn,
  resetBallToSpawn as resetServeBallToSpawn,
  serveBall as serveBallSystem,
} from '../systems/serveSystem.js'
import {
  applyAntiStallKick as applyAntiStallKickSystem,
  canKickContactBody as canKickContactBodySystem,
  canKickFlipper as canKickFlipperSystem,
  contactKickKey as getContactKickKey,
  getGoalBiasTarget as getContactGoalBiasTarget,
  impulseForKind as getImpulseForKind,
  kickBallFromBody as kickBallFromContactBody,
  kickBallFromFlipper as kickBallFromContactFlipper,
  lowSpeedThresholdForKind as getLowSpeedThresholdForKind,
  shouldApplyAntiStallKick as shouldApplyAntiStallKickSystem,
  tryKickContactBody as tryKickContactBodySystem,
  tryKickMovingFlipper as tryKickMovingFlipperSystem,
} from '../systems/contactKickSystem.js'
import {
  afterObjectEdit as afterObjectEditSystem,
  bindEditInput as bindEditInputSystem,
  drawEditOverlay as drawEditSystemOverlay,
  findObjectAt as findEditObjectAt,
  findVertexHit as findEditVertexHit,
  rotateSelected as rotateEditSelection,
  syncMirrorPair as syncEditMirrorPair,
  syncSharedSource as syncEditSharedSource,
  translateObject as translateEditObject,
} from '../systems/editSystem.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body
const LAUNCH_BUTTON_IMPULSE_Y = 0.012
const GAME_VIEW_HEIGHT = 540

export class PinballScene extends Phaser.Scene {
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
    this.ballImpactSquash = 0
    this.ballImpactAngle = 0
    this.ballTrailImage = null
    this.lastImpactShakeAt = -Infinity
    this.lastGoalShakeAt = -Infinity
    this.launchArrow = null
    this.lastLaunch = null
    this.sessionGoals = 0
    this.objectsByName = new Map()
    this.objectsByKind = new Map()
    this.staticRenderDirty = true
    this.debugVisibilityKey = ''
  }

  create() {
    window.pinballScene = this
    this.cameras.main.setBackgroundColor(0x103e23)
    this.matter.world.setGravity(0, params.gravityY)
    this.applySolverTuning()

    this.staticGraphics = this.add.graphics()
    this.layoutGraphics = this.add.graphics()
    this.editGraphics = this.add.graphics()
    this.staticGraphics.setDepth(0)
    this.layoutGraphics.setDepth(2)
    this.editGraphics.setDepth(3)
    this.perfOverlay = new PerfOverlay(this)
    this.indexLevelObjects()
    this.bindControls()
    bindAppControls(this)
    this.bindEditInput()
    this.bindPhysicsEvents()
    this.applyGameViewport()
    this.rebuildPlayBodies()
    this.syncTextarea()
    this.syncPhysicsTextarea()
    this.updateModeUi()
    this.updateSessionScoreStatus()
  }

  update(_time, delta) {
    const visualDelta = this.clampVisualDelta(delta)
    if (this.mode === 'play') {
      this.matter.world.engine.gravity.y = params.gravityY
      this.updateDebugVisibility()
      this.applyFreezeState()
      if (params.freezePhysics) {
        this.freezeBall()
      } else {
        this.updateFlippers(visualDelta)
        this.updatePlayers()
        this.updateGoalkeeper(visualDelta)
        this.updateBall(visualDelta)
      }
    }

    this.drawLevel()
    this.updatePerfStats(delta, visualDelta)
  }

  clampVisualDelta(delta) {
    const maxDelta = Math.max(8, Number(params.maxVisualDeltaMs) || 33)
    return Math.min(delta, maxDelta)
  }

  indexLevelObjects() {
    this.objectsByName.clear()
    this.objectsByKind.clear()
    for (const object of this.level.objects) {
      this.objectsByName.set(object.name, object)
      const list = this.objectsByKind.get(object.kind) || []
      list.push(object)
      this.objectsByKind.set(object.kind, list)
    }
    this.markStaticRenderDirty()
  }

  objectsOfKind(kind) {
    return this.objectsByKind.get(kind) || []
  }

  markStaticRenderDirty() {
    this.staticRenderDirty = true
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

  onTuningChanged() {
    this.applySolverTuning()
    this.applyBodyTuning()
    this.applyBallMaterialTuning()
    this.markStaticRenderDirty()
    this.updateDebugVisibility(true)
    this.updatePerfVisibility()
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

  updateDebugVisibility(force = false) {
    const shouldDrawDebug = Boolean(params.debugMatterEnabled || params.showMatterBodies || params.showSafetyBodies)
    const key = [
      shouldDrawDebug,
      params.showMatterBodies,
      params.showSafetyBodies,
      this.playBodies.length,
    ].join(':')
    if (!force && key === this.debugVisibilityKey) {
      return
    }
    this.debugVisibilityKey = key

    if (shouldDrawDebug && !this.matter.world.debugGraphic) {
      this.matter.world.createDebugGraphic()
    }

    this.matter.world.drawDebug = shouldDrawDebug
    if (this.matter.world.debugGraphic) {
      this.matter.world.debugGraphic.visible = shouldDrawDebug
      if (!shouldDrawDebug) {
        this.matter.world.debugGraphic.clear()
      }
    }

    for (const body of this.playBodies) {
      const isSafety = Boolean(body.plugin?.safety)
      this.setBodyDebugVisible(body, shouldDrawDebug && (isSafety ? params.showSafetyBodies : params.showMatterBodies))
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
    // Allow multi-touch so left and right flippers can be held together on phones.
    this.input.addPointer(3)

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
    bindEditInputSystem(this)
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
          this.triggerImpactShake('goal')
          this.sessionGoals += 1
          this.updateSessionScoreStatus()
          this.serveBall()
        } else if (kind === 'sensor_lose') {
          this.updateSessionScoreStatus()
          this.serveBall()
        } else if ((kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') && !other.plugin?.safety) {
          if (this.tryKickContactBody(other)) {
            if (kind === 'bumper') {
              this.triggerImpactShake('bumper')
              this.markBumperHit(other.plugin?.levelName)
            } else if (kind === 'player' || kind === 'goalkeeper') {
              this.triggerImpactShake(kind)
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
    const fieldBase = this.findObject('field_base_symmetrical')
      || this.objectsOfKind('field_base').find((object) => object.points)
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
    this.markStaticRenderDirty()
    this.setStatus(mode === 'play' ? 'Play Mode' : 'Edit Mode')
  }

  rebuildForMode() {
    this.applyGameViewport()
    if (this.mode === 'play') {
      this.rebuildPlayBodies()
    } else {
      this.clearPlayBodies()
    }
    this.markStaticRenderDirty()
  }

  rebuildPlayBodies() {
    this.clearPlayBodies()
    this.normalizeFlipperAnchors()
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
          sourcePoints: object.points,
          renderPoints: object.points,
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
            sourcePoints: object.points,
            renderPoints: object.points,
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
            sourcePoints: object.points,
            renderPoints: object.points,
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
    this.updateDebugVisibility(true)
    this.ballFrozen = null
    this.applyFreezeState()
    this.serveBall()
  }

  normalizeFlipperAnchors() {
    for (const object of this.level.objects) {
      if (object.kind !== 'flipper' || object.side !== 'left' || !object.pair) {
        continue
      }
      const pair = this.findObject(object.pair)
      if (!pair || pair.kind !== 'flipper') {
        continue
      }

      const anchorLeft = this.findObject(object.anchor)
      const anchorRight = this.findObject(pair.anchor)
      if (!anchorLeft?.point || !anchorRight?.point) {
        continue
      }

      const axis = Number.isFinite(object.mirrorAxis) ? object.mirrorAxis : this.level.width / 2
      anchorRight.point.x = axis + (axis - anchorLeft.point.x)
      anchorRight.point.y = anchorLeft.point.y
    }
  }

  triggerImpactShake(kind = 'impact') {
    const camera = this.cameras?.main
    if (!camera) {
      return
    }

    const now = this.time.now
    if (kind === 'goal') {
      if (now - this.lastGoalShakeAt < params.shakeGoalCooldownMs) {
        return
      }
      this.lastGoalShakeAt = now
      camera.shake(params.shakeGoalDurationMs, params.shakeGoalIntensity)
      return
    }

    if (now - this.lastImpactShakeAt < params.shakeImpactCooldownMs) {
      return
    }
    this.lastImpactShakeAt = now

    const preset = kind === 'flipper'
      ? { duration: params.shakeFlipperDurationMs, intensity: params.shakeFlipperIntensity }
      : kind === 'bumper'
        ? { duration: params.shakeBumperDurationMs, intensity: params.shakeBumperIntensity }
        : { duration: params.shakePlayerDurationMs, intensity: params.shakePlayerIntensity }

    camera.shake(preset.duration, preset.intensity)
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
    this.updateDebugVisibility(true)
    this.markStaticRenderDirty()
  }

  createPolygonBody(object, options) {
    return createMatterPolygonBody(this, object, options)
  }

  alignBodyToSourceBounds(body, sourcePoints) {
    alignMatterBodyToSourceBounds(body, sourcePoints)
  }

  getBodyBounds(body) {
    return getMatterBodyBounds(body)
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
    return createMatterEdgeLoop(this, object, thickness, options)
  }

  updateFlippers(delta) {
    updateFlipperSystem(this, delta)
  }

  updatePlayers() {
    updatePlayerSystem(this)
  }

  playerMovementOffset(state) {
    return getPlayerMovementOffset(this, state)
  }

  playerMovementArcY(phase) {
    return getPlayerMovementArcY(phase)
  }

  updateGoalkeeper(delta) {
    updateGoalkeeperSystem(this, delta)
  }

  updateBall(delta) {
    if (!this.ballBody) {
      return
    }

    if (this.servePending) {
      this.resetBallToSpawn()
      return
    }

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
    this.ballImpactSquash = Math.max(0, this.ballImpactSquash - (delta / 1000) * Math.max(0, params.ballSquashRecover))
    if (speed < 0.02) {
      return
    }

    this.ballImpactAngle = Math.atan2(velocity.y, velocity.x)
    const radius = Math.max(this.getBallRadius(), 1)
    const spinDirection = Math.abs(velocity.x) > 0.2 ? Math.sign(velocity.x) : Math.sign(velocity.y || 1)
    this.ballVisualAngle = Phaser.Math.Angle.Wrap(
      this.ballVisualAngle + spinDirection * (speed / radius) * delta * 0.018,
    )
  }

  markBallSquash(angle, amount = params.ballImpactSquash) {
    this.ballImpactAngle = angle
    this.ballImpactSquash = Math.max(this.ballImpactSquash, Math.max(0, amount))
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
    return getServeBallSpawn(this)
  }

  resetBallToSpawn() {
    resetServeBallToSpawn(this)
  }

  chooseLaunchVector() {
    return chooseServeLaunchVector()
  }

  serveBall() {
    serveBallSystem(this)
  }

  cancelPendingServe() {
    cancelPendingServeSystem(this)
  }

  applyLaunchImpulse(launch) {
    applyServeLaunchImpulse(this, launch)
  }

  createLaunchArrow(launch, lifetimeMs) {
    return createServeLaunchArrow(this, launch, lifetimeMs)
  }

  contactKickKey(body) {
    return getContactKickKey(body)
  }

  canKickContactBody(body) {
    return canKickContactBodySystem(this, body)
  }

  tryKickContactBody(body) {
    return tryKickContactBodySystem(this, body)
  }

  canKickFlipper(name) {
    return canKickFlipperSystem(this, name)
  }

  isFlipperHeld(name) {
    if (name.includes('_left_')) {
      return this.leftPressed || this.screenLeftPressed || this.keys.left.isDown || this.keys.a.isDown
    }
    return this.rightPressed || this.screenRightPressed || this.keys.right.isDown || this.keys.d.isDown
  }

  tryKickMovingFlipper(name) {
    return tryKickMovingFlipperSystem(this, name)
  }

  kickBallFromFlipper(state, motionScale) {
    kickBallFromContactFlipper(this, state, motionScale)
  }

  impulseForKind(kind) {
    return getImpulseForKind(kind)
  }

  getGoalBiasTarget() {
    return getContactGoalBiasTarget(this)
  }

  lowSpeedThresholdForKind(kind) {
    return getLowSpeedThresholdForKind(kind)
  }

  shouldApplyAntiStallKick(body) {
    return shouldApplyAntiStallKickSystem(this, body)
  }

  applyAntiStallKick(body) {
    applyAntiStallKickSystem(this, body)
  }

  kickBallFromBody(body, force, maxForce, options = {}) {
    kickBallFromContactBody(this, body, force, maxForce, options)
  }

  drawLevel() {
    drawRenderedLevel(this)
    this.drawEditOverlay()
  }

  updatePerfVisibility() {
    if (!this.perfOverlay) {
      return
    }
    this.perfOverlay.setEnabled(params.showPerfStats)
  }

  updatePerfStats(delta, visualDelta) {
    if (!this.perfOverlay) {
      return
    }
    const runner = this.matter.world.runner
    this.perfOverlay.update(params.showPerfStats, delta, visualDelta, {
      bodyCount: this.playBodies.length,
      debugOn: this.matter.world.drawDebug,
      deferredUpdates: runner.lastUpdatesDeferred || 0,
    })
  }

  markBumperHit(levelName) {
    markRenderedBumperHit(this, levelName)
  }

  markCharacterHit(levelName, kind) {
    markRenderedCharacterHit(this, levelName, kind)
  }

  drawEditOverlay() {
    drawEditSystemOverlay(this)
  }

  findObjectAt(point) {
    return findEditObjectAt(this, point)
  }

  findVertexHit(object, point) {
    return findEditVertexHit(this, object, point)
  }

  translateObject(object, dx, dy) {
    translateEditObject(object, dx, dy)
  }

  rotateSelected(degrees) {
    rotateEditSelection(this, degrees)
  }

  afterObjectEdit(object) {
    afterObjectEditSystem(this, object)
  }

  syncSharedSource(object) {
    syncEditSharedSource(this, object)
  }

  syncMirrorPair(object) {
    syncEditMirrorPair(this, object)
  }

  findObject(name) {
    return this.objectsByName.get(name)
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
    document.querySelector('#rotate-left').style.display = this.mode === 'edit' ? '' : 'none'
    document.querySelector('#rotate-right').style.display = this.mode === 'edit' ? '' : 'none'
  }

  setStatus(message) {
    document.querySelector('#status-line').textContent = message
  }

  updateSessionScoreStatus() {
    this.setStatus(`Goals this session: ${this.sessionGoals}`)
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
