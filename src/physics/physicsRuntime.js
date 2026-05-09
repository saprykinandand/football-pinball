import Phaser from 'phaser'
import { ENGINE_PHYSICS_DEFAULTS } from '../config/physicsTuning.js'
import { params } from '../config/runtimeParams.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function applySolverTuning(scene) {
  const engine = scene.matter.world.engine
  engine.positionIterations = ENGINE_PHYSICS_DEFAULTS.positionIterations
  engine.velocityIterations = ENGINE_PHYSICS_DEFAULTS.velocityIterations
  engine.constraintIterations = ENGINE_PHYSICS_DEFAULTS.constraintIterations
}

export function applyBodyTuning(scene) {
  for (const body of scene.playBodies) {
    const kind = body.plugin?.kind
    if (body.plugin?.safety) {
      setBodyRestitution(body, safetyRestitutionFor(kind))
      continue
    }
    if (kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') {
      setBodyRestitution(body, params.bumperRestitution)
    } else if (kind === 'field_base' || kind === 'field_collision' || kind === 'goal_collision') {
      setBodyRestitution(body, params.wallRestitution)
    }
  }
}

export function applyFreezeState(scene) {
  if (!scene.ballBody || scene.ballFrozen === params.freezePhysics) {
    return
  }

  scene.ballFrozen = params.freezePhysics
  MatterBody.setStatic(scene.ballBody, params.freezePhysics)
  if (!params.freezePhysics) {
    applyBallMaterialTuning(scene)
  }
}

export function applyBallMaterialTuning(scene) {
  if (!scene.ballBody) {
    return
  }
  scene.ballBody.restitution = params.ballRestitution
  scene.ballBody.friction = params.ballFriction
  scene.ballBody.frictionAir = params.ballFrictionAir
  if (Number.isFinite(params.ballDensity) && params.ballDensity > 0 && scene.ballBody.density !== params.ballDensity) {
    MatterBody.setDensity(scene.ballBody, params.ballDensity)
  }
}

export function freezeBall(scene) {
  applyFreezeState(scene)
  if (!scene.ballBody) {
    return
  }
  MatterBody.setVelocity(scene.ballBody, { x: 0, y: 0 })
  MatterBody.setAngularVelocity(scene.ballBody, 0)
}

export function setBodyRestitution(body, restitution) {
  const parts = body.parts?.length ? body.parts : [body]
  for (const part of parts) {
    part.restitution = restitution
  }
  body.restitution = restitution
}

export function safetyRestitutionFor(kind) {
  if (kind === 'field_base' || kind === 'field_collision' || kind === 'goal_collision') {
    return params.wallRestitution
  }
  return Math.min(params.wallRestitution, 0.5)
}

export function updateDebugVisibility(scene, force = false) {
  const shouldDrawDebug = Boolean(params.debugMatterEnabled || params.showMatterBodies || params.showSafetyBodies)
  const key = [
    shouldDrawDebug,
    params.showMatterBodies,
    params.showSafetyBodies,
    scene.playBodies.length,
  ].join(':')
  if (!force && key === scene.debugVisibilityKey) {
    return
  }
  scene.debugVisibilityKey = key

  if (shouldDrawDebug && !scene.matter.world.debugGraphic) {
    scene.matter.world.createDebugGraphic()
  }

  scene.matter.world.drawDebug = shouldDrawDebug
  if (scene.matter.world.debugGraphic) {
    scene.matter.world.debugGraphic.visible = shouldDrawDebug
    if (!shouldDrawDebug) {
      scene.matter.world.debugGraphic.clear()
    }
  }

  for (const body of scene.playBodies) {
    const isSafety = Boolean(body.plugin?.safety)
    setBodyDebugVisible(body, shouldDrawDebug && (isSafety ? params.showSafetyBodies : params.showMatterBodies))
  }
}

export function setBodyDebugVisible(body, visible) {
  const parts = body.parts?.length ? body.parts : [body]
  for (const part of parts) {
    part.render.visible = visible
  }
  body.render.visible = visible
}
