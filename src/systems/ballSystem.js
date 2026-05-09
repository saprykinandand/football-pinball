import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body
const LAUNCH_BUTTON_IMPULSE_Y = 0.012

export function getBallRadius(scene) {
  return Math.max(scene.level.ball.radius || 0, params.ballRadius)
}

export function createBallBody(scene, spawn) {
  const ballRadius = getBallRadius(scene)
  scene.ballBody = scene.matter.add.circle(spawn.x, spawn.y, ballRadius, {
    label: 'ball',
    restitution: params.ballRestitution,
    friction: params.ballFriction,
    frictionAir: params.ballFrictionAir,
    density: params.ballDensity,
    slop: 0.02,
  })
  scene.ballBody.circleRadius = ballRadius
  scene.playBodies.push(scene.ballBody)
  scene.applyBallMaterialTuning()
}

export function rebuildBallBody(scene) {
  if (!scene.ballBody) {
    return
  }
  scene.cancelPendingServe()
  scene.matter.world.remove(scene.ballBody, true)
  scene.playBodies = scene.playBodies.filter((body) => body !== scene.ballBody)
  scene.ballBody = null
  scene.ballFrozen = null
  createBallBody(scene, scene.getBallSpawn())
  scene.applyFreezeState()
  scene.serveBall()
}

export function updateBall(scene, delta) {
  if (!scene.ballBody) {
    return
  }

  if (scene.servePending) {
    scene.resetBallToSpawn()
    return
  }

  updateBallVisualSpin(scene, delta)

  if (scene.keys.space.isDown && scene.ballBody.position.y > scene.level.height - 190) {
    scene.ballBody.force.y -= LAUNCH_BUTTON_IMPULSE_Y
  }

  clampBallVelocity(scene)

  const margin = getBallRadius(scene) * 5
  if (
    scene.ballBody.position.x < -margin
    || scene.ballBody.position.x > scene.level.width + margin
    || scene.ballBody.position.y < -margin
    || scene.ballBody.position.y > scene.level.height + margin
  ) {
    scene.serveBall()
  }
}

export function updateBallVisualSpin(scene, delta) {
  const velocity = scene.ballBody.velocity
  const speed = Math.hypot(velocity.x, velocity.y)
  scene.ballImpactSquash = Math.max(0, scene.ballImpactSquash - (delta / 1000) * Math.max(0, params.ballSquashRecover))
  if (speed < 0.02) {
    return
  }

  scene.ballImpactAngle = Math.atan2(velocity.y, velocity.x)
  const radius = Math.max(getBallRadius(scene), 1)
  const spinDirection = Math.abs(velocity.x) > 0.2 ? Math.sign(velocity.x) : Math.sign(velocity.y || 1)
  scene.ballVisualAngle = Phaser.Math.Angle.Wrap(
    scene.ballVisualAngle + spinDirection * (speed / radius) * delta * 0.018,
  )
}

export function markBallSquash(scene, angle, amount = params.ballImpactSquash) {
  scene.ballImpactAngle = angle
  scene.ballImpactSquash = Math.max(scene.ballImpactSquash, Math.max(0, amount))
}

export function clampBallVelocity(scene) {
  const velocity = scene.ballBody.velocity
  const speed = Math.hypot(velocity.x, velocity.y)
  if (speed <= params.maxBallSpeed) {
    return
  }

  const scale = params.maxBallSpeed / speed
  MatterBody.setVelocity(scene.ballBody, {
    x: velocity.x * scale,
    y: velocity.y * scale,
  })
}
