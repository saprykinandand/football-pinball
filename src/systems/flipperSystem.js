import Phaser from 'phaser'
import { ENGINE_PHYSICS_DEFAULTS } from '../config/physicsTuning.js'
import { params } from '../config/runtimeParams.js'
import { rotatePoint } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function updateFlippers(scene, delta) {
  const baseFrameMs = 1000 / ENGINE_PHYSICS_DEFAULTS.runnerFps
  const frameScale = Phaser.Math.Clamp(delta / baseFrameMs, 0.6, 2.4)
  const maxStep = params.flipperSpeed * frameScale

  for (const [name, state] of scene.flipperState) {
    const held = scene.isFlipperHeld(name)
    if (!held) {
      state.swingKicked = false
    }
    const targetAngle = held ? state.activeAngle : 0
    const delta = Phaser.Math.Angle.Wrap(targetAngle - state.currentAngle)
    const angleStep = Phaser.Math.Clamp(delta, -maxStep, maxStep)
    state.lastAngleStep = angleStep
    state.currentAngle += angleStep
    state.renderPoints = state.sourcePoints.map((point) => rotatePoint(point, state.anchor, state.currentAngle))
    const nextPosition = rotatePoint(state.basePosition, state.anchor, state.currentAngle)
    MatterBody.setPosition(state.body, nextPosition)
    MatterBody.setAngle(state.body, state.baseAngle + state.currentAngle)
    for (const safety of state.safetyBodies) {
      MatterBody.setPosition(safety.body, rotatePoint(safety.basePosition, state.anchor, state.currentAngle))
      MatterBody.setAngle(safety.body, safety.baseAngle + state.currentAngle)
    }

    const movingIntoBall = held && Math.abs(angleStep) >= params.flipperKickMinAngleStep
    if (movingIntoBall && scene.activeFlipperContacts.has(name)) {
      scene.tryKickMovingFlipper(name)
    }
  }
}
