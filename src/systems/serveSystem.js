import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { defaultBallSpawn } from '../level/levelStore.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function getBallSpawn(scene) {
  const marker = scene.findObject('ball_spawn')
  const source = marker?.point || scene.level.ball?.spawn || defaultBallSpawn(scene.level)
  const spawn = {
    x: Number(source.x),
    y: Number(source.y),
  }

  scene.level.ball = scene.level.ball || {}
  scene.level.ball.spawn = spawn
  if (marker) {
    marker.point = { ...spawn }
  }

  return spawn
}

export function resetBallToSpawn(scene) {
  if (!scene.ballBody) {
    return
  }
  const spawn = getBallSpawn(scene)
  scene.activeFlipperContacts.clear()
  MatterBody.setPosition(scene.ballBody, spawn)
  MatterBody.setVelocity(scene.ballBody, { x: 0, y: 0 })
  MatterBody.setAngularVelocity(scene.ballBody, 0)
  scene.ballVisualAngle = 0
  scene.ballImpactSquash = 0
  scene.ballImpactAngle = 0
}

export function chooseLaunchVector() {
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

export function serveBall(scene) {
  if (!scene.ballBody) {
    return
  }

  cancelPendingServe(scene)
  resetBallToSpawn(scene)

  const launch = chooseLaunchVector()
  scene.lastLaunch = launch
  scene.servePending = true
  scene.launchArrow = params.showLaunchArrow ? createLaunchArrow(scene, launch, params.launchDelayMs + 900) : null
  console.info('Serve Ball', {
    force: Number(launch.force.toFixed(4)),
    launchX: Number(launch.launchX.toFixed(4)),
  })

  scene.serveTimer = scene.time.delayedCall(params.launchDelayMs, () => {
    scene.serveTimer = null
    scene.servePending = false
    applyLaunchImpulse(scene, launch)
  })
}

export function cancelPendingServe(scene) {
  if (scene.serveTimer) {
    scene.serveTimer.remove(false)
    scene.serveTimer = null
  }
  scene.servePending = false
}

export function applyLaunchImpulse(scene, launch) {
  if (!scene.ballBody) {
    return
  }

  resetBallToSpawn(scene)
  if (params.freezePhysics) {
    scene.updateSessionScoreStatus()
    return
  }

  MatterBody.applyForce(scene.ballBody, scene.ballBody.position, {
    x: launch.vector.x * launch.force,
    y: launch.vector.y * launch.force,
  })
  scene.clampBallVelocity()
  scene.updateSessionScoreStatus()
}

export function createLaunchArrow(scene, launch, lifetimeMs) {
  const start = getBallSpawn(scene)
  const length = 78 + launch.force * 1800
  return {
    start,
    end: {
      x: start.x + launch.vector.x * length,
      y: start.y + launch.vector.y * length,
    },
    expiresAt: scene.time.now + lifetimeMs,
  }
}
