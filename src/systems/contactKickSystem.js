import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { polygonCenter } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function contactKickKey(body) {
  return `${body.plugin?.kind || 'body'}:${body.plugin?.levelName || body.id}`
}

export function canKickContactBody(scene, body) {
  const key = contactKickKey(body)
  const lastKickAt = scene.lastContactKickAt.get(key) || -Infinity
  return scene.time.now - lastKickAt >= params.contactKickCooldownMs
}

export function tryKickContactBody(scene, body) {
  if (!canKickContactBody(scene, body)) {
    return false
  }

  const impulse = impulseForKind(body.plugin?.kind)
  scene.lastContactKickAt.set(contactKickKey(body), scene.time.now)
  kickBallFromBody(scene, body, impulse, impulse)
  return true
}

export function canKickFlipper(scene, name) {
  const lastKickAt = scene.lastFlipperKickAt.get(name) || -Infinity
  return scene.time.now - lastKickAt >= params.flipperKickCooldownMs
}

export function tryKickMovingFlipper(scene, name) {
  if (!scene.isFlipperHeld(name) || !canKickFlipper(scene, name)) {
    return false
  }

  const state = scene.flipperState.get(name)
  if (!state || state.swingKicked) {
    return false
  }

  const motion = Math.abs(state.lastAngleStep || 0)
  if (motion < params.flipperKickMinAngleStep) {
    return false
  }

  const motionScale = Phaser.Math.Clamp(motion / Math.max(params.flipperSpeed, 0.001), 0.2, 1)
  state.swingKicked = true
  scene.lastFlipperKickAt.set(name, scene.time.now)
  kickBallFromFlipper(scene, state, motionScale)
  scene.triggerImpactShake('flipper')
  return true
}

export function kickBallFromFlipper(scene, state, motionScale) {
  if (!scene.ballBody) {
    return
  }

  const rx = scene.ballBody.position.x - state.anchor.x
  const ry = scene.ballBody.position.y - state.anchor.y
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

  const goalCenter = getGoalBiasTarget(scene)
  const gx = goalCenter.x - scene.ballBody.position.x
  const gy = goalCenter.y - scene.ballBody.position.y
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

  scene.ballBody.force.x += nx * forceKick
  scene.ballBody.force.y += ny * forceKick
  MatterBody.setVelocity(scene.ballBody, {
    x: scene.ballBody.velocity.x + nx * velocityKick,
    y: scene.ballBody.velocity.y + ny * velocityKick,
  })
  scene.markBallSquash(Math.atan2(ny, nx), params.ballImpactSquash * 1.15)
  scene.clampBallVelocity()
}

export function impulseForKind(kind) {
  if (kind === 'player') {
    return params.playerImpulse
  }
  if (kind === 'goalkeeper') {
    return params.goalkeeperImpulse
  }
  return params.bumperImpulse
}

export function getGoalBiasTarget(scene) {
  const goalSensor = scene.objectsOfKind('sensor_goal').find((object) => object.points?.length >= 3)
  if (goalSensor) {
    return polygonCenter(goalSensor.points)
  }
  return { x: scene.level.width * 0.5, y: scene.level.height * 0.2 }
}

export function lowSpeedThresholdForKind(kind) {
  if (kind === 'player') {
    return params.playerLowSpeedThreshold
  }
  if (kind === 'goalkeeper') {
    return params.goalkeeperLowSpeedThreshold
  }
  return params.bumperLowSpeedThreshold
}

export function shouldApplyAntiStallKick(scene, body) {
  if (!scene.ballBody || !body || body.plugin?.safety) {
    return false
  }

  const kind = body.plugin?.kind
  if (kind !== 'bumper' && kind !== 'player' && kind !== 'goalkeeper') {
    return false
  }

  const speed = Math.hypot(scene.ballBody.velocity.x, scene.ballBody.velocity.y)
  if (speed >= lowSpeedThresholdForKind(kind)) {
    return false
  }

  const key = body.plugin?.levelName || body.id
  if (!canKickContactBody(scene, body)) {
    return false
  }

  const lastKickAt = scene.lastAntiStallKickAt.get(key) || -Infinity
  return scene.time.now - lastKickAt >= params.contactAntiStallCooldownMs
}

export function applyAntiStallKick(scene, body) {
  const kind = body.plugin?.kind
  const key = body.plugin?.levelName || body.id
  const impulse = impulseForKind(kind) * Math.max(0, params.contactAntiStallKickScale)
  scene.lastAntiStallKickAt.set(key, scene.time.now)
  scene.lastContactKickAt.set(contactKickKey(body), scene.time.now)
  kickBallFromBody(scene, body, impulse, impulse)
}

export function kickBallFromBody(scene, body, force, maxForce, options = {}) {
  if (!scene.ballBody) {
    return
  }
  const dx = scene.ballBody.position.x - body.position.x
  const dy = scene.ballBody.position.y - body.position.y
  const distance = Math.max(Math.hypot(dx, dy), 1)
  if (distance > 100) {
    return
  }

  const cappedForce = Math.min(force, maxForce)
  let nx = dx / distance
  let ny = dy / distance

  const kind = body.plugin?.kind
  if (kind === 'bumper' && params.bumperGoalBias > 0) {
    const goalCenter = getGoalBiasTarget(scene)
    const gx = goalCenter.x - scene.ballBody.position.x
    const gy = goalCenter.y - scene.ballBody.position.y
    const goalLength = Math.max(Math.hypot(gx, gy), 1)
    const bias = Phaser.Math.Clamp(params.bumperGoalBias, 0, 0.95)
    nx = nx * (1 - bias) + (gx / goalLength) * bias
    ny = ny * (1 - bias) + (gy / goalLength) * bias
    const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
    nx /= normalizedLength
    ny /= normalizedLength
  }

  if (kind === 'flipper' && params.flipperGoalBias > 0) {
    const goalCenter = getGoalBiasTarget(scene)
    const gx = goalCenter.x - scene.ballBody.position.x
    const gy = goalCenter.y - scene.ballBody.position.y
    const goalLength = Math.max(Math.hypot(gx, gy), 1)
    const bias = Phaser.Math.Clamp(params.flipperGoalBias, 0, 0.95)
    nx = nx * (1 - bias) + (gx / goalLength) * bias
    ny = ny * (1 - bias) + (gy / goalLength) * bias
    const normalizedLength = Math.max(Math.hypot(nx, ny), 1)
    nx /= normalizedLength
    ny /= normalizedLength
  }

  if (kind === 'goalkeeper' && params.goalkeeperGoalAvoidBias > 0) {
    const goalCenter = getGoalBiasTarget(scene)
    const awayX = scene.ballBody.position.x - goalCenter.x
    const awayY = scene.ballBody.position.y - goalCenter.y
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
    scene.ballBody.force.x += nx * cappedForce
    scene.ballBody.force.y += ny * cappedForce
    MatterBody.setVelocity(scene.ballBody, {
      x: scene.ballBody.velocity.x + nx * velocityKick,
      y: scene.ballBody.velocity.y + ny * velocityKick,
    })
    scene.markBallSquash(Math.atan2(ny, nx))
  } else if (kind === 'bumper' || kind === 'player' || kind === 'goalkeeper') {
    const speed = Math.hypot(scene.ballBody.velocity.x, scene.ballBody.velocity.y)
    const lowSpeedThreshold = Math.max(
      0.5,
      lowSpeedThresholdForKind(kind),
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
    scene.ballBody.force.x += nx * boostedForce
    scene.ballBody.force.y += ny * boostedForce
    MatterBody.setVelocity(scene.ballBody, {
      x: scene.ballBody.velocity.x + nx * velocityKick,
      y: scene.ballBody.velocity.y + ny * velocityKick,
    })
    scene.markBallSquash(Math.atan2(ny, nx))
  } else {
    scene.ballBody.force.x += nx * cappedForce
    scene.ballBody.force.y += ny * cappedForce
  }
  scene.clampBallVelocity()
}
